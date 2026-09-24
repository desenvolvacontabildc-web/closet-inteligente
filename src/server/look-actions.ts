"use server";
import OpenAI, { toFile } from "openai";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { checkLookAllowance, bumpAndCheckAiUsage, checkImageAllowance } from "./limits";
import { bounce } from "./action-error";
const store = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
async function readObject(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const ch of await store.getObject(process.env.S3_BUCKET || "closet-private", key) as any) chunks.push(Buffer.from(ch));
  return Buffer.concat(chunks);
}
/** Gera a ilustração do look a partir das peças reais (quando há foto) ou só do texto.
 * Sunburst tem mais precisão pra edição com fotos de referência; Flare é mais rápido pra gerar do zero. */
async function generateIllustration(c: any, userId: string, lookId: string, itemIds: string[], description: string) {
  const openai = new OpenAI();
  const photos = (await c.query(
    "SELECT DISTINCT ON (item_id) item_id, object_key, content_type FROM closet_item_photos WHERE item_id = ANY($1::uuid[]) ORDER BY item_id, created_at DESC LIMIT 4",
    [itemIds],
  )).rows;
  const promptBase =
    `Ilustração editorial de moda, estilo croqui/silhueta estilizada, sem rosto detalhado e sem identidade real de nenhuma pessoa. ` +
    `Figura genérica de moda vestindo esta combinação: ${description}. Fundo neutro claro, traço elegante, sem texto na imagem.`;
  let img;
  try {
    if (photos.length > 0) {
      const files = await Promise.all(photos.map(async (p: any, i: number) => toFile(await readObject(p.object_key), `ref-${i}.png`, { type: p.content_type })));
      img = await openai.images.edit({ model: "gpt-image-2.5-sunburst", image: files, size: "1024x1024", quality: "high", prompt: `Use estas fotos reais das peças como referência de cor, textura e caimento. ${promptBase}` });
    } else {
      img = await openai.images.generate({ model: "gpt-image-2.5-flare", size: "1024x1024", quality: "high", prompt: promptBase });
    }
  } catch {
    return;
  }
  const b64 = img.data?.[0]?.b64_json;
  if (!b64) return;
  const buf = Buffer.from(b64, "base64");
  const key = `looks/${lookId}/illustration.png`;
  await store.putObject(process.env.S3_BUCKET || "closet-private", key, buf, buf.length, { "Content-Type": "image/png" });
  await c.query("UPDATE looks SET illustration_object_key=$1 WHERE id=$2", [key, lookId]);
  await c.query("SELECT log_image_generation($1,current_setting('app.tenant_id')::uuid)", [userId]);
}

/** Núcleo compartilhado: pede N looks à IA usando somente peças reais ativas, salva e ilustra dentro do orçamento. */
async function generateLooksFromRequest(c: any, userId: string, request: string, maxLooksRequested: number, kind: "SUGGESTED" | "DAILY" | "TRIP", tripLabel = "", skipLookAllowance = false, returnPath = "/looks"): Promise<{ createdCount: number; note?: string }> {
  if (!process.env.OPENAI_API_KEY) bounce(returnPath, "Sugestão por IA não configurada: defina OPENAI_API_KEY no servidor.");
  let maxLooks = maxLooksRequested;
  if (!skipLookAllowance) {
    const allowance = await checkLookAllowance(c, userId);
    if (!allowance.ok) bounce(returnPath, allowance.message || "Limite de looks atingido.");
    maxLooks = Math.max(1, allowance.remaining === null ? maxLooksRequested : Math.min(maxLooksRequested, allowance.remaining));
  }
  const budget = await bumpAndCheckAiUsage(c, userId);
  if (!budget.ok) bounce(returnPath, budget.message || "Limite de uso de IA atingido.");
  const items = (await c.query("SELECT id,name,category,color,attributes FROM closet_items WHERE status='ACTIVE'")).rows;
  if (items.length === 0) bounce(returnPath, "Cadastre ao menos uma peça no closet antes de pedir sugestões de look.");
  const recent = (await c.query(
    `SELECT l.name, l.occasion, (SELECT array_agg(ci.name) FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS pieces
     FROM looks l WHERE l.created_at >= now() - interval '14 days' ORDER BY l.created_at DESC LIMIT 10`,
  )).rows;
  let out: any;
  try {
    out = await new OpenAI().responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text:
            `Você é uma consultora de imagem (personal stylist). Pedido da cliente: "${request}".\n` +
            `Peças reais disponíveis no closet, com atributos de estilo já analisados (use SOMENTE estas peças, nunca invente peças novas; use os atributos — estilo, formalidade, estação, ocasiões, combina_com — pra decidir a curadoria):\n${JSON.stringify(items)}\n` +
            (recent.length > 0 ? `Looks já sugeridos ou usados nos últimos 14 dias (evite repetir exatamente a mesma combinação; pode reutilizar peças individuais, mas varie a composição):\n${JSON.stringify(recent)}\n` : "") +
            `Monte até ${maxLooks} looks distintos e coerentes com o pedido, usando apenas essas peças. ` +
            (maxLooks > 1 ? `Se o pedido envolver múltiplos dias, monte um look por dia, variando as combinações mesmo repetindo peças individuais. ` : "") +
            `Responda apenas JSON no formato {"looks":[{"item_ids":["..."],"name":"...","occasion":"..."}],"note":"..."}. ` +
            `Cada item_ids deve conter somente ids da lista fornecida. Se não houver peças suficientes para ${maxLooks} looks bons e variados, gere menos e explique em "note".`,
        }],
      }],
    });
  } catch {
    bounce(returnPath, "A IA de sugestão está indisponível no momento (sem créditos ou fora do ar). Tente de novo mais tarde ou monte o look manualmente.");
  }
  let parsed: any;
  try { parsed = JSON.parse(out.output_text); } catch { bounce(returnPath, "A IA não retornou uma sugestão válida. Tente novamente."); }
  const validIds = new Set(items.map((i: any) => i.id));
  const proposals = Array.isArray(parsed.looks) ? parsed.looks.slice(0, maxLooks) : [];
  let created = 0;
  for (const p of proposals) {
    const ids = Array.isArray(p.item_ids) ? p.item_ids.filter((id: string) => validIds.has(id)) : [];
    if (ids.length === 0) continue;
    const name = String(p.name || "").slice(0, 120), occasion = String(p.occasion || "").slice(0, 120);
    const look = await c.query(
      "INSERT INTO looks(tenant_id,user_id,name,occasion,kind,trip_label) VALUES(current_setting('app.tenant_id')::uuid,$1,$2,$3,$4,$5) RETURNING id",
      [userId, name, occasion, kind, tripLabel],
    );
    const lookId = look.rows[0].id;
    for (const id of ids) {
      await c.query(
        "INSERT INTO look_items(look_id,item_id,tenant_id,user_id) VALUES($1,$2,current_setting('app.tenant_id')::uuid,$3)",
        [lookId, id, userId],
      );
    }
    created++;
    const imageAllowance = await checkImageAllowance(c, userId);
    if (imageAllowance.ok) {
      const pieceNames = items.filter((i: any) => ids.includes(i.id)).map((i: any) => i.name).join(", ");
      await generateIllustration(c, userId, lookId, ids, `${name || "look"} (${occasion || "sem ocasião"}): ${pieceNames}`);
    }
  }
  return { createdCount: created, note: parsed.note };
}

export async function createLook(f: FormData) {
  const name = String(f.get("name") || "").trim();
  const occasion = String(f.get("occasion") || "").trim();
  const itemIds = f.getAll("items").map(String).filter(Boolean);
  if (itemIds.length === 0) bounce("/looks", "Selecione ao menos uma peça para o look.");
  await withProfile(async (c, userId) => {
    const allowance = await checkLookAllowance(c, userId);
    if (!allowance.ok) bounce("/looks", allowance.message || "Limite de looks atingido.");
    const valid = await c.query("SELECT id FROM closet_items WHERE id = ANY($1::uuid[])", [itemIds]);
    if (valid.rowCount !== itemIds.length) bounce("/looks", "Alguma peça selecionada não pertence ao seu closet.");
    const look = await c.query(
      "INSERT INTO looks(tenant_id,user_id,name,occasion) VALUES(current_setting('app.tenant_id')::uuid,$1,$2,$3) RETURNING id",
      [userId, name, occasion],
    );
    const lookId = look.rows[0].id;
    for (const itemId of itemIds) {
      await c.query(
        "INSERT INTO look_items(look_id,item_id,tenant_id,user_id) VALUES($1,$2,current_setting('app.tenant_id')::uuid,$3)",
        [lookId, itemId, userId],
      );
    }
    return true;
  });
  redirect("/looks");
}

export async function suggestLooks(f: FormData) {
  const request = String(f.get("request") || "").trim();
  if (!request) bounce("/looks", 'Descreva o que você precisa (ex.: "3 looks para reuniões essa semana").');
  await withProfile(async (c, userId) => {
    const result = await generateLooksFromRequest(c, userId, request, 5, "SUGGESTED", "", false, "/looks");
    if (result.createdCount === 0) bounce("/looks", "Não foi possível montar nenhum look com as peças atuais do seu closet para esse pedido.");
    return true;
  });
  redirect("/looks");
}

/** Botão "Look de hoje": sempre gera 3 opções; reaproveita as de hoje se já existirem. Não conta na cota de looks criados (só no orçamento de IA). */
export async function generateTodayLook(f: FormData) {
  const baseItemId = String(f.get("base_item_id") || "").trim();
  await withProfile(async (c, userId) => {
    const existing = await c.query("SELECT id FROM looks WHERE kind='DAILY' AND created_at::date=current_date LIMIT 1");
    if (existing.rowCount) return true;
    let request = "Monte 3 opções de look para hoje, variadas entre si, práticas e alinhadas com o estilo da cliente para um dia comum, usando peças reais do closet ativo.";
    if (baseItemId) {
      const base = await c.query("SELECT name FROM closet_items WHERE id=$1 AND status='ACTIVE'", [baseItemId]);
      if (base.rowCount) request = `A cliente quer usar esta peça como base em todas as opções: "${base.rows[0].name}". ${request}`;
    }
    await generateLooksFromRequest(c, userId, request, 3, "DAILY", "", true, "/home");
    return true;
  });
  redirect("/home");
}

export async function suggestTrip(f: FormData) {
  const destino = String(f.get("destino") || "").trim();
  const diasRaw = Number(f.get("dias") || 0);
  const observacoes = String(f.get("observacoes") || "").trim();
  const dias = Math.min(7, Math.max(1, Math.floor(diasRaw) || 1));
  if (!destino) bounce("/mala", "Informe o destino da viagem.");
  await withProfile(async (c, userId) => {
    const request = `Mala de viagem para ${destino}, ${dias} dia${dias === 1 ? "" : "s"}. ${observacoes || ""}`.trim();
    const result = await generateLooksFromRequest(c, userId, request, dias, "TRIP", destino, false, "/mala");
    if (result.createdCount === 0) bounce("/mala", "Não foi possível montar looks para essa viagem com as peças atuais do seu closet.");
    return true;
  });
  redirect("/mala");
}

export async function deleteLook(f: FormData) {
  const id = String(f.get("id") || "");
  await withProfile(async (c) => {
    await c.query("DELETE FROM looks WHERE id=$1", [id]);
    return true;
  });
  redirect("/looks");
}

/** Sobe uma foto real da cliente usando o look e pede à IA para avaliar (caimento, harmonia, e o que já avisamos: roupa amassada, sapato sujo etc). */
export async function uploadLookPhoto(f: FormData) {
  const lookId = String(f.get("look_id") || "");
  const file = f.get("photo");
  if (!(file instanceof File) || file.size === 0) bounce("/looks", "Envie uma foto sua usando o look.");
  if (!file.type.startsWith("image/")) bounce("/looks", "Envie um arquivo de imagem.");
  if (file.size > 10 * 1024 * 1024) bounce("/looks", "A foto é muito grande. Envie uma imagem de até 10MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const objectKey = `looks/${lookId}/photo-${randomUUID()}`;

  await withProfile(async (c, userId) => {
    const look = await c.query(
      `SELECT l.name, l.occasion, (SELECT array_agg(ci.name) FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS pieces
       FROM looks l WHERE l.id=$1`,
      [lookId],
    );
    if (!look.rowCount) bounce("/looks", "Look não encontrado.");
    await store.putObject(process.env.S3_BUCKET || "closet-private", objectKey, buf, buf.length, { "Content-Type": file.type });
    await c.query(
      "UPDATE looks SET photo_object_key=$1, photo_content_type=$2, status='PHOTOGRAPHED', photo_evaluation=NULL, photo_evaluated_at=NULL, updated_at=now() WHERE id=$3",
      [objectKey, file.type, lookId],
    );
    if (process.env.OPENAI_API_KEY) {
      const budget = await bumpAndCheckAiUsage(c, userId);
      if (budget.ok) {
        try {
          const { pieces, occasion } = look.rows[0];
          const dataUrl = `data:${file.type};base64,${buf.toString("base64")}`;
          const out = await new OpenAI().responses.create({
            model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
            input: [{
              role: "user",
              content: [
                {
                  type: "input_text",
                  text:
                    `Você é uma consultora de imagem gentil e direta. A cliente está usando este look de verdade (foto real, não ilustração). ` +
                    `Peças que deveriam compor o look: ${(pieces || []).join(", ") || "não informado"}. Ocasião: ${occasion || "não informada"}.\n` +
                    `Avalie APENAS o que está visível na foto, sem inventar, e responda em 4 partes curtas (1-2 frases cada, tom encorajador):\n` +
                    `- caimento: como a roupa cai no corpo dela (ajuste, comprimento, amassados).\n` +
                    `- proporcao: o equilíbrio das proporções e silhueta dessa combinação.\n` +
                    `- cores: a harmonia das cores entre as peças e com o tom de pele, se visível.\n` +
                    `- sugestao: uma sugestão prática e específica pra melhorar esse look (troca de peça, ajuste, acessório) — ou um elogio específico se já estiver ótimo.\n` +
                    `Se notar algo prático a corrigir (peça amassada, sapato sujo ou gasto, etiqueta pra fora), mencione em "caimento" ou "sugestao". ` +
                    `Responda apenas JSON: {"caimento":"...","proporcao":"...","cores":"...","sugestao":"..."}.`,
                },
                { type: "input_image", image_url: dataUrl, detail: "low" },
              ],
            }],
          });
          let parsed: any;
          try { parsed = JSON.parse(out.output_text); } catch { parsed = { sugestao: out.output_text }; }
          const evaluation = {
            caimento: String(parsed.caimento || "").slice(0, 500),
            proporcao: String(parsed.proporcao || "").slice(0, 500),
            cores: String(parsed.cores || "").slice(0, 500),
            sugestao: String(parsed.sugestao || "").slice(0, 500),
          };
          await c.query("UPDATE looks SET photo_evaluation=$1, photo_evaluated_at=now() WHERE id=$2", [JSON.stringify(evaluation), lookId]);
        } catch { /* avaliação é um extra; falha aqui não deve impedir o upload da foto */ }
      }
    }
    return true;
  });
  redirect("/looks");
}
