"use server";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
const store = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });

export async function uploadAvatar(f: FormData) {
  const file = f.get("avatar");
  const redirectTo = String(f.get("redirect_to") || "/perfil");
  if (!(file instanceof File) || file.size === 0) bounce(redirectTo, "Envie uma foto.");
  if (!file.type.startsWith("image/")) bounce(redirectTo, "Envie um arquivo de imagem.");
  if (file.size > 8 * 1024 * 1024) bounce(redirectTo, "A foto é muito grande. Envie uma imagem de até 8MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const objectKey = `avatars/${randomUUID()}`;
  await store.putObject(process.env.S3_BUCKET || "closet-private", objectKey, buf, buf.length, { "Content-Type": file.type });
  await withProfile(async (c, userId) => {
    await c.query("UPDATE profiles SET avatar_object_key=$1, avatar_content_type=$2, updated_at=now() WHERE user_id=$3", [objectKey, file.type, userId]);
    return true;
  });
  redirect(redirectTo);
}
