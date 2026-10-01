import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { getPayment, getPreapproval, verifyWebhookSignature } from "@/server/mercadopago";

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
      await client.query("SELECT apply_pix_result($1,$2,$3::jsonb)", [String(payment.id), String(payment.status), JSON.stringify(payment)]);
    } else if (type === "preapproval" || type === "subscription_preapproval") {
      const preapproval = await getPreapproval(dataId);
      await client.query("SELECT apply_preapproval_result($1,$2,$3,$4::jsonb)", [String(preapproval.id), String(preapproval.status), String(preapproval.external_reference || ""), JSON.stringify(preapproval)]);
    } else if (type === "subscription_authorized_payment") {
      // Recurso de cobrança individual de uma assinatura -- não tem endpoint GET próprio
      // documentado publicamente; usamos o que a notificação já traz, mas só depois de
      // validar a assinatura HMAC acima (já garantida nesse ponto).
      const preapprovalId = String(body?.data?.preapproval_id || "");
      const status = String(body?.data?.status || body?.status || "");
      if (preapprovalId && status) {
        await client.query("SELECT apply_authorized_payment_result($1,$2,$3::jsonb)", [preapprovalId, status, JSON.stringify(body)]);
      }
    }
  } catch (e) {
    console.error("mercadopago webhook falhou ao processar:", type, dataId, e);
    return NextResponse.json({ ok: false }, { status: 500 });
  } finally {
    client.release();
  }
  return NextResponse.json({ ok: true });
}
