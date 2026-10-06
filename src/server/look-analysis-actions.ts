"use server";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bumpAndCheckAiUsage } from "./limits";
import { bounce } from "./action-error";
import { flash } from "./flash";

const store = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
const BUCKET = () => process.env.S3_BUCKET || "closet-private";
const ANALYZE = "/looks/analisar";

type Piece = { descricao: string; closet_item_id: string | null };

function parseJson(text: string): any {
  const clean = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(clean); } catch { /* tenta extrair o objeto entre chaves */ }
  const m = clean.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* sem JSON válido */ } }
  return null;
}
const short = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

/** Análise de look por foto, em 3 fases (lê -> chama a IA sem conexão presa -> grava), igual
 * ao resto do app. A foto vira um look-rascunho (kind=ANALYSIS) até a usuária decidir salvar. */
export async function analyzeLookPhoto(f: FormData) {
  const file = f.get("photo");
  const occasion = short(f.get("occasion"), 120);
  if (!(file instanceof File) || file.size === 0) bounce(ANALYZE, "Escolha uma foto sua usando o look.", { occasion });
  if (!file.type.startsWith("image/")) bounce(ANALYZE, "Envie um arquivo de imagem.", { occasion });
  if (file.size > 10 * 1024 * 1024) bounce(ANALYZE, "A foto é muito grande. Envie uma imagem de até 10MB.", { occasion });
  if (!process.env.OPENAI_API_KEY) bounce(ANALYZE, "A análise por IA não está disponível no momento.", { occasion });
  const buf = Buffer.from(await file.arrayBuffer());
  const objectKey = `looks/analysis/${randomUUID()}`;

  // Fase 1: confere o orçamento de IA, lê as peças do closet (pra cruzar) e guarda a foto.
  const prep = await withProfile(async (c, userId) => {
    const budget = await bumpAndCheckAiUsage(c, userId);
    if (!budget.ok) bounce(ANALYZE, budget.message || "Limite de operações de IA atingido.", { occasion });
    const items = (await c.query("SELECT id, name, category FROM closet_items WHERE status='ACTIVE' ORDER BY category, name LIMIT 200")).rows as { id: string; name: string; category: string }[];
    try { await store.putObject(BUCKET(), objectKey, buf, buf.length, { "Content-Type": file.type }); }
    catch (e) { console.error("analyzeLookPhoto putObject falhou:", e); bounce(ANALYZE, "Não foi possível enviar a foto agora. Tente de novo em instantes.", { occasion }); }
    return { userId, items };
  });
  if (!prep) redirect("/");

  // Fase 2: IA (sem nenhuma conexão do banco aberta).
  let parsed: any = null;
  try {
    const closetList = prep.items.map((i) => `${i.id} | ${i.name} | ${i.category}`).join("\n") || "(closet vazio)";
    const out = await new OpenAI().responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `Você é uma consultora de imagem sincera, direta e gentil -- nunca bajuladora. A cliente enviou uma foto de si mesma usando um look e quer sua opinião de verdade.\n` +
              `Ocasião informada: ${occasion || "não informada"}.\n` +
              `REGRAS: (1) Só afirme como fato o que é visível na foto; opinião de estilo deve soar como opinião ("pela imagem, parece..."). (2) Se algo não funcionou, diga com clareza e explique por quê. Elogie só o que realmente funcionou. (3) Seja específica: cite peças, cores e proporções reais da foto. (4) Nunca comente peso ou corpo de forma negativa; fale de caimento, proporção e silhueta das roupas. (5) Se a foto não mostrar claramente uma pessoa vestindo um look, responda {"imagem_valida": false}.\n` +
              `Peças do closet da cliente (id | nome | categoria) -- para cada peça que você enxergar na foto, se ela corresponder claramente a uma delas, informe o id; se não houver correspondência clara, use null. Nunca invente ids:\n${closetList}\n\n` +
              `Responda APENAS um JSON, em português do Brasil:\n` +
              `{"imagem_valida": true, "nome_sugerido": "nome curto e elegante para o look (até 5 palavras)", "veredito": "1-2 frases com sua opinião geral e honesta", ` +
              `"caimento": "como as roupas caem no corpo (1-2 frases)", "proporcao": "equilíbrio de proporções e silhueta (1-2 frases)", "cores": "harmonia das cores entre as peças e com o tom de pele visível (1-2 frases)", ` +
              `"sugestao": "o que você mudaria, de forma específica (troca, ajuste ou acessório)", "quando_usar": "em que ocasiões esse look funciona bem e quando evitar", ` +
              `"pecas": [{"descricao": "peça vista na foto (ex.: blusa de seda off-white)", "closet_item_id": "id do closet ou null"}]}`,
          },
          { type: "input_image", image_url: `data:${file.type};base64,${buf.toString("base64")}`, detail: "auto" },
        ],
      }],
    });
    parsed = parseJson(out.output_text);
  } catch (e) { console.error("analyzeLookPhoto IA falhou:", e); }

  if (!parsed || parsed.imagem_valida === false) {
    try { await store.removeObject(BUCKET(), objectKey); } catch { /* foto órfã é inofensiva */ }
    bounce(ANALYZE, parsed ? "Não consegui ver um look na foto. Envie uma foto sua de corpo inteiro (ou meio corpo), bem iluminada." : "Não consegui analisar o look agora. Tente de novo em instantes.", { occasion });
  }

  const validIds = new Set(prep.items.map((i) => i.id));
  const pieces: Piece[] = (Array.isArray(parsed.pecas) ? parsed.pecas : []).slice(0, 12).map((p: any) => ({
    descricao: short(p?.descricao, 120),
    closet_item_id: typeof p?.closet_item_id === "string" && validIds.has(p.closet_item_id) ? p.closet_item_id : null,
  })).filter((p: Piece) => p.descricao);
  const evaluation = {
    veredito: short(parsed.veredito), caimento: short(parsed.caimento), proporcao: short(parsed.proporcao),
    cores: short(parsed.cores), sugestao: short(parsed.sugestao), quando_usar: short(parsed.quando_usar),
  };

  // Fase 3: grava o rascunho da análise.
  const lookId = await withProfile(async (c, userId) => {
    const r = await c.query(
      `INSERT INTO looks(tenant_id,user_id,name,occasion,kind,status,photo_object_key,photo_content_type,photo_evaluation,photo_evaluated_at,described_pieces)
       VALUES(current_setting('app.tenant_id')::uuid,$1,$2,$3,'ANALYSIS','PHOTOGRAPHED',$4,$5,$6,now(),$7::jsonb) RETURNING id`,
      [userId, short(parsed.nome_sugerido, 80), occasion, objectKey, file.type, JSON.stringify(evaluation), JSON.stringify(pieces)],
    );
    return r.rows[0].id as string;
  });
  if (!lookId) redirect("/");
  await flash("Análise pronta! Veja a opinião abaixo e salve se quiser guardar o look.");
  redirect(`${ANALYZE}/${lookId}`);
}

/** Guarda a análise como look pronto (aparece em Meus looks, com foto e avaliação) e liga as
 * peças que a IA reconheceu no closet, pra "usar em outras ocasiões". */
export async function saveAnalyzedLook(f: FormData) {
  const id = String(f.get("look_id") || "");
  const name = short(f.get("name"), 120) || "Look analisado";
  const occasion = short(f.get("occasion"), 120);
  const itemIds = f.getAll("items").map(String);
  const back = `${ANALYZE}/${encodeURIComponent(id)}`;
  const ok = await withProfile(async (c, userId) => {
    const look = await c.query("SELECT id FROM looks WHERE id=$1 AND kind='ANALYSIS'", [id]);
    if (!look.rowCount) return false;
    const valid = itemIds.length ? (await c.query("SELECT id FROM closet_items WHERE id = ANY($1::uuid[])", [itemIds])).rows.map((r: any) => r.id as string) : [];
    await c.query("UPDATE looks SET name=$2, occasion=$3, kind='MANUAL', status='APPROVED', updated_at=now() WHERE id=$1", [id, name, occasion]);
    for (const itemId of valid) {
      await c.query("INSERT INTO look_items(look_id,item_id,tenant_id,user_id) VALUES($1,$2,current_setting('app.tenant_id')::uuid,$3) ON CONFLICT DO NOTHING", [id, itemId, userId]);
    }
    return true;
  });
  if (!ok) bounce("/looks", "Essa análise não foi encontrada (ela pode já ter sido salva ou descartada).");
  await flash("Look salvo em Meus looks!");
  redirect("/looks");
}

export async function discardAnalyzedLook(f: FormData) {
  const id = String(f.get("look_id") || "");
  const key = await withProfile(async (c) => {
    const r = await c.query("DELETE FROM looks WHERE id=$1 AND kind='ANALYSIS' RETURNING photo_object_key", [id]);
    return (r.rows[0]?.photo_object_key as string | undefined) || null;
  });
  if (key) { try { await store.removeObject(BUCKET(), key); } catch { /* objeto órfão é inofensivo */ } }
  await flash("Análise descartada.", "info");
  redirect(ANALYZE);
}
