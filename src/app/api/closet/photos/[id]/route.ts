import { NextResponse } from "next/server";
import { Client } from "minio";
import { withProfile } from "@/server/profile-session";

const storage = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
async function readStream(stream: NodeJS.ReadableStream) { const chunks: Buffer[] = []; for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); }

/** Foto de uma peça. Se a peça já tem foto padronizada (versão de catálogo), a foto mais recente dela é servida
 * já padronizada; `?orig=1` devolve sempre a foto original enviada pela usuária. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orig = new URL(req.url).searchParams.get("orig") === "1";
  const result = await withProfile(async (c, userId) => {
    const q = await c.query(
      `SELECT p.object_key, p.content_type, ci.standard_object_key, ci.standard_content_type,
              (SELECT p2.id FROM closet_item_photos p2 WHERE p2.item_id = p.item_id ORDER BY p2.created_at DESC LIMIT 1) AS latest_id
       FROM closet_item_photos p JOIN closet_items ci ON ci.id = p.item_id
       WHERE p.id = $1 AND p.user_id = $2`, [id, userId]);
    if (!q.rowCount) return null;
    const r = q.rows[0];
    const useStandard = !orig && r.standard_object_key && r.latest_id === id;
    const key = useStandard ? r.standard_object_key : r.object_key;
    const contentType = useStandard ? (r.standard_content_type || "image/png") : r.content_type;
    return { body: await readStream(await storage.getObject(process.env.S3_BUCKET || "closet-private", key)), contentType };
  });
  if (!result) return new NextResponse("Não encontrado", { status: 404 });
  return new NextResponse(new Uint8Array(result.body), { headers: { "Content-Type": result.contentType, "Cache-Control": "private, max-age=60" } });
}
