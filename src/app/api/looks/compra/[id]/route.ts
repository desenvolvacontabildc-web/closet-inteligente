import { NextResponse } from "next/server";
import { Client } from "minio";
import { withProfile } from "@/server/profile-session";
import { imageResponse, parseWidth } from "@/server/thumb";

const storage = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
async function readStream(stream: NodeJS.ReadableStream) { const chunks: Buffer[] = []; for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); }

/** Imagem de um look "com peças para comprar". Só a dona do look enxerga (a leitura passa pela segurança por usuária do banco). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Não encontrado", { status: 404 });
  const key = await withProfile(async (c) => (await c.query("SELECT illustration_object_key k FROM wish_looks WHERE id=$1", [id])).rows[0]?.k as string | null);
  if (!key) return new NextResponse("Não encontrado", { status: 404 });
  return imageResponse(req, key, "image/png", async () => readStream(await storage.getObject(process.env.S3_BUCKET || "closet-private", key)), parseWidth(req.url));
}
