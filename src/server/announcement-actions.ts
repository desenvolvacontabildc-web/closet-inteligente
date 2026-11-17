"use server";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";

/** A usuária dispensa um comunicado ("Entendi"): ele não aparece mais para ela. */
export async function dismissAnnouncement(f: FormData) {
  const id = String(f.get("id") || "");
  if (/^[0-9a-f-]{36}$/i.test(id)) await withProfile(async (c, userId) => { await c.query("SELECT dismiss_announcement($1,$2)", [userId, id]); return true; }, { allowSuspended: true });
  redirect("/home");
}
