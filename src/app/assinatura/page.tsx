import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { mySubscription, PLAN_LABEL, type Plan } from "@/server/limits";
import { startPixCheckout, startCardCheckout } from "@/server/billing-actions";
import { logout } from "@/server/auth-actions";
import { reconcilePendingPix } from "@/server/billing-sync";
import SubmitButton from "@/components/submit-button";

const PLANS: Plan[] = ["ARRUMADA", "FASHION", "SUPER_STAR"];
const GRACE_DAYS = 5;

function formatPrice(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}
function daysUntil(d: Date | string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}
const STATUS_LABEL: Record<string, string> = {
  TRIAL: "Teste gratuito", ACTIVE: "Ativa", PAST_DUE: "Pagamento em atraso", SUSPENDED: "Conta suspensa",
  TRIAL_EXPIRED: "Teste encerrado", BLOCKED: "Bloqueada", CANCELED: "Cancelada",
};

export default async function Assinatura({ searchParams }: { searchParams: Promise<{ error?: string; charge?: string }> }) {
  const { error, charge } = await searchParams;
  const data = await withProfile(async (c, userId) => {
    let pending = (await c.query("SELECT * FROM my_pending_charge($1)", [userId])).rows[0] || null;
    if (await reconcilePendingPix(c, pending)) pending = (await c.query("SELECT * FROM my_pending_charge($1)", [userId])).rows[0] || null;
    const sub = await mySubscription(c, userId);
    const plans = await Promise.all(PLANS.map(async (p) => (await c.query("SELECT plan, base_price_cents, promo_price_cents, promo_months FROM get_plan_pricing($1)", [p])).rows[0]));
    const usedCardPromo = (await c.query("SELECT 1 FROM payment_charges WHERE kind='CARD_PREAPPROVAL' AND status='approved' LIMIT 1")).rowCount! > 0;
    return { sub, plans, pending, usedCardPromo };
  }, { allowSuspended: true });
  if (!data) redirect("/");
  const { sub, plans, pending, usedCardPromo } = data;

  const showPixQr = pending?.kind === "PIX" && pending.status === "pending" && (!pending.pix_expires_at || new Date(pending.pix_expires_at) > new Date());
  const showCardPending = charge === "card" && pending?.kind === "CARD_PREAPPROVAL" && pending.status === "pending";
  const locked = sub.status === "SUSPENDED" || sub.status === "TRIAL_EXPIRED";
  const dueDays = sub.payment_method === "PIX" ? daysUntil(sub.current_period_end) : null;
  const overdueFrom = sub.overdue_since || (sub.payment_method === "PIX" ? sub.current_period_end : null);
  const suspendInDays = overdueFrom ? GRACE_DAYS - Math.floor((Date.now() - new Date(overdueFrom).getTime()) / 86400000) : null;

  return <main className="shell narrow">
    {!locked && <a href="/perfil">← Perfil</a>}
    <h1>Sua assinatura</h1>
    {error && <p role="alert" className="trial-banner">{error}</p>}

    {sub.status === "SUSPENDED" && <div className="card alert-card" role="alert">
      <h2>Sua conta está suspensa</h2>
      <p>O pagamento passou de {GRACE_DAYS} dias de atraso, então o acesso ao app foi pausado. Seus looks e peças continuam guardados — é só regularizar abaixo (Pix ou cartão) que o acesso volta na hora.</p>
    </div>}
    {sub.status === "TRIAL_EXPIRED" && <div className="card alert-card" role="alert">
      <h2>Seu teste gratuito terminou</h2>
      <p>Escolha um plano abaixo para continuar usando o Closet. Tudo o que você cadastrou está guardado.</p>
    </div>}
    {sub.status === "PAST_DUE" && <div className="card alert-card" role="alert">
      <h2>Pagamento em atraso</h2>
      <p>{suspendInDays !== null && suspendInDays > 0 ? `Regularize em até ${suspendInDays} dia${suspendInDays === 1 ? "" : "s"} para não ter o acesso suspenso.` : "Regularize hoje para não ter o acesso suspenso."}</p>
    </div>}
    {sub.status === "ACTIVE" && sub.payment_method === "PIX" && dueDays !== null && dueDays <= 5 && dueDays >= 0 && <div className="card alert-card" role="status">
      <h2>Seu Pix vence {dueDays === 0 ? "hoje" : `em ${dueDays} dia${dueDays === 1 ? "" : "s"}`}</h2>
      <p>Pague de novo abaixo para renovar por mais 30 dias. Se preferir não se preocupar mais com o vencimento, troque para o cartão recorrente (cobrança automática).</p>
    </div>}

    <div className="card">
      <p><strong>Status atual:</strong> {STATUS_LABEL[sub.status] || sub.status}{sub.status === "TRIAL" || sub.status === "TRIAL_EXPIRED" ? "" : ` · Plano ${PLAN_LABEL[sub.plan]}`}</p>
      {sub.status === "TRIAL" && sub.trial_ends_at && <p className="look-meta">Teste gratuito até {new Date(sub.trial_ends_at).toLocaleDateString("pt-BR")}.</p>}
      {sub.provider === "MERCADOPAGO" && sub.current_period_end && sub.status !== "SUSPENDED" && <p className="look-meta">
        {sub.payment_method === "CARD" ? "Cartão recorrente · próxima cobrança automática por volta de " : "Pix · pago até "}{new Date(sub.current_period_end).toLocaleDateString("pt-BR")}.
      </p>}
    </div>

    {showPixQr && pending && <div className="card alert-card" style={{ borderColor: "#a9714c", background: "#fdf6ee" }}>
      <h2>Pagamento Pix pendente{pending.amount_cents ? ` — ${formatPrice(pending.amount_cents)}` : ""}</h2>
      <p>Escaneie o QR code ou copie o código Pix abaixo no app do seu banco.{pending.pix_expires_at && ` Expira em ${new Date(pending.pix_expires_at).toLocaleString("pt-BR")}.`}</p>
      {pending.pix_qr_code_base64 && <img src={`data:image/png;base64,${pending.pix_qr_code_base64}`} alt="QR code Pix" style={{ maxWidth: 240, display: "block", margin: "12px 0" }} />}
      {pending.pix_qr_code && <textarea readOnly defaultValue={pending.pix_qr_code} rows={3} style={{ width: "100%", fontSize: 12 }} />}
      <p className="look-meta">Depois de pagar, a confirmação é automática -- pode levar até um minuto para refletir aqui. Para trocar de plano ou gerar um novo código, use os botões abaixo.</p>
      <a href="/assinatura"><button className="link">Já paguei — atualizar esta página</button></a>
    </div>}

    {showCardPending && <div className="card alert-card" style={{ borderColor: "#a9714c", background: "#fdf6ee" }}>
      <h2>Confirmando sua assinatura...</h2>
      <p>Estamos aguardando a confirmação do Mercado Pago. Pode levar alguns segundos -- atualize esta página pra ver o status mais recente.</p>
      <a href="/assinatura?charge=card"><button className="link">Atualizar esta página</button></a>
    </div>}

    <div className="card">
      <h2>Escolha seu plano e forma de pagamento</h2>
      {plans.map((p: any) => {
        const hasPromo = p.promo_price_cents != null && p.promo_months > 0 && !usedCardPromo;
        return <div key={p.plan} className="strategy-card">
          <strong>{PLAN_LABEL[p.plan as Plan]}</strong> — {formatPrice(p.base_price_cents)}/mês no Pix
          {hasPromo
            ? <p className="look-meta">💳 No <strong>cartão recorrente</strong>: <strong>{formatPrice(p.promo_price_cents)}/mês nos primeiros {p.promo_months} meses</strong>, depois {formatPrice(p.base_price_cents)}/mês.</p>
            : <p className="look-meta">💳 No cartão recorrente: {formatPrice(p.base_price_cents)}/mês, cobrado automaticamente.</p>}
          <div className="action-row">
            <form action={startPixCheckout}>
              <input type="hidden" name="plan" value={p.plan} />
              <SubmitButton pendingText="Gerando Pix...">Pagar com Pix</SubmitButton>
            </form>
            <form action={startCardCheckout}>
              <input type="hidden" name="plan" value={p.plan} />
              <SubmitButton pendingText="Abrindo pagamento...">{hasPromo ? `Assinar no cartão (${formatPrice(p.promo_price_cents)})` : "Assinar com cartão"}</SubmitButton>
            </form>
          </div>
        </div>;
      })}
      <p className="look-meta">Pix: cobrança de 30 dias, renovada aqui mesmo a cada mês — a conta é suspensa se passar de {GRACE_DAYS} dias de atraso. Cartão: cobrança automática recorrente, sem precisar voltar aqui; cancele quando quiser.</p>
    </div>
    {locked && <form action={logout}><button className="link">Sair da conta</button></form>}
  </main>;
}
