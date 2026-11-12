import { NextResponse } from "next/server";
import { withProfile } from "@/server/profile-session";

const UUID = /^[0-9a-f-]{36}$/i;

/** Registra o interesse e abre o WhatsApp da anunciante. O número vem do banco (nunca da URL) e só é
 * usado aqui, no servidor, para montar o link: ele não aparece nas listas nem no HTML da página. */
export async function GET(req: Request) {
  const post = new URL(req.url).searchParams.get("post") || "";
  const go = (location: string) => new NextResponse(null, { status: 302, headers: { Location: location } });
  if (!UUID.test(post)) return go("/bazar");
  const contact = await withProfile(async (c, userId) => (await c.query("SELECT * FROM bazar_contact($1,$2)", [userId, post])).rows[0] as { whatsapp: string; title: string; kind: string; owner_name: string } | undefined);
  if (!contact) return go(`/bazar/${post}`);
  const digits = String(contact.whatsapp || "").replace(/\D/g, "");
  if (digits.length < 12) return go(`/bazar/${post}`);
  const what = contact.kind === "ALUGUEL" ? "para alugar" : "no bazar";
  const text = `Olá, ${contact.owner_name}! Vi sua peça "${contact.title}" ${what} no Bazar do Closet Inteligente e tenho interesse. Ainda está disponível?`;
  return go(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`);
}
