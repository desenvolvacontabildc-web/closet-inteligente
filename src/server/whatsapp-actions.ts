"use server";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { flash } from "./flash";

/** Perfil: a usuária informa (ou troca/apaga) o próprio WhatsApp. */
export async function saveWhatsapp(f: FormData) {
  const raw = String(f.get("whatsapp") || "").trim();
  const msg = await withProfile(async (c, userId) => (await c.query("SELECT set_my_whatsapp($1,$2) m", [userId, raw])).rows[0].m as string);
  if (msg === null) redirect("/");
  if (msg) bounce("/perfil", msg);
  await flash(raw ? "WhatsApp salvo." : "WhatsApp removido.");
  redirect("/perfil");
}
