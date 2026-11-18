"use server";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { redirect } from "next/navigation";
import type { PoolClient } from "pg";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { flash } from "./flash";
import { parseAiJson } from "./ai-json";
import { bumpAndCheckAiUsage } from "./limits";
import { closetKindC, closetNote } from "./closet-type";
import { scheduleStandardize } from "./closet-standardize";

const store = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
const BUCKET = () => process.env.S3_BUCKET || "closet-private";
const UUID = /^[0-9a-f-]{36}$/i;
const MAX_FILES = 8;
const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const CATEGORIES = "Blusas / camisas / tops, Calças, Saias, Shorts, Vestidos, Macacões e conjuntos, Blazers, Coletes, Casacos, Sapatos, Bolsas, Acessórios, Praia, Fitness, Outros";
const ATTR_HELP = '"attributes":{"subcategoria":"","cores_secundarias":"","estampa":"","tecido":"","modelagem":"","comprimento":"curto|midi|longo","mangas":"sem mangas|curta|3/4|longa","decote":"","estilo":"","estacao":"","formalidade":"","ocasioes":"","combina_com":""}';

type Parsed = { name: string; category: string; color: string; description: string; condition_notes: string; attributes: Record<string, string> };

function cleanPiece(p: any): Parsed | null {
  const name = clip(p?.name, 90); if (!name) return null;
  const attrs: Record<string, string> = {};
  if (p?.attributes && typeof p.attributes === "object") for (const [k, v] of Object.entries(p.attributes)) { const val = clip(v, 80); if (val) attrs[clip(k, 30)] = val; }
  return { name, category: clip(p?.category, 40) || "Outros", color: clip(p?.color, 40), description: clip(p?.description, 240), condition_notes: clip(p?.condition_notes, 200), attributes: attrs };
}

/** Uma foto de UMA peça -> nome, categoria, cor e atributos (para a ficha). */
async function identifyPiece(dataUrl: string, note: string): Promise<Parsed | null> {
  try {
    const out = await new OpenAI({ timeout: 60000 }).responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{ role: "user", content: [
        { type: "input_text", text:
          `Você é uma stylist cadastrando uma peça no closet.${note} A foto mostra UMA peça (roupa, calçado, bolsa ou acessório), vestida ou sobre uma superfície. Se aparecer uma pessoa com várias peças, descreva só a de maior destaque. ` +
          `Responda apenas JSON: {"name":"nome curto e descritivo em português, por exemplo Blusa de cetim verde de manga longa","category":"uma destas: ${CATEGORIES}","color":"cor principal","description":"uma frase","condition_notes":"só se houver amassado, mancha ou desgaste visível, senão vazio",${ATTR_HELP}}. Campos que não der para saber pela foto ficam vazios.` },
        { type: "input_image", image_url: dataUrl, detail: "low" },
      ] }],
    });
    return cleanPiece(parseAiJson(out.output_text));
  } catch (e) { console.error("identifyPiece falhou:", e); return null; }
}

/** Foto de uma pessoa vestida -> lista das peças visíveis (até 8), cada uma com a ficha. */
async function detectOutfit(dataUrl: string, note: string): Promise<Parsed[] | null> {
  try {
    const out = await new OpenAI({ timeout: 90000 }).responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{ role: "user", content: [
        { type: "input_text", text:
          `Você é uma stylist cadastrando as peças de um look no closet.${note} A foto mostra uma pessoa vestida. Liste cada peça visível de forma separada (blusa, calça ou saia, vestido, casaco, sapato, bolsa, cinto, acessórios marcantes), no máximo 8, sem inventar o que não aparece. ` +
          `Responda apenas JSON: {"pieces":[{"name":"nome curto em português","category":"uma destas: ${CATEGORIES}","color":"cor principal","description":"uma frase",${ATTR_HELP}}]}. Campos que não der para saber ficam vazios.` },
        { type: "input_image", image_url: dataUrl, detail: "high" },
      ] }],
    });
    const parsed = parseAiJson(out.output_text);
    const list = (Array.isArray(parsed?.pieces) ? parsed.pieces : []).slice(0, MAX_FILES).map(cleanPiece).filter(Boolean) as Parsed[];
    return list;
  } catch (e) { console.error("detectOutfit falhou:", e); return null; }
}

async function nextCode(c: PoolClient, userId: string, category: string): Promise<string> {
  let num = Number((await c.query("SELECT count(*)::int+1 next FROM closet_items WHERE user_id=$1 AND category=$2", [userId, category])).rows[0].next);
  for (;;) {
    const code = `${category.slice(0, 3).toUpperCase()}-${String(num).padStart(3, "0")}`;
    if (!(await c.query("SELECT 1 FROM closet_items WHERE user_id=$1 AND code=$2", [userId, code])).rowCount) return code;
    num++;
  }
}

/** Cria a peça e guarda a foto (uma cópia própria por peça, para apagar uma não afetar as outras). */
async function insertPiece(c: PoolClient, userId: string, p: Parsed, photo: { buf: Buffer; type: string } | null): Promise<string> {
  const code = await nextCode(c, userId, p.category);
  const itemId = (await c.query(
    "INSERT INTO closet_items(tenant_id,user_id,code,name,category,color,description,condition_notes,attributes,confidence) VALUES(current_setting('app.tenant_id')::uuid,$1,$2,$3,$4,$5,$6,$7,$8::jsonb,'INFERRED') RETURNING id",
    [userId, code, p.name, p.category, p.color, p.description, p.condition_notes, JSON.stringify(p.attributes)],
  )).rows[0].id as string;
  if (photo) {
    const key = `items/${itemId}/${randomUUID()}`;
    await store.putObject(BUCKET(), key, photo.buf, photo.buf.length, { "Content-Type": photo.type });
    await c.query("INSERT INTO closet_item_photos(item_id,tenant_id,user_id,object_key,content_type) VALUES($1,current_setting('app.tenant_id')::uuid,$2,$3,$4)", [itemId, userId, key, photo.type]);
  }
  return itemId;
}

const isImage = (x: unknown): x is File => x instanceof File && x.size > 0 && x.type.startsWith("image/");

/** Várias fotos de uma vez: cada foto vira uma peça, e a IA preenche nome, categoria, cor e ficha. */
export async function quickAddPieces(f: FormData) {
  const files = f.getAll("photos").filter(isImage).slice(0, MAX_FILES);
  if (files.length === 0) bounce("/closet/rapido", "Escolha pelo menos uma foto.");
  const ctx = await withProfile(async (c, userId) => ({ userId, tenantId: (await c.query("SELECT current_setting('app.tenant_id') t")).rows[0].t as string, note: closetNote(await closetKindC(c, userId)) }));
  if (!ctx) redirect("/");
  let made = 0, withoutAi = 0;
  const std: string[] = [];
  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const ai = await withProfile(async (c, userId) => (process.env.OPENAI_API_KEY ? (await bumpAndCheckAiUsage(c, userId)).ok : false));
    let parsed: Parsed | null = null;
    if (ai) parsed = await identifyPiece(`data:${file.type};base64,${buf.toString("base64")}`, ctx.note);
    if (!parsed) { withoutAi++; parsed = { name: "Peça nova", category: "Outros", color: "", description: "", condition_notes: "", attributes: {} }; }
    try {
      const id = await withProfile(async (c, userId) => insertPiece(c, userId, parsed!, { buf, type: file.type }));
      if (id) { made++; std.push(id); }
    } catch (e) { console.error("quickAddPieces: falha ao salvar uma peça:", e); }
  }
  for (const id of std) scheduleStandardize({ userId: ctx.userId, tenantId: ctx.tenantId }, id);
  if (made === 0) bounce("/closet/rapido", "Não consegui salvar as fotos agora. Tente de novo em instantes.");
  await flash(`${made} peça${made === 1 ? "" : "s"} adicionada${made === 1 ? "" : "s"}.${withoutAi ? ` ${withoutAi} ficou${withoutAi === 1 ? "" : "ram"} como "Peça nova": toque nela para ajustar o nome.` : " A IA já preencheu a ficha de cada uma."}`);
  redirect("/closet");
}

/** Foto vestida: a IA separa as peças e mostra uma tela para a usuária confirmar antes de cadastrar. */
export async function scanOutfit(f: FormData) {
  const file = f.get("photo");
  if (!isImage(file)) bounce("/closet/rapido", "Escolha uma foto sua vestida com o look.");
  if (file.size > 12 * 1024 * 1024) bounce("/closet/rapido", "A foto é muito grande. Use uma foto de até 12 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const prep = await withProfile(async (c, userId) => {
    if (!process.env.OPENAI_API_KEY) return { ok: false as const, message: "A análise por IA não está disponível no momento." };
    const kind = await closetKindC(c, userId);
    if (kind.type === "INFANTIL") return { ok: false as const, message: "Por segurança, no closet infantil não enviamos fotos de crianças. Fotografe as peças sozinhas e use \"Várias peças de uma vez\"." };
    const budget = await bumpAndCheckAiUsage(c, userId);
    if (!budget.ok) return { ok: false as const, message: budget.message || "Limite de operações de IA atingido." };
    return { ok: true as const, note: closetNote(kind) };
  });
  if (!prep) redirect("/");
  if (!prep.ok) bounce("/closet/rapido", prep.message);
  const pieces = await detectOutfit(`data:${file.type};base64,${buf.toString("base64")}`, prep.note);
  if (pieces === null) bounce("/closet/rapido", "A IA está indisponível no momento. Tente de novo em instantes.");
  if (pieces.length === 0) bounce("/closet/rapido", "Não consegui identificar peças nessa foto. Tente uma foto de corpo inteiro, com boa luz.");
  const key = `scans/${randomUUID()}`;
  try { await store.putObject(BUCKET(), key, buf, buf.length, { "Content-Type": file.type }); }
  catch (e) { console.error("scanOutfit putObject falhou:", e); bounce("/closet/rapido", "Não foi possível enviar a foto agora. Tente de novo em instantes."); }
  const id = await withProfile(async (c, userId) => (await c.query("INSERT INTO outfit_scans(tenant_id,user_id,object_key,content_type,pieces) VALUES(current_setting('app.tenant_id')::uuid,$1,$2,$3,$4::jsonb) RETURNING id", [userId, key, file.type, JSON.stringify(pieces)])).rows[0].id as string);
  if (!id) redirect("/");
  redirect(`/closet/rapido/confirmar?id=${id}`);
}

/** Confirma as peças marcadas (com os nomes que ela ajustou) e cria uma peça para cada uma. */
export async function confirmOutfitScan(f: FormData) {
  const id = String(f.get("id") || "");
  if (!UUID.test(id)) redirect("/closet/rapido");
  const scan = await withProfile(async (c, userId) => ({ userId, tenantId: (await c.query("SELECT current_setting('app.tenant_id') t")).rows[0].t as string, row: (await c.query("SELECT object_key, content_type, pieces FROM outfit_scans WHERE id=$1", [id])).rows[0] }));
  if (!scan) redirect("/");
  if (!scan.row) bounce("/closet/rapido", "Essa foto já foi cadastrada ou expirou. Envie de novo.");
  const stored = scan.row.pieces as Parsed[];
  const chunks: Buffer[] = [];
  for await (const ch of await store.getObject(BUCKET(), scan.row.object_key) as any) chunks.push(Buffer.from(ch));
  const photo = { buf: Buffer.concat(chunks), type: String(scan.row.content_type) };
  const made: string[] = [];
  for (let i = 0; i < stored.length; i++) {
    if (f.get(`keep_${i}`) !== "on") continue;
    const name = clip(f.get(`name_${i}`), 90) || stored[i].name;
    const category = clip(f.get(`category_${i}`), 40) || stored[i].category;
    const color = clip(f.get(`color_${i}`), 40);
    try {
      const itemId = await withProfile(async (c, userId) => insertPiece(c, userId, { ...stored[i], name, category, color }, photo));
      if (itemId) made.push(itemId);
    } catch (e) { console.error("confirmOutfitScan: falha ao salvar uma peça:", e); }
  }
  if (made.length === 0) bounce(`/closet/rapido/confirmar?id=${id}`, "Marque pelo menos uma peça para cadastrar.");
  await withProfile(async (c) => { await c.query("DELETE FROM outfit_scans WHERE id=$1", [id]); return true; });
  try { await store.removeObject(BUCKET(), scan.row.object_key); } catch { /* arquivo temporário; não atrapalha */ }
  for (const itemId of made) scheduleStandardize({ userId: scan.userId, tenantId: scan.tenantId }, itemId);
  await flash(`${made.length} peça${made.length === 1 ? "" : "s"} adicionada${made.length === 1 ? "" : "s"} ao closet. As fotos de catálogo são geradas em seguida.`);
  redirect("/closet");
}

export async function discardOutfitScan(f: FormData) {
  const id = String(f.get("id") || "");
  if (UUID.test(id)) {
    const key = await withProfile(async (c) => (await c.query("DELETE FROM outfit_scans WHERE id=$1 RETURNING object_key", [id])).rows[0]?.object_key as string | undefined);
    if (key) { try { await store.removeObject(BUCKET(), key); } catch { /* ok */ } }
  }
  redirect("/closet/rapido");
}
