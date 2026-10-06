import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { getAuthorizedPayment, getPayment, getPreapproval, updatePreapprovalAmount, verifyWebhookSignature } from "@/server/mercadopago";

/** Webhook do Mercado Pago -- chamado direto pelo Mercado Pago, sem sessão de usuária.
 * NUNCA confia no corpo da notificação pra decidir status: sempre busca o recurso de novo
 * na API do Mercado Pago (padrão recomendado por eles, e evita que alguém forje um corpo
 * "aprovado" direto pra esse endpoint). A assinatura HMAC (x-signature) ainda é checada
 * antes disso, pra nem gastar a chamada de busca com notificação forjada. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* alguns eventos chegam só na query string */ }

  const dataId = String(body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
  const type = String(body?.type || url.searchParams.get("type") || "");
  if (!dataId || !type) return NextResponse.json({ ok: true }); // nada reconhecível; responde 200 pra MP não reenviar à toa

  const valid = verifyWebhookSignature({
    xSignature: req.headers.get("x-signature"),
    xRequestId: req.headers.get("x-request-id"),
    dataId,
  });
  if (!valid) {
    console.error("mercadopago webhook: assinatura inválida, ignorando. type=", type, "dataId=", dataId);
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    if (type === "payment") {
      const payment = await getPayment(dataId);
      const args = [String(payment.id), String(payment.status), JSON.stringify(payment)];
      const applied = await client.query("SELECT * FROM apply_pix_result($1,$2,$3::jsonb)", args);
      // Não é cobrança de usuária -> pode ser a mensalidade de uma loja parceira.
      if (!applied.rowCount) await client.query("SELECT * FROM apply_partner_pix_result($1,$2,$3::jsonb)", args);
    } else if (type === "preapproval" || type === "subscription_preapproval") {
      const preapproval = await getPreapproval(dataId);
      const ref = String(preapproval.external_reference || "");
      await client.query(ref.startsWith("partner:") ? "SELECT apply_partner_preapproval_result($1,$2,$3,$4::jsonb)" : "SELECT apply_preapproval_result($1,$2,$3,$4::jsonb)",
        [String(preapproval.id), String(preapproval.status), ref, JSON.stringify(preapproval)]);
    } else if (type === "subscription_authorized_payment") {
      // Cobrança de um ciclo da assinatura de cartão. Rebusca na API (nunca confia no corpo).
      const ap = await getAuthorizedPayment(dataId);
      const preapprovalId = String(ap?.preapproval_id || "");
      const cycleStatus = String(ap?.payment?.status || ap?.status || "");
      const status = cycleStatus === "approved" || cycleStatus === "processed" ? "approved" : cycleStatus === "rejected" ? "rejected" : "";
      if (preapprovalId && status) {
        const r = await client.query("SELECT * FROM apply_authorized_payment_result($1,$2,$3::jsonb)", [preapprovalId, status, JSON.stringify(ap)]);
        if (!r.rowCount) await client.query("SELECT * FROM apply_partner_authorized_payment_result($1,$2,$3::jsonb)", [preapprovalId, status, JSON.stringify(ap)]);
        const row = r.rows[0];
        if (row?.promo_ended && row.base_price_cents) {
          // Fim do desconto: volta o cartão ao preço cheio do plano. Se falhar, avisa a administradora
          // (senão a usuária seguiria pagando o valor promocional indefinidamente).
          try { await updatePreapprovalAmount(preapprovalId, row.base_price_cents); }
          catch (err) {
            console.error("mercadopago: falha ao reajustar assinatura ao preço cheio:", preapprovalId, err);
            await client.query("SELECT report_billing_issue($1,$2,$3)", [row.user_id, "Reajustar cartão ao preço cheio",
              `O desconto dos primeiros meses acabou, mas o reajuste automático no Mercado Pago falhou (assinatura ${preapprovalId}). Ajuste o valor manualmente no painel do Mercado Pago.`]);
          }
        }
      }
    }
  } catch (e) {
    // Recurso inexistente (ex.: notificação simulada do painel): 200 pra MP não reenviar em loop.
    if ((e as { status?: number })?.status === 404) {
      console.warn("mercadopago webhook: recurso não encontrado, ignorando:", type, dataId);
      return NextResponse.json({ ok: true, ignored: true });
    }
    console.error("mercadopago webhook falhou ao processar:", type, dataId, e);
    return NextResponse.json({ ok: false }, { status: 500 });
  } finally {
    client.release();
  }
  return NextResponse.json({ ok: true });
}
