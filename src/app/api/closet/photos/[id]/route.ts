import { NextResponse } from "next/server";
import { Client } from "minio";
import { withProfile } from "@/server/profile-session";
import { imageResponse, parseWidth } from "@/server/thumb";

const storage = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
async function readStream(stream: NodeJS.ReadableStream) { const chunks: Buffer[] = []; for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); }

/** Foto de uma peça. Se a peça já tem foto padronizada (versão de catálogo), a foto mais recente dela é servida
 * já padronizada; `?orig=1` devolve sempre a foto original enviada pela usuária. `?w=480` devolve uma miniatura
 * leve (WebP) para listas e galerias -- a foto inteira só é pedida na tela da própria peça. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const orig = url.searchParams.get("orig") === "1";
  const w = parseWidth(req.url);
  // Só o banco dentro da transação; a leitura do arquivo (lenta) acontece depois, sem conexão presa.
  const meta = await withProfile(async (c, userId) => {
    const q = await c.query(
      `SELECT p.object_key, p.content_type, ci.standard_object_key, ci.standard_content_type,
              (SELECT p2.id FROM closet_item_photos p2 WHERE p2.item_id = p.item_id ORDER BY p2.created_at DESC LIMIT 1) AS latest_id
       FROM closet_item_photos p JOIN closet_items ci ON ci.id = p.item_id
       WHERE p.id = $1 AND p.user_id = $2`, [id, userId]);
    if (!q.rowCount) return null;
    const r = q.rows[0];
    const useStandard = !orig && r.standard_object_key && r.latest_id === id;
    return {
      key: (useStandard ? r.standard_object_key : r.object_key) as string,
      contentType: (useStandard ? (r.standard_content_type || "image/png") : r.content_type) as string,
    };
  });
  if (!meta) return new NextResponse("Não encontrado", { status: 404 });
  return imageResponse(req, meta.key, meta.contentType, async () => readStream(await storage.getObject(process.env.S3_BUCKET || "closet-private", meta.key)), w);
}
