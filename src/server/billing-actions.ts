"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { flash } from "./flash";
import { createPixPayment, createPreapproval } from "./mercadopago";

const PLANS = ["ARRUMADA", "FASHION", "SUPER_STAR"] as const;
type PlanId = typeof PLANS[number];

async function planAmountCents(c: any, plan: string): Promise<number | null> {
  if (!PLANS.includes(plan as PlanId)) return null;
  const r = await c.query("SELECT base_price_cents FROM get_plan_config($1)", [plan]);
  return r.rows[0]?.base_price_cents ?? null;
}

/** Gera uma cobrança Pix avulsa pro plano escolhido. Pix não é recorrente nativamente --
 * cada ciclo (mês) gera uma cobrança nova; o webhook confirma o pagamento e ativa 30 dias. */
export async function startPixCheckout(f: FormData) {
  const plan = String(f.get("plan") || "");
  const ctx = await withProfile(async (c, userId) => {
    const amountCents = await planAmountCents(c, plan);
    if (!amountCents) return { ok: false as const, message: "Plano inválido." };
    const email = (await c.query("SELECT email FROM app_users WHERE id=$1", [userId])).rows[0]?.email;
    return { ok: true as const, userId, email, amountCents };
  }, { allowSuspended: true });
  if (!ctx) redirect("/assinatura");
  if (!ctx.ok) bounce("/assinatura", ctx.message);

  let charge;
  try {
    charge = await createPixPayment({
      amountCents: ctx.amountCents,
      description: `Closet Inteligente - plano ${plan}`,
      payerEmail: ctx.email,
      externalReference: ctx.userId,
      idempotencyKey: randomUUID(),
    });
  } catch (e) {
    console.error("startPixCheckout falhou:", e);
    bounce("/assinatura", "Não foi possível gerar a cobrança Pix agora. Tente de novo em instantes.");
  }

  const saved = await withProfile(async (c, userId) => {
    await c.query(
      "SELECT create_payment_charge($1,'PIX',$2,$3,$4,$5,$6,$7)",
      [userId, plan, ctx.amountCents, charge.id, charge.qrCode, charge.qrCodeBase64, charge.expiresAt],
    );
    return true;
  }, { allowSuspended: true });
  if (!saved) redirect("/assinatura");
  await flash("Pix gerado. Escaneie o QR code ou copie o código para pagar.");
  redirect("/assinatura?charge=pix");
}

/** Cria a assinatura recorrente de cartão e redireciona pra página hospedada do Mercado
 * Pago, onde a cliente digita o cartão -- nunca passa pelo nosso servidor. */
export async function startCardCheckout(f: FormData) {
  const plan = String(f.get("plan") || "");
  const ctx = await withProfile(async (c, userId) => {
    let amountCents: number = (await planAmountCents(c, plan)) ?? 0;
    if (!amountCents) return { ok: false as const, message: "Plano inválido." };
    // Desconto dos primeiros meses no cartão recorrente -- só na 1ª assinatura por cartão da conta
    // (quem já teve uma assinatura de cartão autorizada paga o preço cheio).
    const pricing = (await c.query("SELECT promo_price_cents, promo_months FROM get_plan_pricing($1)", [plan])).rows[0];
    const usedPromo = (await c.query("SELECT 1 FROM payment_charges WHERE kind='CARD_PREAPPROVAL' AND status='approved' LIMIT 1")).rowCount! > 0;
    if (pricing?.promo_price_cents != null && pricing.promo_months > 0 && !usedPromo) amountCents = pricing.promo_price_cents;
    const email = (await c.query("SELECT email FROM app_users WHERE id=$1", [userId])).rows[0]?.email;
    return { ok: true as const, userId, email, amountCents };
  }, { allowSuspended: true });
  if (!ctx) redirect("/assinatura");
  if (!ctx.ok) bounce("/assinatura", ctx.message);

  let preapproval;
  try {
    preapproval = await createPreapproval({
      amountCents: ctx.amountCents,
      reason: `Closet Inteligente - plano ${plan}`,
      payerEmail: ctx.email,
      externalReference: ctx.userId,
      backUrl: `${process.env.APP_URL || ""}/assinatura?charge=card`,
    });
  } catch (e) {
    console.error("startCardCheckout falhou:", e);
    bounce("/assinatura", "Não foi possível iniciar a assinatura por cartão agora. Tente de novo em instantes.");
  }

  const saved = await withProfile(async (c, userId) => {
    await c.query("SELECT set_pending_preapproval($1,$2,$3,$4)", [userId, preapproval.id, plan, ctx.amountCents]);
    return true;
  }, { allowSuspended: true });
  if (!saved) redirect("/assinatura");
  redirect(preapproval.initPoint);
}
