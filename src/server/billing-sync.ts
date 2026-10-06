import { getPayment } from "./mercadopago";

/** Rede de segurança do webhook: se a cobrança Pix mais recente da usuária ainda está
 * "pending" aqui, confere o status real no Mercado Pago e aplica o resultado. Idempotente
 * (apply_pix_result não duplica nada) e nunca derruba a tela se o Mercado Pago falhar. */
export async function reconcilePendingPix(c: any, pending: { kind: string; status: string; provider_payment_id?: string | null } | null): Promise<boolean> {
  if (!pending || pending.kind !== "PIX" || pending.status !== "pending" || !pending.provider_payment_id) return false;
  try {
    const payment = await getPayment(pending.provider_payment_id);
    if (!payment?.status || payment.status === "pending") return false;
    await c.query("SELECT apply_pix_result($1,$2,$3::jsonb)", [String(payment.id), String(payment.status), JSON.stringify(payment)]);
    return true;
  } catch (e) {
    console.error("reconcilePendingPix falhou:", e);
    return false;
  }
}

/** Mesma rede de segurança do webhook, para o Pix da MENSALIDADE DA LOJA (cobrança pendente mais recente). */
export async function reconcilePartnerPix(c: any, pending: { kind: string; status: string; provider_payment_id?: string | null } | null): Promise<boolean> {
  if (!pending || pending.kind !== "PIX" || pending.status !== "pending" || !pending.provider_payment_id) return false;
  try {
    const payment = await getPayment(pending.provider_payment_id);
    if (!payment?.status || payment.status === "pending") return false;
    await c.query("SELECT apply_partner_pix_result($1,$2,$3::jsonb)", [String(payment.id), String(payment.status), JSON.stringify(payment)]);
    return true;
  } catch (e) {
    console.error("reconcilePartnerPix falhou:", e);
    return false;
  }
}
