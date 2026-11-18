"use server";
import { withProfile } from "./profile-session";

const B64 = /^[A-Za-z0-9_-]{8,200}$/;

/** Guarda a inscrição de notificações deste aparelho para a usuária logada. */
export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<boolean> {
  const e = String(sub?.endpoint || ""), p = String(sub?.keys?.p256dh || ""), a = String(sub?.keys?.auth || "");
  if (!/^https:\/\/[^\s]{10,780}$/.test(e) || !B64.test(p) || !B64.test(a)) return false;
  const ok = await withProfile(async (c, userId) => { await c.query("SELECT save_push_subscription($1,$2,$3,$4)", [userId, e, p, a]); return true; }, { allowSuspended: true });
  return !!ok;
}
export async function removePushSubscription(endpoint: string): Promise<boolean> {
  const e = String(endpoint || "");
  if (!/^https:\/\/[^\s]{10,780}$/.test(e)) return false;
  const ok = await withProfile(async (c, userId) => { await c.query("SELECT delete_push_subscription($1,$2)", [userId, e]); return true; }, { allowSuspended: true });
  return !!ok;
}
