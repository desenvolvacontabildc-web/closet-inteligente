"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { flash } from "./flash";
import { createPixPayment, createPreapproval } from "./mercadopago";
import { cuideseAccess, extraPricing, EXTRA_NAME, type Extra } from "./extras";

const BACK = "/assinatura/extras";
const isExtra = (v: string): v is Extra => v === "COLORIMETRIA" || v === "CUIDESE";

/** Valida a compra: Colorimetria é única (quem já tem não compra de novo); Cuide-se não se vende a quem já
 * tem acesso pelo plano ou pelo teste. */
async function context(product: Extra) {
  const ctx = await withProfile(async (c, userId) => {
    const email = (await c.query("SELECT email FROM app_users WHERE id=$1", [userId])).rows[0]?.email as string;
    const pricing = await extraPricing(c, product);
    if (!pricing.price_cents) return { ok: false as const, message: "Esse extra não está disponível para compra agora." };
    if (product === "COLORIMETRIA") {
      const mod = (await c.query("SELECT status FROM my_module_status($1,'COLORIMETRIA')", [userId])).rows[0]?.status;
      if (mod && mod !== "NAO_ADQUIRIDA") return { ok: false as const, message: "Você já tem a Colorimetria liberada." };
    } else {
      const acc = await cuideseAccess(c, userId);
      if (acc.via === "ADMIN" || acc.via === "PLAN" || acc.via === "TRIAL") return { ok: false as const, message: "O Cuide-se já está incluído no seu acesso atual." };
    }
    const promoUsed = product === "CUIDESE" ? !!(await c.query("SELECT extra_card_promo_used($1,'CUIDESE') u", [userId])).rows[0]?.u : true;
    return { ok: true as const, userId, email, pricing, promoUsed };
  });
  if (!ctx) redirect("/");
  if (!ctx.ok) bounce(BACK, ctx.message);
  return ctx;
}

/** Pix avulso: Colorimetria (compra única) ou +30 dias de Cuide-se. */
export async function startExtraPix(f: FormData) {
  const product = String(f.get("product") || "");
  if (!isExtra(product)) bounce(BACK, "Produto inválido.");
  const ctx = await context(product);
  let charge;
  try {
    charge = await createPixPayment({
      amountCents: ctx.pricing.price_cents,
      description: `Closet Inteligente - ${EXTRA_NAME[product]}`,
      payerEmail: ctx.email,
      externalReference: `extra:${ctx.userId}`,
      idempotencyKey: randomUUID(),
    });
  } catch (e) {
    console.error("startExtraPix falhou:", e);
    bounce(BACK, "Não foi possível gerar a cobrança Pix agora. Tente de novo em instantes.");
  }
  const saved = await withProfile(async (c, userId) => {
    await c.query("SELECT extra_create_charge($1,$2,'PIX',$3,0,$4,$5,$6,$7)",
      [userId, product, ctx.pricing.price_cents, charge.id, charge.qrCode, charge.qrCodeBase64, charge.expiresAt]);
    return true;
  });
  if (!saved) redirect("/");
  await flash("Pix gerado. Escaneie o QR code ou copie o código para pagar.");
  redirect(`${BACK}?produto=${product.toLowerCase()}`);
}

/** Cartão recorrente do Cuide-se, com o desconto dos primeiros meses (só na primeira assinatura de cartão). */
export async function startCuideseCard() {
  const ctx = await context("CUIDESE");
  const p = ctx.pricing;
  const promo = p.promo_price_cents != null && p.promo_months > 0 && !ctx.promoUsed;
  const amountCents = promo ? (p.promo_price_cents as number) : p.price_cents;
  let preapproval;
  try {
    preapproval = await createPreapproval({
      amountCents,
      reason: `Closet Inteligente - ${EXTRA_NAME.CUIDESE}`,
      payerEmail: ctx.email,
      externalReference: `extra:${ctx.userId}`,
      backUrl: `${process.env.APP_URL || ""}${BACK}?pagamento=cartao`,
    });
  } catch (e) {
    console.error("startCuideseCard falhou:", e);
    bounce(BACK, "Não foi possível iniciar a assinatura por cartão agora. Tente de novo em instantes.");
  }
  const saved = await withProfile(async (c, userId) => {
    await c.query("SELECT extra_create_charge($1,'CUIDESE','CARD_PREAPPROVAL',$2,$3,$4,NULL,NULL,NULL)",
      [userId, amountCents, promo ? p.promo_months : 0, preapproval.id]);
    return true;
  });
  if (!saved) redirect("/");
  redirect(preapproval.initPoint);
}

/** Pacote de créditos de imagem (Pix). Preço e quantidade vêm do banco; os créditos entram quando o Pix é confirmado. */
export async function startCreditsPix(f: FormData) {
  const packId = String(f.get("pack") || "");
  const ctx = await withProfile(async (c, userId) => {
    const pack = (await c.query("SELECT * FROM list_credit_packs() WHERE id=$1", [packId])).rows[0];
    if (!pack) return { ok: false as const, message: "Esse pacote não está disponível." };
    const email = (await c.query("SELECT email FROM app_users WHERE id=$1", [userId])).rows[0]?.email as string;
    return { ok: true as const, userId, email, pack: pack as { id: string; label: string; price_cents: number; credits: number } };
  });
  if (!ctx) redirect("/");
  if (!ctx.ok) bounce(BACK, ctx.message);
  let charge;
  try {
    charge = await createPixPayment({
      amountCents: ctx.pack.price_cents,
      description: `Closet Inteligente - ${ctx.pack.credits} créditos de imagem`,
      payerEmail: ctx.email,
      externalReference: `extra:${ctx.userId}`,
      idempotencyKey: randomUUID(),
    });
  } catch (e) {
    console.error("startCreditsPix falhou:", e);
    bounce(BACK, "Não foi possível gerar a cobrança Pix agora. Tente de novo em instantes.");
  }
  const saved = await withProfile(async (c, userId) => {
    await c.query("SELECT extra_create_credit_charge($1,$2,$3,$4,$5,$6,$7)",
      [userId, ctx.pack.id, ctx.pack.price_cents, charge.id, charge.qrCode, charge.qrCodeBase64, charge.expiresAt]);
    return true;
  });
  if (!saved) redirect("/");
  await flash("Pix gerado. Escaneie o QR code ou copie o código para pagar.");
  redirect(`${BACK}?produto=creditos#creditos`);
}
