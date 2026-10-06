import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** Cliente fino pra API REST do Mercado Pago -- sem SDK (evita adicionar dependência e
 * rebuild de lockfile só pra isso; a API é simples e bem documentada via fetch puro). */
const BASE = "https://api.mercadopago.com";

function accessToken(): string {
  const t = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!t) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado no servidor.");
  return t;
}

async function mpFetch(path: string, init: RequestInit & { idempotencyKey?: string } = {}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken()}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.idempotencyKey) headers["X-Idempotency-Key"] = init.idempotencyKey;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.message || body?.error || `Mercado Pago retornou ${res.status}`;
    throw Object.assign(new Error(`Mercado Pago (${path}): ${msg}`), { status: res.status });
  }
  return body;
}

export type PixChargeResult = {
  id: string;
  status: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
  expiresAt: string | null;
  raw: any;
};

/** Cria uma cobrança Pix avulsa (não é recorrente de verdade -- Pix não tem recorrência
 * nativa amplamente disponível ainda; renovamos gerando uma nova cobrança a cada ciclo). */
export async function createPixPayment(opts: {
  amountCents: number; description: string; payerEmail: string; externalReference: string; idempotencyKey: string;
}): Promise<PixChargeResult> {
  const body = await mpFetch("/v1/payments", {
    method: "POST",
    idempotencyKey: opts.idempotencyKey,
    body: JSON.stringify({
      transaction_amount: Math.round(opts.amountCents) / 100,
      description: opts.description,
      payment_method_id: "pix",
      payer: { email: opts.payerEmail },
      external_reference: opts.externalReference,
      notification_url: `${process.env.APP_URL || ""}/api/mercadopago/webhook`,
    }),
  });
  const tx = body?.point_of_interaction?.transaction_data || {};
  return {
    id: String(body.id),
    status: String(body.status || "pending"),
    qrCode: tx.qr_code || null,
    qrCodeBase64: tx.qr_code_base64 || null,
    expiresAt: body.date_of_expiration || null,
    raw: body,
  };
}

export async function getPayment(id: string): Promise<any> {
  return mpFetch(`/v1/payments/${encodeURIComponent(id)}`, { method: "GET" });
}

export type PreapprovalResult = { id: string; status: string; initPoint: string; raw: any };

/** Cria uma assinatura recorrente de cartão. A cliente é redirecionada pro `initPoint`
 * (página hospedada pelo Mercado Pago) pra digitar o cartão -- nunca passa pelo nosso
 * servidor nem pelo navegador dela em nosso domínio. */
export async function createPreapproval(opts: {
  amountCents: number; reason: string; payerEmail: string; externalReference: string; backUrl: string;
}): Promise<PreapprovalResult> {
  const body = await mpFetch("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: opts.reason,
      external_reference: opts.externalReference,
      payer_email: opts.payerEmail,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: Math.round(opts.amountCents) / 100,
        currency_id: "BRL",
      },
      back_url: opts.backUrl,
      status: "pending",
    }),
  });
  return { id: String(body.id), status: String(body.status || "pending"), initPoint: String(body.init_point || ""), raw: body };
}

export async function getPreapproval(id: string): Promise<any> {
  return mpFetch(`/preapproval/${encodeURIComponent(id)}`, { method: "GET" });
}

/** Valida a assinatura HMAC do webhook (formato documentado pelo Mercado Pago: manifest
 * "id:{data.id};request-id:{x-request-id};ts:{ts};" assinado com o secret configurado no
 * painel do app). Sem isso, qualquer um poderia forjar uma notificação de pagamento
 * aprovado -- nunca aplicar o resultado de um webhook sem essa checagem. */
export function verifyWebhookSignature(opts: { xSignature: string | null; xRequestId: string | null; dataId: string }): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) { console.error("MERCADOPAGO_WEBHOOK_SECRET não configurado -- rejeitando webhook."); return false; }
  if (!opts.xSignature || !opts.xRequestId) return false;
  const parts = Object.fromEntries(opts.xSignature.split(",").map((p) => p.trim().split("=").map((s) => s.trim())));
  const ts = parts.ts, v1 = parts.v1;
  if (!ts || !v1) return false;
  const manifest = `id:${opts.dataId};request-id:${opts.xRequestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(v1, "hex"));
  } catch {
    return false;
  }
}

/** Cobrança individual de um ciclo de assinatura (`subscription_authorized_payment`).
 * Traz `preapproval_id` e o pagamento do ciclo (`payment.status`: approved/rejected...). */
export async function getAuthorizedPayment(id: string): Promise<any> {
  return mpFetch(`/authorized_payments/${encodeURIComponent(id)}`, { method: "GET" });
}

/** Reajusta o valor das próximas cobranças de uma assinatura (usado ao fim do desconto de
 * cartão dos primeiros meses, voltando ao preço cheio do plano). */
export async function updatePreapprovalAmount(id: string, amountCents: number): Promise<void> {
  await mpFetch(`/preapproval/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ auto_recurring: { transaction_amount: Math.round(amountCents) / 100, currency_id: "BRL" } }),
  });
}
