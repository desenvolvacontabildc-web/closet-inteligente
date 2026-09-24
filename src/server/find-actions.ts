"use server";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
const store = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });

export async function createFind(f: FormData) {
  const title = String(f.get("title") || "").trim();
  const description = String(f.get("description") || "").trim();
  const priceReais = Number(String(f.get("price") || "").replace(",", "."));
  const externalUrl = String(f.get("external_url") || "").trim();
  const file = f.get("photo");
  if (!title) bounce("/admin/achadinhos", "Informe um título.");
  if (!/^https?:\/\//i.test(externalUrl)) bounce("/admin/achadinhos", "Informe um link válido (começando com http:// ou https://).");
  let objectKey = "", contentType = "";
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) bounce("/admin/achadinhos", "Envie um arquivo de imagem.");
    const buf = Buffer.from(await file.arrayBuffer());
    objectKey = `finds/${randomUUID()}`;
    contentType = file.type;
    await store.putObject(process.env.S3_BUCKET || "closet-private", objectKey, buf, buf.length, { "Content-Type": contentType });
  }
  await withProfile(async (c, userId) => {
    await c.query("SELECT admin_create_find($1,$2,$3,$4,$5,$6,$7)", [userId, title, description, Number.isFinite(priceReais) ? Math.round(priceReais * 100) : null, externalUrl, objectKey, contentType]);
    return true;
  });
  redirect("/admin/achadinhos");
}

export async function updateFind(f: FormData) {
  const id = String(f.get("id") || "");
  const title = String(f.get("title") || "").trim();
  const description = String(f.get("description") || "").trim();
  const priceReais = Number(String(f.get("price") || "").replace(",", "."));
  const externalUrl = String(f.get("external_url") || "").trim();
  const file = f.get("photo");
  if (!title) bounce("/admin/achadinhos", "Informe um título.");
  if (!/^https?:\/\//i.test(externalUrl)) bounce("/admin/achadinhos", "Informe um link válido (começando com http:// ou https://).");
  await withProfile(async (c, userId) => {
    await c.query("SELECT admin_update_find($1,$2,$3,$4,$5,$6)", [userId, id, title, description, Number.isFinite(priceReais) ? Math.round(priceReais * 100) : null, externalUrl]);
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/")) bounce("/admin/achadinhos", "Envie um arquivo de imagem.");
      const buf = Buffer.from(await file.arrayBuffer());
      const objectKey = `finds/${randomUUID()}`;
      await store.putObject(process.env.S3_BUCKET || "closet-private", objectKey, buf, buf.length, { "Content-Type": file.type });
      await c.query("SELECT admin_set_find_photo($1,$2,$3,$4)", [userId, id, objectKey, file.type]);
    }
    return true;
  });
  redirect("/admin/achadinhos");
}

export async function setFindActive(f: FormData) {
  const id = String(f.get("id") || "");
  const active = f.get("active") === "on";
  await withProfile(async (c, userId) => {
    await c.query("SELECT admin_set_find_active($1,$2,$3)", [userId, id, active]);
    return true;
  });
  redirect("/admin/achadinhos");
}

export async function adminListFinds() {
  const result = await withProfile(async (c, userId) => {
    try { return (await c.query("SELECT * FROM admin_list_finds($1)", [userId])).rows; }
    catch { return null; }
  });
  return result;
}
