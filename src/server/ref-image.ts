import "server-only";
import sharp from "sharp";

/** Reduz uma foto de referência antes de mandá-la ao modelo de imagem. O custo de entrada é cobrado por tamanho da
 * imagem: em teste com 3 fotos de peças, 768 px de lado maior cortou os tokens de entrada de 3.312 para 1.696
 * (quase metade) sem mudar a qualidade do resultado. Para o rosto da usuária e para a foto de catálogo usa-se
 * 1024 px, que preserva mais detalhe. Se a redução falhar, segue com a foto original. */
export async function shrinkRef(buf: Buffer, maxPx: number, fallbackType: string): Promise<{ buf: Buffer; type: string; ext: string }> {
  try {
    const out = await sharp(buf).rotate().resize({ width: maxPx, height: maxPx, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    return { buf: out, type: "image/jpeg", ext: "jpg" };
  } catch (e) {
    console.error("shrinkRef falhou, usando a foto original:", e);
    return { buf, type: fallbackType, ext: fallbackType.includes("png") ? "png" : "jpg" };
  }
}
