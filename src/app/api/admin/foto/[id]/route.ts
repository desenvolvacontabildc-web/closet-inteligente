import { NextResponse } from "next/server";
import { Client } from "minio";
import { withProfile } from "@/server/profile-session";
import { imageResponse, parseWidth } from "@/server/thumb";

const storage = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
async function readStream(stream: NodeJS.ReadableStream) { const chunks: Buffer[] = []; for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); }

/** Foto de uma peça para a administradora (modo suporte). Só funciona para conta administradora (a função do banco
 * recusa as outras) e só serve fotos de peças, nunca avatar, foto de corpo ou foto de colorimetria. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Não encontrado", { status: 404 });
  const w = parseWidth(req.url);
  const meta = await withProfile(async (c, userId) => {
    try {
      const r = (await c.query("SELECT * FROM admin_photo_object($1,$2)", [userId, id])).rows[0];
      if (!r) return null;
      const std = r.is_latest && r.standard_object_key;
      return { key: String(std ? r.standard_object_key : r.object_key), contentType: String(std ? r.standard_content_type || "image/png" : r.content_type) };
    } catch { return null; }
  });
  if (!meta) return new NextResponse("Não encontrado", { status: 404 });
  return imageResponse(req, meta.key, meta.contentType, async () => readStream(await storage.getObject(process.env.S3_BUCKET || "closet-private", meta.key)), w);
}
