"use server";
import OpenAI, { toFile } from "openai";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { redirect } from "next/navigation";
import { withStore } from "./store-session";
import { PARTNER_PACKAGE_IMAGE_LIMIT } from "./partner-limits";
import { bounce } from "./action-error";
import { flash } from "./flash";

const store = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
const BUCKET = () => process.env.S3_BUCKET || "closet-private";
const PAGE = "/provador";
const MODEL_KINDS = ["MINHA_FOTO", "MODELO", "MANEQUIM"] as const;
type ModelKind = typeof MODEL_KINDS[number];

async function readObject(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const ch of await store.getObject(BUCKET(), key) as any) chunks.push(Buffer.from(ch));
  return Buffer.concat(chunks);
}

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
/** "Modelo aleatória": sorteia aparência a cada geração, sem identidade real de ninguém. */
function randomModelDescription(): string {
  const tom = pick(["pele clara", "pele morena clara", "pele morena", "pele negra", "pele parda"]);
  const cabelo = pick(["cabelo castanho liso na altura dos ombros", "cabelo cacheado volumoso", "cabelo preto longo", "cabelo curto estilo chanel", "cabelo loiro ondulado", "cabelo crespo natural"]);
  const porte = pick(["porte médio", "porte curvilíneo", "porte esguio", "porte atlético"]);
  return `${tom}, ${cabelo}, ${porte}`;
}

/** Gera uma imagem com as peças escolhidas da loja, vestidas numa modelo/manequim -- 3 fases
 * (lê no banco -> IA sem conexão presa -> grava), como o resto das gerações do app. */
export async function generateProvadorLook(f: FormData) {
  const itemIds = Array.from(new Set(f.getAll("items").map(String))).filter((v) => /^[0-9a-f-]{36}$/i.test(v));
  const modelKind = String(f.get("model_kind") || "") as ModelKind;
  if (!MODEL_KINDS.includes(modelKind)) bounce(PAGE, "Escolha como quer ver as peças: com a sua foto, modelo aleatória ou manequim.");
  if (itemIds.length < 1) bounce(PAGE, "Escolha pelo menos 1 peça da sua loja.");
  if (itemIds.length > 4) bounce(PAGE, "Escolha no máximo 4 peças por imagem.");
  if (!process.env.OPENAI_API_KEY) bounce(PAGE, "A geração de imagens não está disponível no momento.");

  // Fase 1: confere loja ativa e limite do pacote; junta referências (fotos das peças e, se pedido, a foto dela).
  const prep = await withStore(async (c, _userId, partnerId) => {
    const me = (await c.query("SELECT * FROM partner_me($1)", [partnerId])).rows[0];
    if (!me?.live) bounce(PAGE, "O Provador é liberado depois que a loja é aprovada e o pacote está ativo.");
    const limit = PARTNER_PACKAGE_IMAGE_LIMIT[me.package] ?? 0;
    const used = Number((await c.query("SELECT partner_provador_count_month($1) n", [partnerId])).rows[0]?.n || 0);
    if (used >= limit) bounce(PAGE, `Seu pacote permite ${limit} imagens por mês no Provador e esse limite já foi usado. Fale com a equipe para fazer upgrade.`);
    const items = (await c.query("SELECT * FROM partner_items_for_provador($1,$2::uuid[])", [partnerId, itemIds])).rows as { id: string; name: string; description: string; object_key: string; content_type: string }[];
    if (items.length !== itemIds.length) bounce(PAGE, "Alguma peça escolhida está sem foto ou não é da sua loja. O Provador precisa da foto de cada peça.");
    let likeness: { key: string; type: string } | null = null;
    if (modelKind === "MINHA_FOTO") {
      const body = (await c.query("SELECT body_photo_object_key, body_photo_content_type FROM profiles WHERE user_id=(SELECT user_id FROM partners WHERE id=$1)", [partnerId])).rows[0];
      if (!body?.body_photo_object_key) bounce(PAGE, "Para usar a sua foto, envie primeiro uma foto de corpo inteiro em Perfil → Meu avatar de estilo.");
      likeness = { key: body.body_photo_object_key, type: body.body_photo_content_type || "image/jpeg" };
    }
    return { partnerId, items, likeness };
  });
  if (!prep) redirect("/");

  // Fase 2: IA (sem nenhuma conexão do banco aberta).
  const names = prep.items.map((i) => i.name).join(", ");
  const semInvencao =
    `IMPORTANTE, siga rigorosamente: ela veste SOMENTE estas peças, nada além disso: ${prep.items.map((i) => `${i.name}${i.description ? ` (${i.description})` : ""}`).join("; ")}. ` +
    `Cada peça deve aparecer EXATAMENTE como na foto de referência dela (mesma cor, tecido, corte e estampa), sem inventar variação. NÃO adicione peças extras de destaque (blazer, casaco, lenço, cinto chamativo); para o que não foi listado (ex.: sapato), use algo básico, neutro e discreto. ` +
    `Fundo neutro claro, sem texto, sem logotipo e sem marca d'água na imagem.`;
  let prompt: string;
  if (modelKind === "MINHA_FOTO") {
    prompt = `Fotografia de moda realista, aparência fotográfica (NÃO desenho, NÃO ilustração). Use a primeira imagem de referência para manter o mesmo rosto, tom de pele e aparência da pessoa nela (é uma foto real dela, autorizada por ela mesma), de corpo inteiro, iluminação natural de estúdio, vestindo: ${names}. ${semInvencao}`;
  } else if (modelKind === "MODELO") {
    prompt = `Fotografia de moda realista, aparência fotográfica (NÃO desenho, NÃO ilustração), modelo adulta fictícia de corpo inteiro (${randomModelDescription()}), sem identidade real de nenhuma pessoa, iluminação natural de estúdio, vestindo: ${names}. ${semInvencao}`;
  } else {
    prompt = `Fotografia de vitrine de loja de moda: manequim de loja elegante, sem rosto, corpo estilizado em tom neutro, de corpo inteiro, iluminação suave de vitrine, vestindo: ${names}. ${semInvencao}`;
  }
  let buf: Buffer | null = null;
  try {
    const refs: { key: string; type: string }[] = [];
    if (prep.likeness) refs.push(prep.likeness);
    for (const i of prep.items) refs.push({ key: i.object_key, type: i.content_type || "image/jpeg" });
    const files = await Promise.all(refs.map(async (r, i) => toFile(await readObject(r.key), `ref-${i}.png`, { type: r.type })));
    const img = await new OpenAI({ timeout: 120000 }).images.edit({ model: "gpt-image-2.5-sunburst", image: files, size: "1024x1024", quality: "medium", prompt: `${prep.likeness ? "" : "Use estas fotos reais das peças da loja como referência de cor, textura e caimento. "}${prompt}` });
    const b64 = img.data?.[0]?.b64_json;
    if (b64) buf = Buffer.from(b64, "base64");
  } catch (e) { console.error("generateProvadorLook IA falhou:", e); }
  if (!buf) bounce(PAGE, "Não foi possível gerar a imagem agora (sem créditos ou fora do ar). Tente de novo mais tarde.");

  // Fase 3: guarda a imagem e registra o uso.
  const key = `partners/provador/${prep.partnerId}/${randomUUID()}.png`;
  try { await store.putObject(BUCKET(), key, buf, buf.length, { "Content-Type": "image/png" }); }
  catch (e) { console.error("generateProvadorLook putObject falhou:", e); bounce(PAGE, "Não foi possível salvar a imagem gerada agora. Tente de novo em instantes."); }
  const ok = await withStore(async (c, userId, partnerId) => {
    await c.query("SELECT partner_add_provador_look($1,$2::uuid[],$3,$4,$5,'image/png')", [partnerId, itemIds, names.slice(0, 300), modelKind, key]);
    await c.query("SELECT log_image_generation($1,current_setting('app.tenant_id')::uuid)", [userId]);
    return true;
  });
  if (!ok) redirect("/");
  await flash("Imagem pronta! Veja abaixo no seu Provador.");
  redirect(PAGE);
}

export async function deleteProvadorLook(f: FormData) {
  const id = String(f.get("look_id") || "");
  const key = await withStore(async (c, _userId, partnerId) => {
    const r = await c.query("SELECT partner_delete_provador_look($1,$2) k", [partnerId, id]);
    return (r.rows[0]?.k as string | null) || null;
  });
  if (key) { try { await store.removeObject(BUCKET(), key); } catch { /* objeto órfão é inofensivo */ } }
  await flash("Imagem removida do Provador.", "info");
  redirect(PAGE);
}
