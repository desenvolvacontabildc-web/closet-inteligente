"use server";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { flash } from "./flash";

const BACK = "/admin/parceiras";

export async function adminListPartners() {
  const result = await withProfile(async (c, userId) => {
    try { const q = await c.query("SELECT * FROM admin_list_partners($1)", [userId]); return { partners: q.rows }; }
    catch (e) { console.error("adminListPartners falhou:", e); return { partners: null }; }
  });
  if (!result) redirect("/");
  return result;
}

export async function adminPartnerPrices() {
  const result = await withProfile(async (c, userId) => {
    try { return (await c.query("SELECT * FROM admin_list_partner_prices($1)", [userId])).rows; }
    catch (e) { console.error("adminPartnerPrices falhou:", e); return null; }
  });
  return result || [];
}

export async function adminPartnerCharges(partnerId: string) {
  const result = await withProfile(async (c, userId) => {
    try { return (await c.query("SELECT * FROM admin_partner_charges($1,$2)", [userId, partnerId])).rows; }
    catch (e) { console.error("adminPartnerCharges falhou:", e); return null; }
  });
  return result || [];
}

/** Aprova/reprova a loja, troca o pacote e deixa um recado que a loja vê no painel dela. */
export async function setPartner(f: FormData) {
  const target = String(f.get("partner_id") || "");
  const pkg = String(f.get("package") || "BASICA");
  const approved = f.get("approved") === "on";
  const note = String(f.get("note") || "").trim().slice(0, 400);
  try {
    await withProfile(async (c, userId) => {
      await c.query("SELECT admin_set_partner($1,$2,$3,$4,$5)", [userId, target, pkg, approved, note]);
      return true;
    });
  } catch (e) { console.error("setPartner falhou:", e); bounce(BACK, "Não foi possível salvar a loja."); }
  await flash(approved ? "Loja salva e aprovada: ela já enxerga o aviso no painel." : "Loja salva (não aprovada).");
  redirect(BACK);
}

/** Cortesia: libera N dias de vitrine sem cobrar. */
export async function grantPartnerDays(f: FormData) {
  const target = String(f.get("partner_id") || "");
  const days = Math.floor(Number(f.get("days") || 0));
  if (!(days >= 1 && days <= 3650)) bounce(BACK, "Informe entre 1 e 3650 dias.");
  try {
    await withProfile(async (c, userId) => {
      await c.query("SELECT admin_grant_partner_days($1,$2,$3)", [userId, target, days]);
      return true;
    });
  } catch (e) { console.error("grantPartnerDays falhou:", e); bounce(BACK, "Não foi possível liberar os dias."); }
  await flash(`${days} dia${days === 1 ? "" : "s"} de vitrine liberado${days === 1 ? "" : "s"} (cortesia).`);
  redirect(BACK);
}

export async function setPartnerPrice(f: FormData) {
  const pkg = String(f.get("package") || "");
  const cents = Math.round((Number(String(f.get("price") || "0").replace(",", ".")) || 0) * 100);
  try {
    await withProfile(async (c, userId) => {
      await c.query("SELECT admin_set_partner_price($1,$2,$3)", [userId, pkg, cents]);
      return true;
    });
  } catch (e) { console.error("setPartnerPrice falhou:", e); bounce(BACK, "Não foi possível salvar o preço."); }
  await flash("Preço do pacote salvo. Vale para as próximas cobranças.");
  redirect(BACK);
}
