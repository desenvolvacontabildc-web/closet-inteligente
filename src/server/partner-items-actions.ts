"use server";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { withProfile } from "./profile-session";
import { withStore } from "./store-session";
import { PARTNER_PACKAGE_LIMIT } from "./partner-limits";
import { bounce } from "./action-error";
import { flash } from "./flash";
const store = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
const BUCKET = () => process.env.S3_BUCKET || "closet-private";
const PANEL = "/minha-vitrine";

/** Aceita "@loja", "loja" ou o link completo do Instagram e guarda só o usuário. */
function normalizeInstagram(raw: string): string {
  const v = raw.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").split(/[/?#]/)[0];
  return /^[A-Za-z0-9._]{1,30}$/.test(v) ? v : "";
}
/** Só dígitos, com DDI 55 quando vier só DDD+número (10-11 dígitos). */
function normalizeWhatsapp(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}
const msg = (e: any, fallback: string) => String(e?.message || "").replace(/^.*?ERROR:\s*/, "") || fallback;

async function uploadPhoto(file: FormDataEntryValue | null, errPath: string): Promise<{ key: string; type: string } | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!file.type.startsWith("image/")) bounce(errPath, "Envie um arquivo de imagem.");
  if (file.size > 10 * 1024 * 1024) bounce(errPath, "A foto é muito grande. Envie uma imagem de até 10MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const key = `partners/${randomUUID()}`;
  try { await store.putObject(BUCKET(), key, buf, buf.length, { "Content-Type": file.type }); }
  catch (e) { console.error("uploadPhoto (loja) putObject falhou:", e); bounce(errPath, "Não foi possível enviar a foto agora. Tente de novo em instantes."); }
  return { key, type: file.type };
}

/** A usuária logada abre a própria loja (perfil de loja na mesma conta). Fica pendente até a equipe aprovar. */
export async function openPartnerStore(f: FormData) {
  const storeName = String(f.get("store_name") || "").trim().slice(0, 80);
  const instagram = normalizeInstagram(String(f.get("instagram") || ""));
  const whatsapp = normalizeWhatsapp(String(f.get("whatsapp") || ""));
  const pkg = String(f.get("package") || "BASICA");
  if (!storeName) bounce("/parceiras", "Informe o nome da loja.", { instagram, whatsapp });
  if (!instagram && !whatsapp) bounce("/parceiras", "Informe pelo menos um contato para as clientes: Instagram ou WhatsApp.", { store_name: storeName });
  let ok;
  try {
    ok = await withProfile(async (c, userId) => {
      await c.query("SELECT open_partner_store($1,$2,$3,$4,$5)", [userId, storeName, instagram, whatsapp, pkg]);
      return true;
    }, { allowSuspended: true });
  } catch (e) {
    bounce("/parceiras", msg(e, "Não foi possível abrir a loja agora."), { store_name: storeName, instagram, whatsapp });
  }
  if (!ok) redirect("/");
  await flash("Loja criada! Ela entra na vitrine assim que a equipe aprovar.");
  redirect(PANEL);
}

/** Nome da loja e links que as clientes usam para entrar em contato (Instagram e WhatsApp). */
export async function updatePartnerContact(f: FormData) {
  const storeName = String(f.get("store_name") || "").trim().slice(0, 80);
  const rawInstagram = String(f.get("instagram") || "").trim();
  const rawWhatsapp = String(f.get("whatsapp") || "").trim();
  const instagram = normalizeInstagram(rawInstagram);
  const whatsapp = normalizeWhatsapp(rawWhatsapp);
  if (!storeName) bounce(PANEL, "Informe o nome da loja.");
  if (rawInstagram && !instagram) bounce(PANEL, "Instagram inválido. Use só o usuário (ex.: minhaloja) ou o link do perfil.");
  if (rawWhatsapp && whatsapp.length < 12) bounce(PANEL, "WhatsApp inválido. Informe com DDD (ex.: 81 99999-9999).");
  if (!instagram && !whatsapp) bounce(PANEL, "Mantenha pelo menos um contato: Instagram ou WhatsApp.");
  const ok = await withStore(async (c, _userId, partnerId) => {
    await c.query("SELECT partner_update_contact($1,$2,$3,$4)", [partnerId, storeName, instagram, whatsapp]);
    return true;
  });
  if (!ok) redirect("/");
  await flash("Dados da loja salvos. As clientes já usam esses links.");
  redirect(PANEL);
}

export async function addPartnerItem(f: FormData) {
  const name = String(f.get("name") || "").trim();
  const description = String(f.get("description") || "").trim();
  const priceReais = Number(String(f.get("price") || "0").replace(",", ".")) || 0;
  const discount = Math.min(90, Math.max(0, Math.floor(Number(f.get("discount") || 0))));
  if (!name) bounce(PANEL, "Informe o nome da peça.");
  if (priceReais <= 0) bounce(PANEL, "Informe o preço da peça.");
  const photo = await uploadPhoto(f.get("photo"), PANEL);
  let ok;
  try {
    ok = await withStore(async (c, _userId, partnerId) => {
      const pkg = (await c.query("SELECT partner_own_package($1) p", [partnerId])).rows[0]?.p as string;
      const limit = PARTNER_PACKAGE_LIMIT[pkg] ?? null;
      await c.query("SELECT partner_add_item($1,$2,$3,$4,$5,$6,$7,$8)", [partnerId, name, description, Math.round(priceReais * 100), discount, photo?.key || "", photo?.type || "", limit]);
      return true;
    });
  } catch (e) { bounce(PANEL, msg(e, "Não foi possível publicar a peça.")); }
  if (!ok) redirect("/");
  await flash("Peça publicada na sua vitrine.");
  redirect(PANEL);
}

export async function updatePartnerItem(f: FormData) {
  const itemId = String(f.get("item_id") || "");
  const name = String(f.get("name") || "").trim();
  const description = String(f.get("description") || "").trim();
  const priceReais = Number(String(f.get("price") || "0").replace(",", ".")) || 0;
  const discount = Math.min(90, Math.max(0, Math.floor(Number(f.get("discount") || 0))));
  const active = f.get("active") === "on";
  if (!name) bounce(PANEL, "Informe o nome da peça.");
  if (priceReais <= 0) bounce(PANEL, "Informe o preço da peça.");
  const photo = await uploadPhoto(f.get("photo"), PANEL);
  let ok;
  try {
    ok = await withStore(async (c, _userId, partnerId) => {
      const pkg = (await c.query("SELECT partner_own_package($1) p", [partnerId])).rows[0]?.p as string;
      await c.query("SELECT partner_update_item($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [partnerId, itemId, name, description, Math.round(priceReais * 100), discount, active, photo?.key || "", photo?.type || "", PARTNER_PACKAGE_LIMIT[pkg] ?? null]);
      return true;
    });
  } catch (e) { bounce(PANEL, msg(e, "Não foi possível salvar a peça.")); }
  if (!ok) redirect("/");
  await flash("Peça atualizada.");
  redirect(PANEL);
}

/** Pausa ou reativa uma peça (some/volta na vitrine) sem apagar. */
export async function togglePartnerItem(f: FormData) {
  const itemId = String(f.get("item_id") || "");
  const activate = f.get("activate") === "1";
  let ok;
  try {
    ok = await withStore(async (c, _userId, partnerId) => {
      const it = (await c.query("SELECT * FROM partner_list_own_items($1)", [partnerId])).rows.find((r: any) => r.id === itemId);
      if (!it) throw new Error("Peça não encontrada.");
      const pkg = (await c.query("SELECT partner_own_package($1) p", [partnerId])).rows[0]?.p as string;
      await c.query("SELECT partner_update_item($1,$2,$3,$4,$5,$6,$7,'','',$8)",
        [partnerId, itemId, it.name, it.description, it.price_cents, it.discount_percent, activate, PARTNER_PACKAGE_LIMIT[pkg] ?? null]);
      return true;
    });
  } catch (e) { bounce(PANEL, msg(e, "Não foi possível alterar a peça.")); }
  if (!ok) redirect("/");
  await flash(activate ? "Peça de volta na vitrine." : "Peça pausada: saiu da vitrine, mas continua guardada aqui.", "info");
  redirect(PANEL);
}

export async function setPartnerLogo(f: FormData) {
  const file = f.get("logo");
  if (!(file instanceof File) || file.size === 0) bounce(PANEL, "Envie uma imagem para o logo.");
  if (!file.type.startsWith("image/")) bounce(PANEL, "Envie um arquivo de imagem.");
  if (file.size > 4 * 1024 * 1024) bounce(PANEL, "O logo é muito grande. Envie uma imagem de até 4MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const objectKey = `partners/logo-${randomUUID()}`;
  try { await store.putObject(BUCKET(), objectKey, buf, buf.length, { "Content-Type": file.type }); }
  catch (e) { console.error("setPartnerLogo putObject falhou:", e); bounce(PANEL, "Não foi possível enviar o logo agora. Tente de novo em instantes."); }
  const ok = await withStore(async (c, _userId, partnerId) => {
    await c.query("SELECT partner_set_logo($1,$2,$3)", [partnerId, objectKey, file.type]);
    return true;
  });
  if (!ok) redirect("/");
  await flash("Logo da loja salvo.");
  redirect(PANEL);
}

export async function removePartnerItem(f: FormData) {
  const itemId = String(f.get("item_id") || "");
  const ok = await withStore(async (c, _userId, partnerId) => {
    await c.query("SELECT partner_remove_item($1,$2)", [partnerId, itemId]);
    return true;
  });
  if (!ok) redirect("/");
  await flash("Peça removida.", "info");
  redirect(PANEL);
}
