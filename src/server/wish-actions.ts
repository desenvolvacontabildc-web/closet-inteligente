"use server";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { flash } from "./flash";
import { parseAiJson } from "./ai-json";
import { bumpAndCheckAiUsage, checkImageAllowance, consumeImageAllowance } from "./limits";
import { closetKindC, closetNote, closetImageNote } from "./closet-type";

const store = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
const UUID = /^[0-9a-f-]{36}$/i;
const BACK = "/looks/comprar";
const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

type Piece = { source: "CLOSET" | "BUY"; item_id?: string; name: string; category: string; color: string; why: string; bought?: boolean };

/** Gera looks com peças que a usuária talvez ainda não tenha. Dois jeitos:
 *  ZERO: só a ocasião (e o gosto) -> a IA monta o look todo e diz o que comprar;
 *  PECA: ela escolhe uma peça (do closet) ou descreve uma -> a IA sugere as demais.
 * Aproveita as peças do closet quando combinam (marcadas "já tem") e marca o resto como "comprar". Conta como 1 operação de IA. */
export async function generateWishLooks(f: FormData) {
  const mode = String(f.get("mode") || "ZERO") === "PECA" ? "PECA" : "ZERO";
  const occasion = clip(f.get("occasion"), 140);
  const vibe = clip(f.get("vibe"), 140);
  const budget = clip(f.get("budget"), 60);
  const baseId = String(f.get("base_item_id") || "");
  const baseText = clip(f.get("base_text"), 140);
  const useCloset = f.get("use_closet") === "on";
  const fields = { occasion, vibe, budget, base_text: baseText };
  if (mode === "PECA" && !UUID.test(baseId) && !baseText) bounce(BACK, "Escolha uma peça do seu closet ou descreva a peça que você já tem.", fields);
  if (mode === "ZERO" && !occasion) bounce(BACK, "Conte para qual ocasião você quer o look (por exemplo, trabalho, jantar ou viagem).", fields);

  const ctx = await withProfile(async (c, userId) => {
    if (!process.env.OPENAI_API_KEY) return { ok: false as const, message: "Sugestão por IA não configurada." };
    const budgetCheck = await bumpAndCheckAiUsage(c, userId);
    if (!budgetCheck.ok) return { ok: false as const, message: budgetCheck.message || "Limite de operações de IA atingido." };
    const items = (await c.query("SELECT id,name,category,color FROM closet_items WHERE status='ACTIVE' ORDER BY created_at DESC LIMIT 150")).rows as { id: string; name: string; category: string; color: string }[];
    let base: { id: string; name: string; category: string; color: string } | null = null;
    if (mode === "PECA" && UUID.test(baseId)) {
      base = items.find((i) => i.id === baseId) || ((await c.query("SELECT id,name,category,color FROM closet_items WHERE id=$1", [baseId])).rows[0] ?? null);
    }
    const city = String((await c.query("SELECT city FROM profiles WHERE user_id=$1", [userId])).rows[0]?.city || "").trim();
    return { ok: true as const, items, base, city, note: closetNote(await closetKindC(c, userId)) };
  });
  if (!ctx) redirect("/");
  if (!ctx.ok) bounce(BACK, ctx.message, fields);
  if (mode === "PECA" && !ctx.base && !baseText) bounce(BACK, "Não encontrei essa peça no seu closet. Escolha outra ou descreva a peça.", fields);

  const baseDesc = ctx.base ? `${ctx.base.name} (${ctx.base.category}${ctx.base.color ? `, ${ctx.base.color}` : ""})` : baseText;
  const closetList = useCloset ? ctx.items.map((i) => ({ id: i.id, name: i.name, category: i.category, color: i.color })) : [];
  const prompt =
    `Você é uma consultora de imagem (personal stylist).${ctx.note} A cliente quer ideias de look que incluam peças que ELA TALVEZ AINDA NÃO TENHA, para saber o que vale comprar.\n` +
    (mode === "PECA" ? `Peça que ela já tem e quer usar como ponto de partida (TODOS os looks devem incluir exatamente esta peça): ${baseDesc}.\n` : "") +
    `Ocasião: ${occasion || "uso no dia a dia"}.${vibe ? ` Estilo desejado: ${vibe}.` : ""}${budget ? ` Orçamento: ${budget}.` : ""}${ctx.city ? ` Cidade: ${ctx.city}.` : ""}\n` +
    (closetList.length ? `Peças que ela já tem no closet (pode reaproveitar quando combinarem de verdade; use o id exato): ${JSON.stringify(closetList)}\n` : "Considere que ela ainda não tem peças cadastradas: todas as peças são sugestões de compra, exceto a peça de partida, se houver.\n") +
    `Monte 3 looks bem diferentes entre si, completos (parte de cima, de baixo ou vestido, calçado e, se fizer sentido, bolsa ou acessório simples). ` +
    `Para cada peça diga se é "CLOSET" (já tem, com item_id da lista) ou "BUY" (comprar): em BUY descreva de forma específica e fácil de achar numa loja (tipo, cor, modelagem e tecido, por exemplo "calça de alfaiataria off-white, cintura alta, perna reta"). ` +
    `Prefira peças versáteis e atemporais que rendam vários looks, e no máximo 4 peças BUY por look. Em "why" explique em uma frase curta por que a peça funciona no look. ` +
    `Responda apenas JSON: {"looks":[{"name":"nome curto","occasion":"descrição curta","tip":"dica de estilo em 1 frase","pieces":[{"source":"CLOSET|BUY","item_id":"id ou vazio","name":"...","category":"blusa|calça|saia|vestido|casaco|sapato|bolsa|acessório|outro","color":"...","why":"..."}]}]}.`;

  let parsed: any = null;
  try {
    const out = await new OpenAI({ timeout: 90000 }).responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    });
    parsed = parseAiJson(out.output_text);
  } catch (e) {
    console.error("generateWishLooks falhou (IA):", e);
    bounce(BACK, "A IA está indisponível no momento. Tente de novo em instantes.", fields);
  }
  const rawLooks: any[] = Array.isArray(parsed?.looks) ? parsed.looks : [];
  const valid = new Map(ctx.items.map((i) => [i.id, i]));
  const looks = rawLooks.slice(0, 3).map((l) => {
    const pieces: Piece[] = (Array.isArray(l?.pieces) ? l.pieces : []).slice(0, 8).map((p: any): Piece | null => {
      const name = clip(p?.name, 90); if (!name) return null;
      const owned = String(p?.source) === "CLOSET" && valid.has(String(p?.item_id));
      const it = owned ? valid.get(String(p.item_id))! : null;
      return { source: owned ? "CLOSET" : "BUY", ...(it ? { item_id: it.id } : {}), name: it ? it.name : name, category: clip(it ? it.category : p?.category, 30) || "outro", color: clip(it ? it.color : p?.color, 40), why: clip(p?.why, 160) };
    }).filter(Boolean) as Piece[];
    // Peça de partida do closet sempre presente (a IA às vezes esquece).
    if (ctx.base && !pieces.some((p) => p.item_id === ctx.base!.id)) pieces.unshift({ source: "CLOSET", item_id: ctx.base.id, name: ctx.base.name, category: ctx.base.category || "outro", color: ctx.base.color || "", why: "Peça de partida do look." });
    return { name: clip(l?.name, 70) || "Look sugerido", occasion: clip(l?.occasion, 120) || occasion, tip: clip(l?.tip, 220), pieces };
  }).filter((l) => l.pieces.length >= 2);
  if (looks.length === 0) bounce(BACK, "Não consegui montar looks com esse pedido. Tente descrever a ocasião de outro jeito.", fields);

  const batch = randomUUID();
  const saved = await withProfile(async (c, userId) => {
    for (const l of looks) {
      await c.query("INSERT INTO wish_looks(tenant_id,user_id,batch_id,name,occasion,mode,pieces,tip) VALUES(current_setting('app.tenant_id')::uuid,$1,$2,$3,$4,$5,$6::jsonb,$7)",
        [userId, batch, l.name, l.occasion, mode, JSON.stringify(l.pieces), l.tip]);
    }
    return true;
  });
  if (!saved) redirect("/");
  await flash(`${looks.length} look${looks.length === 1 ? "" : "s"} pronto${looks.length === 1 ? "" : "s"}! Veja o que vale comprar em cada um.`);
  redirect(`${BACK}?lote=${batch}`);
}

/** Marca (ou desmarca) uma peça da lista como "comprei". */
export async function toggleWishBought(f: FormData) {
  const id = String(f.get("id") || ""); const idx = Number(f.get("idx")); const back = /^\/looks\/comprar(\?lote=[0-9a-f-]{36})?$/i.test(String(f.get("back") || "")) ? String(f.get("back")) : BACK;
  if (UUID.test(id) && Number.isInteger(idx) && idx >= 0 && idx < 12) {
    await withProfile(async (c) => {
      await c.query("UPDATE wish_looks SET pieces = jsonb_set(pieces, ARRAY[$2::text,'bought'], to_jsonb(NOT COALESCE((pieces->($2::text)::int->>'bought')::boolean, false))) WHERE id=$1 AND jsonb_array_length(pieces) > ($2::text)::int", [id, String(idx)]);
      return true;
    });
  }
  redirect(back);
}

export async function deleteWishLook(f: FormData) {
  const id = String(f.get("id") || "");
  if (UUID.test(id)) await withProfile(async (c) => { await c.query("DELETE FROM wish_looks WHERE id=$1", [id]); return true; });
  await flash("Look removido.");
  redirect(BACK);
}

/** Ilustração do look de compra (pelas descrições das peças). Consome 1 geração de imagem do plano, como os outros looks em imagem. */
export async function generateWishLookImage(f: FormData) {
  const id = String(f.get("id") || "");
  if (!UUID.test(id)) bounce(BACK, "Look inválido.");
  const prep = await withProfile(async (c, userId) => {
    const allowance = await checkImageAllowance(c, userId);
    if (!allowance.ok) bounce(BACK, allowance.message || "Limite de gerações de imagem atingido.");
    const row = (await c.query("SELECT name, occasion, pieces FROM wish_looks WHERE id=$1", [id])).rows[0];
    if (!row) bounce(BACK, "Look não encontrado.");
    const desc = (row.pieces as Piece[]).map((p) => `${p.name}${p.color && !p.name.toLowerCase().includes(p.color.toLowerCase()) ? ` (${p.color})` : ""}`).join(", ");
    return { source: allowance.source, desc, occasion: String(row.occasion || ""), note: closetImageNote(await closetKindC(c, userId)) };
  });
  if (!prep) redirect("/");

  const prompt = `${prep.note}Ilustração editorial de moda, estilo croqui/silhueta estilizada, figura genérica de moda, sem rosto detalhado e sem identidade real de nenhuma pessoa. Vestindo esta combinação completa${prep.occasion ? ` para ${prep.occasion}` : ""}: ${prep.desc}. Mostre exatamente estas peças, com as cores descritas, sem adicionar nenhuma peça extra de destaque. Fundo neutro claro, traço elegante, sem texto na imagem.`;
  let buf: Buffer | null = null;
  try {
    const img = await new OpenAI({ timeout: 120000 }).images.generate({ model: "gpt-image-2.5-flare", size: "1024x1024", quality: "medium", prompt });
    const b64 = img.data?.[0]?.b64_json; if (b64) buf = Buffer.from(b64, "base64");
  } catch (e) { console.error("generateWishLookImage falhou:", e); }
  if (!buf) bounce(BACK, "Não foi possível gerar a imagem agora. Tente de novo mais tarde.");

  const key = `wish/${id}/illustration.png`;
  try { await store.putObject(process.env.S3_BUCKET || "closet-private", key, buf, buf.length, { "Content-Type": "image/png" }); }
  catch (e) { console.error("generateWishLookImage putObject falhou:", e); bounce(BACK, "Não foi possível salvar a imagem agora. Tente de novo em instantes."); }
  await withProfile(async (c, userId) => {
    await c.query("UPDATE wish_looks SET illustration_object_key=$1 WHERE id=$2", [key, id]);
    await c.query("SELECT log_image_generation($1,current_setting('app.tenant_id')::uuid)", [userId]);
    await consumeImageAllowance(c, userId, prep.source);
    return true;
  });
  await flash("Imagem pronta!");
  redirect(BACK);
}
