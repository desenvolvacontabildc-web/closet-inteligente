"use server";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";

export async function adminListPartners() {
  const result = await withProfile(async (c, userId) => {
    try { const q = await c.query("SELECT * FROM admin_list_partners($1)", [userId]); return { partners: q.rows }; }
    catch { return { partners: null }; }
  });
  if (!result) redirect("/");
  return result;
}

export async function setPartner(f: FormData) {
  const target = String(f.get("partner_id") || "");
  const pkg = String(f.get("package") || "BASICA");
  const approved = f.get("approved") === "on";
  await withProfile(async (c, userId) => {
    await c.query("SELECT admin_set_partner($1,$2,$3,$4)", [userId, target, pkg, approved]);
    return true;
  });
  redirect("/admin/parceiras");
}
