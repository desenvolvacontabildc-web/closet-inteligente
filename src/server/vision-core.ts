import "server-only";
import OpenAI from "openai";
import { Client } from "minio";
import type { PoolClient } from "pg";
import { bumpAndCheckAiUsage } from "./limits";
const s3 = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });

/** Núcleo da análise por foto, compartilhado entre a ação manual (Analisar com IA) e o auto-disparo no primeiro upload. */
export async function runVisionAnalysis(c: PoolClient, userId: string, photoId: string): Promise<{ ok: boolean; message?: string }> {
  if (!process.env.OPENAI_API_KEY) return { ok: false, message: "Análise visual não configurada." };
  const budget = await bumpAndCheckAiUsage(c, userId);
  if (!budget.ok) return { ok: false, message: budget.message };
  const q = await c.query("SELECT item_id,object_key,content_type FROM closet_item_photos WHERE id=$1 AND user_id=$2", [photoId, userId]);
  if (!q.rowCount) return { ok: false, message: "Foto não encontrada." };
  const chunks: Buffer[] = [];
  for await (const ch of await s3.getObject(process.env.S3_BUCKET || "closet-private", q.rows[0].object_key) as any) chunks.push(Buffer.from(ch));
  const data = `data:${q.rows[0].content_type};base64,${Buffer.concat(chunks).toString("base64")}`;
  let out: any;
  try {
    out = await new OpenAI().responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Identifique a peça de roupa/acessório na foto e descreva seus atributos de estilo, pra um personal stylist usar depois sem precisar olhar a foto de novo. " +
              "Além disso, avalie apenas o que estiver visível na foto quanto a amassado, sujeira, manchas ou desgaste (ex.: sapato sujo ou gasto). " +
              "Responda apenas JSON: {\"category\":\"...\",\"color\":\"...\",\"description\":\"...\",\"condition_notes\":\"...\",\"attributes\":{" +
              "\"subcategoria\":\"...\",\"cores_secundarias\":\"...\",\"estampa\":\"...\",\"tecido\":\"...\",\"modelagem\":\"...\",\"comprimento\":\"...\"," +
              "\"estilo\":\"...\",\"estacao\":\"...\",\"formalidade\":\"...\",\"ocasioes\":\"...\",\"combina_com\":\"...\"}}. " +
              "Em condition_notes, se houver algo visível a corrigir, descreva o problema e sugira uma ação prática curta (ex.: \"Parece amassada — passar a ferro antes de usar\"). Se nada estiver visivelmente errado, deixe condition_notes vazio. " +
              "Em attributes, seja breve (poucas palavras por campo, ex.: estilo:\"casual elegante\", ocasioes:\"trabalho, jantar\", combina_com:\"preto, jeans, branco\"). Se não conseguir avaliar algum campo pela foto, deixe como string vazia. Nunca invente detalhes nem afirme algo que não seja visível na imagem.",
          },
          { type: "input_image", image_url: data, detail: "low" },
        ],
      }],
    });
  } catch {
    return { ok: false, message: "Análise visual indisponível no momento (sem créditos ou fora do ar). Tente de novo mais tarde." };
  }
  let parsed: any;
  try { parsed = JSON.parse(out.output_text); } catch { parsed = { description: out.output_text }; }
  await c.query(
    "UPDATE closet_items SET category=COALESCE(NULLIF($1,''),category),color=COALESCE(NULLIF($2,''),color),description=COALESCE(NULLIF($3,''),description),condition_notes=$4,attributes=$5::jsonb,confidence='INFERRED',updated_at=now() WHERE id=$6 AND user_id=$7",
    [parsed.category || "", parsed.color || "", parsed.description || "", parsed.condition_notes || "", JSON.stringify(parsed.attributes || {}), q.rows[0].item_id, userId],
  );
  return { ok: true };
}
