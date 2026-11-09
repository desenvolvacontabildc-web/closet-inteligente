import "server-only";
import OpenAI, { toFile } from "openai";
import { shrinkRef } from "./ref-image";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import type { PoolClient } from "pg";
import { getPool } from "./db";

const store = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
const BUCKET = () => process.env.S3_BUCKET || "closet-private";

type Ctx = { userId: string; tenantId: string };
const running = new Set<string>(); // um lote por usuária por vez

/** Mesma segurança do restante do app (RLS por app.user_id/app.tenant_id), mas para trabalho em segundo plano,
 * que roda depois da resposta e não tem mais o cookie da requisição. */
async function withUserTx<T>(ctx: Ctx, work: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.user_id',$1,true),set_config('app.tenant_id',$2,true)", [ctx.userId, ctx.tenantId]);
    const r = await work(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch { /* conexão já descartada */ }
    throw e;
  } finally { c.release(); }
}

async function readObject(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const ch of await store.getObject(BUCKET(), key) as any) chunks.push(Buffer.from(ch));
  return Buffer.concat(chunks);
}

function promptFor(item: { name: string; category: string; color: string | null }): string {
  const isFootwear = /sapat|sand[áa]l|t[êe]nis|bota|rasteir|scarpin|slingback|cal[çc]ad/i.test(`${item.category} ${item.name}`);
  const isBag = /bolsa|mochila|clutch/i.test(`${item.category} ${item.name}`);
  const layout = isFootwear ? "o par de calçados, em vista 3/4 elegante" : isBag ? "a bolsa inteira, em vista frontal ligeiramente 3/4" : "a peça inteira, esticada em estilo flat lay (ou ghost mannequin), sem corpo";
  return (
    `Fotografia de produto de moda para um catálogo premium. Mostre SOMENTE ${layout}: "${item.name}" (${item.category}${item.color ? `, cor ${item.color}` : ""}), igual à imagem de referência. ` +
    `Remova a pessoa, o rosto, as mãos, o fundo, etiquetas, cabides e qualquer objeto ao redor. Peça inteira, centralizada, com margem confortável, em fundo liso marfim (#f3ede4) e sombra suave e discreta embaixo. ` +
    `Iluminação suave de estúdio, imagem quadrada, sem texto, sem logotipo, sem moldura. Mantenha EXATAMENTE a mesma cor, tecido, corte, estampa e detalhes da peça original; não invente nenhum detalhe novo.`
  );
}

/** Gera a foto padronizada de UMA peça a partir da foto original mais recente. Nunca lança: devolve ok/erro. */
export async function standardizeItem(ctx: Ctx, itemId: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const src = await withUserTx(ctx, async (c) => {
      const it = (await c.query("SELECT id, name, category, color FROM closet_items WHERE id=$1", [itemId])).rows[0];
      if (!it) return null;
      const ph = (await c.query("SELECT object_key, content_type FROM closet_item_photos WHERE item_id=$1 ORDER BY created_at DESC LIMIT 1", [itemId])).rows[0];
      return ph ? { it, ph } : null;
    });
    if (!src) return { ok: false, reason: "peça sem foto" };

    const original = await readObject(src.ph.object_key);
    const ref = await shrinkRef(original, 1024, src.ph.content_type || "image/png");
    const file = await toFile(ref.buf, `peca.${ref.ext}`, { type: ref.type });
    const img = await new OpenAI({ timeout: 150000 }).images.edit({ model: "gpt-image-2.5-sunburst", image: [file], size: "1024x1024", quality: "medium", prompt: promptFor(src.it) });
    const b64 = img.data?.[0]?.b64_json;
    if (!b64) throw new Error("a IA não devolveu imagem");
    const buf = Buffer.from(b64, "base64");

    const key = `closet/standard/${itemId}-${randomUUID()}.png`;
    await store.putObject(BUCKET(), key, buf, buf.length, { "Content-Type": "image/png" });
    await withUserTx(ctx, async (c) => {
      await c.query("UPDATE closet_items SET standard_object_key=$2, standard_content_type='image/png', standard_status='DONE', standard_at=now() WHERE id=$1", [itemId, key]);
      await c.query("SELECT log_image_generation($1,$2,'CATALOG')", [ctx.userId, ctx.tenantId]);
      // Passou da cota do plano (a geração acima já conta): quem pagou essa foi um crédito de imagem.
      const q = await catalogQuota(c, ctx.userId);
      if (q.limit !== null && q.used > q.limit) await c.query("UPDATE profiles SET bonus_image_credits = bonus_image_credits - 1 WHERE user_id=$1 AND bonus_image_credits > 0", [ctx.userId]);
    });
    return { ok: true };
  } catch (e) {
    console.error("standardizeItem falhou:", itemId, e);
    try { await withUserTx(ctx, async (c) => { await c.query("UPDATE closet_items SET standard_status='FAILED' WHERE id=$1", [itemId]); }); } catch { /* ignora */ }
    return { ok: false, reason: String((e as Error)?.message || e).slice(0, 160) };
  }
}

/** Lote em segundo plano: padroniza as peças ativas que ainda não têm foto padronizada (ou falharam),
 * 3 por vez. Pode ser retomado: o que já ficou pronto não é refeito. */
export async function runStandardizeBatch(ctx: Ctx, limit?: number): Promise<void> {
  if (running.has(ctx.userId)) return;
  running.add(ctx.userId);
  try {
    const ids = await withUserTx(ctx, async (c) => (await c.query(
      `SELECT ci.id FROM closet_items ci
       WHERE ci.status='ACTIVE' AND ci.standard_status IS DISTINCT FROM 'DONE'
         AND EXISTS (SELECT 1 FROM closet_item_photos p WHERE p.item_id=ci.id)
       ORDER BY ci.created_at DESC ${limit ? "LIMIT " + Math.max(1, Math.floor(limit)) : ""}`)).rows.map((r: any) => r.id as string));
    let next = 0;
    const worker = async () => { while (next < ids.length) { const id = ids[next++]; await standardizeItem(ctx, id); } };
    await Promise.all([worker(), worker(), worker()]);
  } catch (e) {
    console.error("runStandardizeBatch falhou:", e);
  } finally { running.delete(ctx.userId); }
}

export function isStandardizing(userId: string): boolean { return running.has(userId); }

/** Cota mensal de fotos de catálogo do plano (administradora: sem limite; teste gratuito usa o limite do plano Arrumada). */
async function catalogQuota(c: PoolClient, userId: string): Promise<{ limit: number | null; used: number }> {
  const admin = (await c.query("SELECT is_admin FROM app_users WHERE id=$1", [userId])).rows[0]?.is_admin;
  if (admin) return { limit: null, used: 0 };
  const sub = (await c.query("SELECT status, plan FROM my_subscription($1)", [userId])).rows[0];
  const plan = !sub || sub.status === "TRIAL" ? "ARRUMADA" : sub.plan;
  const limit = (await c.query("SELECT get_standard_limit($1) l", [plan])).rows[0]?.l as number | null;
  const used = Number((await c.query("SELECT count_my_catalog_this_month($1) n", [userId])).rows[0]?.n || 0);
  return { limit, used };
}

/** Pode gerar uma foto de catálogo agora? Dentro da cota do plano, sim. Passou da cota: só se `allowCredits` (botão manual)
 * e a usuária tiver créditos de imagem comprados/ganhos. A geração automática ao cadastrar peça NUNCA gasta créditos. */
export async function standardAllowance(c: PoolClient, userId: string, allowCredits = true): Promise<{ ok: boolean; limit: number | null; used: number; source: "PLAN" | "BONUS" }> {
  const q = await catalogQuota(c, userId);
  if (q.limit === null || q.used < q.limit) return { ok: true, ...q, source: "PLAN" };
  if (allowCredits) {
    const bonus = Number((await c.query("SELECT bonus_image_credits FROM profiles WHERE user_id=$1", [userId])).rows[0]?.bonus_image_credits || 0);
    if (bonus > 0) return { ok: true, ...q, source: "BONUS" };
  }
  return { ok: false, ...q, source: "PLAN" };
}

/** Disparada ao cadastrar uma peça com foto (ou trocar a foto): gera a foto de catálogo em segundo plano, sem
 * atrasar o envio. Fora da cota do plano ou com a IA indisponível, a peça só continua com a foto original. */
export function scheduleStandardize(ctx: Ctx, itemId: string): void {
  if (!process.env.OPENAI_API_KEY) return;
  void (async () => {
    try {
      const allowed = await withUserTx(ctx, (c) => standardAllowance(c, ctx.userId, false));
      if (!allowed.ok) { console.log("scheduleStandardize: cota mensal de fotos de catálogo esgotada para", ctx.userId); return; }
      await standardizeItem(ctx, itemId);
    } catch (e) { console.error("scheduleStandardize falhou:", e); }
  })();
}

export async function standardizeProgress(c: PoolClient): Promise<{ total: number; done: number; failed: number }> {
  const r = (await c.query(
    `SELECT count(*)::int total, count(*) FILTER (WHERE standard_status='DONE')::int done, count(*) FILTER (WHERE standard_status='FAILED')::int failed
     FROM closet_items ci WHERE ci.status='ACTIVE' AND EXISTS (SELECT 1 FROM closet_item_photos p WHERE p.item_id=ci.id)`)).rows[0];
  return r;
}
