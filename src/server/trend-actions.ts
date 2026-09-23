"use server";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
const store = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });

export async function createTrend(f: FormData) {
  const title = String(f.get("title") || "").trim();
  const body = String(f.get("body") || "").trim();
  const file = f.get("photo");
  if (!title) bounce("/admin/tendencias", "Informe um título pra dica.");
  let objectKey = "", contentType = "";
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) bounce("/admin/tendencias", "Envie um arquivo de imagem.");
    const buf = Buffer.from(await file.arrayBuffer());
    objectKey = `trends/${randomUUID()}`;
    contentType = file.type;
    await store.putObject(process.env.S3_BUCKET || "closet-private", objectKey, buf, buf.length, { "Content-Type": contentType });
  }
  await withProfile(async (c, userId) => {
    await c.query("SELECT admin_create_trend($1,$2,$3,$4,$5)", [userId, title, body, objectKey, contentType]);
    return true;
  });
  redirect("/admin/tendencias");
}

export async function setTrendActive(f: FormData) {
  const id = String(f.get("id") || "");
  const active = f.get("active") === "on";
  await withProfile(async (c, userId) => {
    await c.query("SELECT admin_set_trend_active($1,$2,$3)", [userId, id, active]);
    return true;
  });
  redirect("/admin/tendencias");
}

export async function adminListTrends() {
  const result = await withProfile(async (c, userId) => {
    try { return (await c.query("SELECT * FROM admin_list_trends($1)", [userId])).rows; }
    catch { return null; }
  });
  return result;
}
