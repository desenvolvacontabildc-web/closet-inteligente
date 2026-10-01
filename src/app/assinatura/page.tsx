import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { mySubscription, PLAN_LABEL, type Plan } from "@/server/limits";
import { startPixCheckout, startCardCheckout } from "@/server/billing-actions";
import SubmitButton from "@/components/submit-button";

const PLANS: Plan[] = ["ARRUMADA", "FASHION", "SUPER_STAR"];

function formatPrice(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export default async function Assinatura({ searchParams }: { searchParams: Promise<{ error?: string; charge?: string }> }) {
  const { error, charge } = await searchParams;
  const data = await withProfile(async (c, userId) => {
    const sub = await mySubscription(c, userId);
    const plans = await Promise.all(PLANS.map(async (p) => (await c.query("SELECT plan, base_price_cents FROM get_plan_config($1)", [p])).rows[0]));
    const pending = (await c.query("SELECT * FROM my_pending_charge($1)", [userId])).rows[0] || null;
    return { sub, plans, pending };
  });
  if (!data) redirect("/");
  const { sub, plans, pending } = data;

  const showPixQr = charge === "pix" && pending?.kind === "PIX" && pending.status === "pending";
  const showCardPending = charge === "card";

  return <main className="shell narrow">
    <a href="/perfil">← Perfil</a>
    <h1>Sua assinatura</h1>
    {error && <p role="alert" className="trial-banner">{error}</p>}
    <div className="card">
      <p><strong>Status atual:</strong> {sub.status === "TRIAL" ? "Teste gratuito" : `Plano ${PLAN_LABEL[sub.plan]}`} · {sub.status}</p>
    </div>

    {showPixQr && pending && <div className="card alert-card" style={{ borderColor: "#a9714c", background: "#fdf6ee" }}>
      <h2>Pagamento Pix pendente</h2>
      <p>Escaneie o QR code ou copie o código Pix abaixo no app do seu banco.{pending.pix_expires_at && ` Expira em ${new Date(pending.pix_expires_at).toLocaleString("pt-BR")}.`}</p>
      {pending.pix_qr_code_base64 && <img src={`data:image/png;base64,${pending.pix_qr_code_base64}`} alt="QR code Pix" style={{ maxWidth: 240, display: "block", margin: "12px 0" }} />}
      {pending.pix_qr_code && <textarea readOnly defaultValue={pending.pix_qr_code} rows={3} style={{ width: "100%", fontSize: 12 }} />}
      <p className="look-meta">Depois de pagar, a confirmação é automática -- pode levar até um minuto para refletir aqui.</p>
      <a href="/assinatura"><button className="link">Atualizar esta página</button></a>
    </div>}

    {showCardPending && <div className="card alert-card" style={{ borderColor: "#a9714c", background: "#fdf6ee" }}>
      <h2>Confirmando sua assinatura...</h2>
      <p>Estamos aguardando a confirmação do Mercado Pago. Pode levar alguns segundos -- atualize esta página pra ver o status mais recente.</p>
      <a href="/assinatura"><button className="link">Atualizar esta página</button></a>
    </div>}

    <div className="card">
      <h2>Escolha seu plano e forma de pagamento</h2>
      {plans.map((p: any) => (
        <div key={p.plan} className="strategy-card">
          <strong>{PLAN_LABEL[p.plan as Plan]}</strong> — {formatPrice(p.base_price_cents)}/mês
          <div className="action-row">
            <form action={startPixCheckout}>
              <input type="hidden" name="plan" value={p.plan} />
              <SubmitButton pendingText="Gerando Pix...">Pagar com Pix</SubmitButton>
            </form>
            <form action={startCardCheckout}>
              <input type="hidden" name="plan" value={p.plan} />
              <SubmitButton pendingText="Abrindo pagamento...">Assinar com cartão</SubmitButton>
            </form>
          </div>
        </div>
      ))}
      <p className="look-meta">Pix: cobrança única, renovada aqui mesmo a cada mês. Cartão: cobrança automática recorrente, sem precisar voltar aqui.</p>
    </div>
  </main>;
}
