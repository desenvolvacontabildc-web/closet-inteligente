"use server";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import sharp from "sharp";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { flash } from "./flash";

const store = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
const BUCKET = () => process.env.S3_BUCKET || "closet-private";
const UUID = /^[0-9a-f-]{36}$/i;

/** Cria um anúncio (aluguel ou bazar) com 1 a 4 fotos. Fotos são reduzidas (lado maior 1280px) antes de guardar. */
export async function createBazarPost(f: FormData) {
  const kind = String(f.get("kind") || "");
  const title = String(f.get("title") || "").trim();
  const description = String(f.get("description") || "").trim();
  const category = String(f.get("category") || "").trim();
  const size = String(f.get("size") || "").trim();
  const city = String(f.get("city") || "").trim();
  const whatsapp = String(f.get("whatsapp") || "").trim();
  const priceUnit = String(f.get("price_unit") || "");
  const reais = Number(String(f.get("price") || "").replace(/\./g, "").replace(",", "."));
  const typed = { kind, title, description, category, size, city, whatsapp, price: String(f.get("price") || ""), price_unit: priceUnit, item_id: String(f.get("item_id") || "") };
  const back = (msg: string): never => bounce("/bazar/novo", msg, typed);

  if (!Number.isFinite(reais) || reais <= 0) back("Informe o valor (ex.: 80 ou 79,90).");
  if (f.get("consent") !== "on") back("Para anunciar, marque que concorda em compartilhar o seu WhatsApp com quem tocar em “Chamar no WhatsApp”.");
  const itemId = UUID.test(String(f.get("item_id") || "")) ? String(f.get("item_id")) : "";
  const photos: Buffer[] = [];
  // Fotos da própria peça do closet (catálogo e/ou original), se ela escolheu usá-las.
  if (itemId && (f.get("use_std") === "on" || f.get("use_orig") === "on")) {
    const keys = await withProfile(async (c) => {
      const it = (await c.query("SELECT standard_object_key FROM closet_items WHERE id=$1", [itemId])).rows[0];
      if (!it) return null;
      const orig = (await c.query("SELECT object_key FROM closet_item_photos WHERE item_id=$1 ORDER BY created_at DESC LIMIT 1", [itemId])).rows[0];
      return { std: (it.standard_object_key as string | null) || null, orig: (orig?.object_key as string | undefined) || null };
    });
    const wanted = [f.get("use_std") === "on" ? keys?.std : null, f.get("use_orig") === "on" ? keys?.orig : null].filter((k): k is string => !!k);
    for (const key of wanted) {
      try {
        const chunks: Buffer[] = [];
        for await (const ch of (await store.getObject(BUCKET(), key)) as AsyncIterable<Buffer>) chunks.push(Buffer.from(ch));
        photos.push(await sharp(Buffer.concat(chunks)).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer());
      } catch (e) { console.error("createBazarPost: foto da peça indisponível:", e); }
    }
  }
  const files = f.getAll("photos").filter((x): x is File => x instanceof File && x.size > 0).slice(0, 4 - photos.length);
  if (files.length === 0 && photos.length === 0) back("Envie pelo menos 1 foto da peça.");
  for (const file of files) {
    if (!file.type.startsWith("image/")) back("Envie apenas arquivos de imagem.");
    if (file.size > 8 * 1024 * 1024) back("Cada foto pode ter até 8 MB.");
    try {
      photos.push(await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer());
    } catch (e) { console.error("createBazarPost: imagem inválida:", e); back("Não consegui ler uma das fotos. Tente outra imagem (JPG ou PNG)."); }
  }

  const postId = await withProfile(async (c, userId) => {
    const r = (await c.query("SELECT * FROM bazar_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [userId, kind, title, description, category, size, Math.round(reais * 100), priceUnit, city, whatsapp])).rows[0];
    if (r.msg) back(r.msg);
    for (const buf of photos) {
      const key = `bazar/${r.post_id}/${randomUUID()}`;
      try { await store.putObject(BUCKET(), key, buf, buf.length, { "Content-Type": "image/jpeg" }); }
      catch (e) { console.error("createBazarPost putObject falhou:", e); back("Não foi possível enviar as fotos agora. Tente de novo em instantes."); }
      const m = (await c.query("SELECT bazar_add_photo($1,$2,$3,$4) m", [userId, r.post_id, key, "image/jpeg"])).rows[0].m;
      if (m) back(m);
    }
    if (itemId) await c.query("SELECT bazar_link_item($1,$2,$3)", [userId, r.post_id, itemId]);
    return r.post_id as string;
  });
  if (!postId) redirect("/");
  await flash("Anúncio publicado! Quem se interessar vai te chamar no WhatsApp.");
  redirect(`/bazar/${postId}`);
}

export async function setBazarStatus(f: FormData) {
  const id = String(f.get("id") || "");
  const status = String(f.get("status") || "");
  if (!UUID.test(id)) redirect("/bazar/meus");
  const msg = await withProfile(async (c, userId) => (await c.query("SELECT bazar_set_status($1,$2,$3) m", [userId, id, status])).rows[0].m);
  if (msg) bounce("/bazar/meus", msg);
  await flash(status === "ACTIVE" ? "Anúncio no ar de novo." : status === "PAUSED" ? "Anúncio pausado: ninguém mais vê até você reativar." : "Anúncio encerrado.");
  redirect("/bazar/meus");
}

export async function deleteBazarPost(f: FormData) {
  const id = String(f.get("id") || "");
  if (!UUID.test(id)) redirect("/bazar/meus");
  const keys = await withProfile(async (c, userId) => (await c.query("SELECT * FROM bazar_delete($1,$2)", [userId, id])).rows.map((r: any) => String(r.bazar_delete)));
  for (const k of keys || []) { try { await store.removeObject(BUCKET(), k); } catch (e) { console.error("deleteBazarPost removeObject falhou:", e); } }
  await flash("Anúncio excluído.");
  redirect("/bazar/meus");
}

export async function reportBazarPost(f: FormData) {
  const id = String(f.get("id") || "");
  const reason = String(f.get("reason") || "").trim();
  if (!UUID.test(id)) redirect("/bazar");
  const msg = await withProfile(async (c, userId) => (await c.query("SELECT bazar_report($1,$2,$3) m", [userId, id, reason])).rows[0].m);
  if (msg) bounce(`/bazar/${id}`, msg);
  await flash("Obrigada! A administradora vai olhar esse anúncio.");
  redirect(`/bazar/${id}`);
}

/* ---------- administradora ---------- */
export async function adminListBazar() {
  const result = await withProfile(async (c, userId) => {
    try { return (await c.query("SELECT * FROM admin_bazar_list($1)", [userId])).rows; }
    catch (e) { console.error("adminListBazar falhou:", e); return null; }
  });
  return result;
}

export async function adminSetBazarHidden(f: FormData) {
  const id = String(f.get("id") || "");
  const hidden = String(f.get("hidden") || "") === "1";
  if (!UUID.test(id)) redirect("/admin/bazar");
  await withProfile(async (c, userId) => { await c.query("SELECT admin_bazar_set_hidden($1,$2,$3)", [userId, id, hidden]); return true; });
  await flash(hidden ? "Anúncio ocultado." : "Anúncio liberado.");
  redirect("/admin/bazar");
}
