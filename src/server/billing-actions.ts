"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
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
  });
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
  });
  if (!saved) redirect("/assinatura");
  redirect("/assinatura?charge=pix");
}

/** Cria a assinatura recorrente de cartão e redireciona pra página hospedada do Mercado
 * Pago, onde a cliente digita o cartão -- nunca passa pelo nosso servidor. */
export async function startCardCheckout(f: FormData) {
  const plan = String(f.get("plan") || "");
  const ctx = await withProfile(async (c, userId) => {
    const amountCents = await planAmountCents(c, plan);
    if (!amountCents) return { ok: false as const, message: "Plano inválido." };
    const email = (await c.query("SELECT email FROM app_users WHERE id=$1", [userId])).rows[0]?.email;
    return { ok: true as const, userId, email, amountCents };
  });
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
  });
  if (!saved) redirect("/assinatura");
  redirect(preapproval.initPoint);
}
