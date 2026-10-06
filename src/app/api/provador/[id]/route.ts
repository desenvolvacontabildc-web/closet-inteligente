import { NextResponse } from "next/server";
import { Client } from "minio";
import { withProfile } from "@/server/profile-session";

const storage = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
async function readStream(stream: NodeJS.ReadableStream) { const chunks: Buffer[] = []; for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); }

/** Imagem do Provador: só a dona da loja enxerga (a identidade vem da sessão, nunca do cliente). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Não encontrado", { status: 404 });
  const result = await withProfile(async (c, userId) => {
    const partnerId = (await c.query("SELECT my_partner_id($1) id", [userId])).rows[0]?.id;
    if (!partnerId) return null;
    const q = await c.query("SELECT * FROM partner_provador_look_file($1,$2)", [partnerId, id]);
    return q.rowCount ? { key: q.rows[0].object_key as string, contentType: (q.rows[0].content_type as string) || "image/png" } : null;
  }, { allowSuspended: true });
  if (!result) return new NextResponse("Não encontrado", { status: 404 });
  const body = await readStream(await storage.getObject(process.env.S3_BUCKET || "closet-private", result.key));
  return new NextResponse(new Uint8Array(body), { headers: { "Content-Type": result.contentType, "Content-Disposition": `inline; filename="provador-${id.slice(0, 8)}.png"`, "Cache-Control": "private, max-age=300" } });
}
