import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";

/** Miniaturas sob demanda. As fotos originais têm ~1 MB; nas listas (closet, looks, mala) a tela só precisa de
 * algo na casa de 20 a 60 KB. A miniatura é gerada uma vez, guardada em memória (LRU) e servida com ETag. */
const WIDTHS = [200, 360, 480, 640, 960];
const MAX_ENTRIES = 600;
const cache = new Map<string, Buffer>();

/** Lê `?w=` da URL e arredonda para uma das larguras permitidas (evita gerar infinitas variantes). */
export function parseWidth(url: string): number | null {
  const w = Number(new URL(url).searchParams.get("w"));
  if (!Number.isFinite(w) || w <= 0) return null;
  return WIDTHS.find((x) => x >= w) ?? WIDTHS[WIDTHS.length - 1];
}

/** `key` identifica o conteúdo (muda quando a imagem é regerada); `load` busca os bytes originais. */
export async function imageResponse(req: Request, key: string, contentType: string, load: () => Promise<Buffer>, w: number | null): Promise<NextResponse> {
  const etag = `"${createHash("sha1").update(`${key}@${w || 0}`).digest("hex").slice(0, 24)}"`;
  // Curto o bastante para a foto regerada aparecer logo; a revalidação por ETag é barata (304, sem corpo).
  const base = { ETag: etag, "Cache-Control": "private, max-age=120, stale-while-revalidate=86400" };
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: base });

  if (w) {
    const ck = `${key}@${w}`;
    let buf = cache.get(ck);
    if (buf) { cache.delete(ck); cache.set(ck, buf); }
    else {
      try {
        const src = await load();
        buf = await sharp(src).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
        cache.set(ck, buf);
        if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
      } catch (e) {
        console.error("thumb: falha ao gerar miniatura, servindo original:", e);
        const src = await load();
        return new NextResponse(new Uint8Array(src), { headers: { ...base, "Content-Type": contentType } });
      }
    }
    return new NextResponse(new Uint8Array(buf), { headers: { ...base, "Content-Type": "image/webp" } });
  }
  const body = await load();
  return new NextResponse(new Uint8Array(body), { headers: { ...base, "Content-Type": contentType } });
}
