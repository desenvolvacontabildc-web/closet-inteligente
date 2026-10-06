"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { withStore } from "./store-session";
import { bounce } from "./action-error";
import { flash } from "./flash";
import { createPixPayment, createPreapproval } from "./mercadopago";

const PANEL = "/minha-vitrine";
const PACKAGES = ["BASICA", "PLUS", "PREMIUM"];
const PACKAGE_NAME: Record<string, string> = { BASICA: "Vitrine Básica", PLUS: "Vitrine Plus", PREMIUM: "Vitrine Premium" };

/** Lê o pacote escolhido e o preço atual dele; só lojas já aprovadas podem pagar. */
async function checkoutContext(f: FormData) {
  const pkg = String(f.get("package") || "");
  if (!PACKAGES.includes(pkg)) bounce(PANEL, "Pacote inválido.");
  const ctx = await withStore(async (c, _userId, partnerId) => {
    const me = (await c.query("SELECT * FROM partner_me($1)", [partnerId])).rows[0];
    if (!me?.approved) return { ok: false as const, message: "Sua loja ainda precisa ser aprovada pela equipe antes de ativar um pacote." };
    const amountCents: number = (await c.query("SELECT partner_package_price($1) p", [pkg])).rows[0]?.p ?? 0;
    if (!amountCents) return { ok: false as const, message: "Esse pacote não está disponível para contratação agora." };
    return { ok: true as const, partnerId, email: me.email as string, amountCents };
  });
  if (!ctx) redirect("/");
  if (!ctx.ok) bounce(PANEL, ctx.message);
  return { pkg, ...ctx };
}

export async function startPartnerPix(f: FormData) {
  const ctx = await checkoutContext(f);
  let charge;
  try {
    charge = await createPixPayment({
      amountCents: ctx.amountCents,
      description: `Closet Inteligente - ${PACKAGE_NAME[ctx.pkg]} (loja parceira)`,
      payerEmail: ctx.email,
      externalReference: `partner:${ctx.partnerId}`,
      idempotencyKey: randomUUID(),
    });
  } catch (e) {
    console.error("startPartnerPix falhou:", e);
    bounce(PANEL, "Não foi possível gerar a cobrança Pix agora. Tente de novo em instantes.");
  }
  const saved = await withStore(async (c, _userId, partnerId) => {
    await c.query("SELECT partner_create_charge($1,'PIX',$2,$3,$4,$5,$6,$7)",
      [partnerId, ctx.pkg, ctx.amountCents, charge.id, charge.qrCode, charge.qrCodeBase64, charge.expiresAt]);
    return true;
  });
  if (!saved) redirect("/");
  await flash("Pix gerado. Escaneie o QR code ou copie o código para pagar.");
  redirect(PANEL);
}

export async function startPartnerCard(f: FormData) {
  const ctx = await checkoutContext(f);
  let preapproval;
  try {
    preapproval = await createPreapproval({
      amountCents: ctx.amountCents,
      reason: `Closet Inteligente - ${PACKAGE_NAME[ctx.pkg]} (loja parceira)`,
      payerEmail: ctx.email,
      externalReference: `partner:${ctx.partnerId}`,
      backUrl: `${process.env.APP_URL || ""}${PANEL}?pagamento=cartao`,
    });
  } catch (e) {
    console.error("startPartnerCard falhou:", e);
    bounce(PANEL, "Não foi possível iniciar a assinatura por cartão agora. Tente de novo em instantes.");
  }
  const saved = await withStore(async (c, _userId, partnerId) => {
    await c.query("SELECT partner_create_charge($1,'CARD_PREAPPROVAL',$2,$3,$4,NULL,NULL,NULL)", [partnerId, ctx.pkg, ctx.amountCents, preapproval.id]);
    return true;
  });
  if (!saved) redirect("/");
  redirect(preapproval.initPoint);
}
