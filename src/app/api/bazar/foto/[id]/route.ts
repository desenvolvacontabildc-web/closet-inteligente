import { NextResponse } from "next/server";
import { Client } from "minio";
import { withProfile } from "@/server/profile-session";
import { imageResponse, parseWidth } from "@/server/thumb";

const storage = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
async function readStream(stream: NodeJS.ReadableStream) { const chunks: Buffer[] = []; for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); }

/** Foto de um anúncio do Bazar (visível para usuárias logadas; `?w=` devolve miniatura). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Não encontrado", { status: 404 });
  const meta = await withProfile(async (c, userId) => {
    const q = await c.query("SELECT * FROM bazar_photo($1,$2)", [userId, id]);
    if (!q.rowCount) return null;
    return { key: q.rows[0].object_key as string, contentType: (q.rows[0].content_type || "image/jpeg") as string };
  });
  if (!meta) return new NextResponse("Não encontrado", { status: 404 });
  return imageResponse(req, meta.key, meta.contentType, async () => readStream(await storage.getObject(process.env.S3_BUCKET || "closet-private", meta.key)), parseWidth(req.url));
}
