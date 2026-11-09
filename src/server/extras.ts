import "server-only";
import type { PoolClient } from "pg";
import { mySubscription, type Plan } from "./limits";

export type Extra = "COLORIMETRIA" | "CUIDESE";
export const EXTRA_NAME: Record<Extra | "CREDITOS", string> = { COLORIMETRIA: "Colorimetria pessoal", CUIDESE: "Cuide-se (Skincare e Cronograma Capilar)", CREDITOS: "Créditos de imagem" };

export type CuideseAccess = {
  access: boolean;
  /** Por que tem acesso: administradora, teste gratuito, incluído no plano ou add-on pago. */
  via: "ADMIN" | "TRIAL" | "PLAN" | "ADDON" | null;
  until: Date | null;
  method: string | null;
};

/** O Cuide-se (Skincare + Cronograma Capilar) está incluído no teste gratuito e nos planos Fashion e Super Star;
 * no Arrumada é um add-on pago. Sem acesso, as telas mostram a oferta de compra. */
export async function cuideseAccess(c: PoolClient, userId: string): Promise<CuideseAccess> {
  const admin = (await c.query("SELECT is_admin FROM app_users WHERE id=$1", [userId])).rows[0]?.is_admin;
  if (admin) return { access: true, via: "ADMIN", until: null, method: null };
  const sub = await mySubscription(c, userId);
  if (sub.status === "TRIAL") return { access: true, via: "TRIAL", until: sub.trial_ends_at ? new Date(sub.trial_ends_at) : null, method: null };
  const includedPlan = (["FASHION", "SUPER_STAR"] as Plan[]).includes(sub.plan);
  if (includedPlan && ["ACTIVE", "PAST_DUE"].includes(sub.status)) return { access: true, via: "PLAN", until: sub.current_period_end, method: null };
  const a = (await c.query("SELECT active_until, payment_method FROM my_cuidese($1)", [userId])).rows[0];
  if (a && new Date(a.active_until).getTime() > Date.now()) return { access: true, via: "ADDON", until: new Date(a.active_until), method: a.payment_method };
  return { access: false, via: null, until: a ? new Date(a.active_until) : null, method: a?.payment_method ?? null };
}

export async function hasCuidese(c: PoolClient, userId: string): Promise<boolean> {
  return (await cuideseAccess(c, userId)).access;
}

export async function extraPricing(c: PoolClient, product: Extra): Promise<{ price_cents: number; promo_price_cents: number | null; promo_months: number }> {
  const r = (await c.query("SELECT price_cents, promo_price_cents, promo_months FROM extra_price_info($1)", [product])).rows[0];
  return r || { price_cents: 0, promo_price_cents: null, promo_months: 0 };
}

export const brl = (cents: number): string => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
