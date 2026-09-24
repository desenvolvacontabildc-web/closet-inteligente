"use server";
import OpenAI, { toFile } from "openai";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import type { PoolClient } from "pg";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { checkImageAllowance } from "./limits";
const store = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });

async function readObject(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const ch of await store.getObject(process.env.S3_BUCKET || "closet-private", key) as any) chunks.push(Buffer.from(ch));
  return Buffer.concat(chunks);
}

/** Gera o avatar de estilo (croqui com as proporções reais da cliente, sem rosto real)
 * a partir da foto de corpo inteiro enviada com consentimento. Falha aqui não deve
 * impedir o cadastro -- é uma melhoria opcional, não bloqueante. */
export async function generateBodyAvatar(c: PoolClient, userId: string, bodyPhotoKey: string, bodyPhotoContentType: string): Promise<void> {
  const allowance = await checkImageAllowance(c, userId);
  if (!allowance.ok) return;
  try {
    const buf = await readObject(bodyPhotoKey);
    const file = await toFile(buf, "body-ref.png", { type: bodyPhotoContentType });
    const openai = new OpenAI({ timeout: 120000 });
    const img = await openai.images.edit({
      model: "gpt-image-2.5-sunburst",
      image: file,
      size: "1024x1024",
      quality: "medium",
      prompt: "Use esta foto só como referência de proporções e silhueta do corpo (altura, formato). Gere um avatar de estilo: ilustração editorial de moda, croqui de corpo inteiro, pose neutra de frente, SEM rosto detalhado e sem identidade real (rosto genérico ou estilizado), roupa básica neutra (não a da foto). Fundo branco liso, traço elegante, sem texto na imagem.",
    });
    const b64 = img.data?.[0]?.b64_json;
    if (!b64) return;
    const outBuf = Buffer.from(b64, "base64");
    const key = `avatars/${userId}-illustration-${randomUUID()}.png`;
    await store.putObject(process.env.S3_BUCKET || "closet-private", key, outBuf, outBuf.length, { "Content-Type": "image/png" });
    await c.query("UPDATE profiles SET avatar_illustration_object_key=$1 WHERE user_id=$2", [key, userId]);
    await c.query("SELECT log_image_generation($1,current_setting('app.tenant_id')::uuid)", [userId]);
  } catch {
    /* melhoria opcional -- não bloqueia o cadastro nem quebra a tela */
  }
}

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
