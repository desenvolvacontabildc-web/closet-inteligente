import { NextResponse } from "next/server";
import { withProfile } from "@/server/profile-session";

const UUID = /^[0-9a-f-]{36}$/i;

/** Registra o clique da cliente no contato da loja (para o painel da loja) e redireciona para o
 * WhatsApp/Instagram. O destino é montado aqui a partir do que está no banco -- nada de URL vinda
 * da query string (sem open redirect). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const via = url.searchParams.get("via");
  const item = url.searchParams.get("item") || "";
  const storeId = url.searchParams.get("store") || "";
  const back = new URL("/vitrine", url.origin);
  if ((via !== "whatsapp" && via !== "instagram") || (!UUID.test(item) && !UUID.test(storeId))) return NextResponse.redirect(back);
  const kind = via === "whatsapp" ? "CLICK_WHATSAPP" : "CLICK_INSTAGRAM";

  const contact = await withProfile(async (c, userId) => {
    const r = UUID.test(item)
      ? await c.query("SELECT * FROM record_storefront_click($1,$2,$3)", [userId, item, kind])
      : await c.query("SELECT *, NULL::text AS item_name FROM record_storefront_store_click($1,$2,$3)", [userId, storeId, kind]);
    return r.rows[0] as { store_name: string; whatsapp: string; instagram: string; item_name: string | null } | undefined;
  });
  if (!contact) return NextResponse.redirect(back);

  if (via === "whatsapp") {
    const digits = String(contact.whatsapp || "").replace(/\D/g, "");
    if (digits.length < 10) return NextResponse.redirect(back);
    const text = contact.item_name
      ? `Olá! Vi a peça "${contact.item_name}" da ${contact.store_name} no Closet Inteligente e tenho interesse.`
      : `Olá! Conheci a ${contact.store_name} no Closet Inteligente e gostaria de saber mais.`;
    return NextResponse.redirect(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`);
  }
  const handle = String(contact.instagram || "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return NextResponse.redirect(back);
  return NextResponse.redirect(`https://instagram.com/${handle}`);
}
