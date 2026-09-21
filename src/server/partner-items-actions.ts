"use server";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { withPartner } from "./partner-auth";
import { PARTNER_PACKAGE_LIMIT } from "./partner-limits";
const store = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });

export async function addPartnerItem(f: FormData) {
  const name = String(f.get("name") || "").trim();
  const description = String(f.get("description") || "").trim();
  const priceReais = Number(String(f.get("price") || "0").replace(",", ".")) || 0;
  const discount = Math.min(90, Math.max(0, Number(f.get("discount") || 0)));
  const file = f.get("photo");
  if (!name) throw new Error("Informe o nome da peça.");
  let objectKey = "", contentType = "";
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) throw new Error("Envie uma imagem.");
    const buf = Buffer.from(await file.arrayBuffer());
    objectKey = `partners/${randomUUID()}`;
    contentType = file.type;
    await store.putObject(process.env.S3_BUCKET || "closet-private", objectKey, buf, buf.length, { "Content-Type": contentType });
  }
  const result = await withPartner(async (c, partnerId, _store, pkg) => {
    const limit = PARTNER_PACKAGE_LIMIT[pkg] ?? null;
    await c.query("SELECT partner_add_item($1,$2,$3,$4,$5,$6,$7,$8)", [partnerId, name, description, Math.round(priceReais * 100), discount, objectKey, contentType, limit]);
    return true;
  });
  if (!result) redirect("/parceiras");
  redirect("/parceiras/painel");
}

export async function removePartnerItem(f: FormData) {
  const itemId = String(f.get("item_id") || "");
  const result = await withPartner(async (c, partnerId) => {
    await c.query("SELECT partner_remove_item($1,$2)", [partnerId, itemId]);
    return true;
  });
  if (!result) redirect("/parceiras");
  redirect("/parceiras/painel");
}
