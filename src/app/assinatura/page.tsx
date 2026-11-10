import { SUPPORT_URL, SUPPORT_PHONE } from "@/components/support";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { mySubscription, PLAN_LABEL, type Plan } from "@/server/limits";
import { startPixCheckout, startCardCheckout, startOfferPix, cancelSubscription } from "@/server/billing-actions";
import ConfirmButton from "@/components/confirm-button";
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
    const plans = await Promise.all(PLANS.map(async (p) => ({ ...(await c.query("SELECT plan, base_price_cents, promo_price_cents, promo_months FROM get_plan_pricing($1)", [p])).rows[0], ...(await c.query("SELECT ai_ops_monthly_limit, image_gen_monthly_limit FROM get_plan_config($1)", [p])).rows[0], std: (await c.query("SELECT get_standard_limit($1) l", [p])).rows[0]?.l })));
    const usedCardPromo = (await c.query("SELECT 1 FROM payment_charges WHERE kind='CARD_PREAPPROVAL' AND status='approved' LIMIT 1")).rowCount! > 0;
    const offer = (await c.query("SELECT * FROM my_offer($1)", [userId])).rows[0] || null;
    return { sub, plans, pending, usedCardPromo, offer };
  }, { allowSuspended: true });
  if (!data) redirect("/");
  const { sub, plans, pending, usedCardPromo, offer } = data;

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

    {sub.status === "SUSPENDED" && sub.cancel_at_period_end && <div className="card alert-card" role="alert">
      <h2>Sua assinatura foi cancelada</h2>
      <p>O período que você pagou terminou, então o acesso ao app foi pausado. Seus looks e peças continuam guardados: para voltar, é só escolher um plano abaixo.</p>
    </div>}
    {sub.status === "SUSPENDED" && !sub.cancel_at_period_end && <div className="card alert-card" role="alert">
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
      {sub.status === "TRIAL" && sub.trial_ends_at && <p className="look-meta">Teste gratuito até {new Date(sub.trial_ends_at).toLocaleDateString("pt-BR")}. Ele inclui os recursos do plano Arrumada ({plans[0].ai_ops_monthly_limit ?? "ilimitados"} pedidos de IA, {plans[0].image_gen_monthly_limit ?? "ilimitados"} looks em imagem e {plans[0].std ?? "ilimitadas"} fotos de catálogo) e o Cuide-se.</p>}
      {sub.provider === "MERCADOPAGO" && sub.current_period_end && sub.status !== "SUSPENDED" && <p className="look-meta">
        {sub.cancel_at_period_end ? "Assinatura cancelada · acesso até " : sub.payment_method === "CARD" ? "Cartão recorrente · próxima cobrança automática por volta de " : "Pix · pago até "}{new Date(sub.current_period_end).toLocaleDateString("pt-BR")}.
      </p>}
      {sub.cancel_at_period_end && sub.status !== "SUSPENDED" && <p className="look-meta">Não haverá novas cobranças. Para continuar depois dessa data, escolha um plano abaixo.</p>}
      {sub.payment_method === "CARD" && !sub.cancel_at_period_end && (sub.status === "ACTIVE" || sub.status === "PAST_DUE") && <form action={cancelSubscription} className="cancel-sub">
        <ConfirmButton className="link danger-link" pendingText="Cancelando..." message={`Cancelar a assinatura no cartão? Você continua com acesso até ${new Date(sub.current_period_end as Date).toLocaleDateString("pt-BR")} e não haverá novas cobranças.`}>Cancelar assinatura</ConfirmButton>
      </form>}
    </div>

    {showPixQr && pending && <div className="card alert-card" style={{ borderColor: "#a9714c", background: "#fdf6ee" }}>
      <h2>Pagamento Pix pendente{pending.amount_cents ? ` — ${formatPrice(pending.amount_cents)}` : ""}</h2>
      <p>Escaneie o QR code ou copie o código Pix abaixo no app do seu banco.{pending.pix_expires_at && ` Expira em ${new Date(pending.pix_expires_at).toLocaleString("pt-BR")}.`}</p>
      {pending.pix_qr_code_base64 && <img src={`data:image/png;base64,${pending.pix_qr_code_base64}`} alt="QR code Pix" style={{ maxWidth: 240, display: "block", margin: "12px 0" }} />}
      {pending.pix_qr_code && <textarea readOnly defaultValue={pending.pix_qr_code} rows={3} style={{ width: "100%", fontSize: 12 }} />}
      <p className="look-meta">Depois de pagar, a confirmação é automática -- pode levar até um minuto para refletir aqui. Para trocar de plano ou gerar um novo código, use os botões abaixo.</p>
      <a href="/assinatura"><button className="link">Já paguei — atualizar esta página</button></a>
    </div>}

    {offer && !showPixQr && <div className="card offer-card">
      <span className="offer-tag">Oferta de teste</span>
      <h2>{offer.label || "Teste de pagamento"}: {formatPrice(offer.price_cents)} por {offer.days} dias</h2>
      <p>Pague {formatPrice(offer.price_cents)} no Pix e use o plano {PLAN_LABEL[offer.plan as Plan]} por {offer.days} dias. É um pagamento de verdade, para você testar como funciona. Depois, é só escolher o plano abaixo.</p>
      <form action={startOfferPix}><SubmitButton pendingText="Gerando Pix...">Pagar {formatPrice(offer.price_cents)} no Pix</SubmitButton></form>
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
            ? <p className="look-meta">No <strong>cartão recorrente</strong>: <strong>{formatPrice(p.promo_price_cents)}/mês nos primeiros {p.promo_months} meses</strong>, depois {formatPrice(p.base_price_cents)}/mês.</p>
            : <p className="look-meta">No cartão recorrente: {formatPrice(p.base_price_cents)}/mês, cobrado automaticamente.</p>}
          <ul className="look-meta plan-limits">
            <li>{p.ai_ops_monthly_limit ?? "Ilimitados"} pedidos de IA por mês (looks, mala, análises); cada pedido de look traz 2 a 3 opções</li>
            <li>{p.image_gen_monthly_limit ?? "Ilimitados"} looks em imagem por mês</li>
            <li>{p.std ?? "Ilimitadas"} fotos de catálogo das peças por mês</li>
            <li>{p.plan === "ARRUMADA" ? "Cuide-se como extra (veja em Extras)" : "Cuide-se incluído (Skincare e Cronograma Capilar) e Closet Cápsula"}</li>
          </ul>
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
      <p className="look-meta"><strong>Cuide-se</strong> (Skincare e Cronograma Capilar): incluído nos planos Fashion e Super Star e no teste gratuito; no Arrumada é um extra mensal. <strong>Colorimetria</strong>: compra única, à parte dos planos. Precisa de mais imagens? Compre <strong>créditos de imagem</strong> a partir de R$ 5,00 em Extras. <a href="/assinatura/extras">Ver extras</a></p>
      <p className="look-meta">Pix: cobrança de 30 dias, renovada aqui mesmo a cada mês — a conta é suspensa se passar de {GRACE_DAYS} dias de atraso. Cartão: cobrança automática recorrente, sem precisar voltar aqui; cancele quando quiser.</p>
    </div>
    <p className="look-meta">Dúvidas sobre pagamento ou acesso? Fale com a gente no WhatsApp: <a href={SUPPORT_URL} target="_blank" rel="noreferrer">{SUPPORT_PHONE}</a>.</p>
    {locked && <form action={logout}><button className="link">Sair da conta</button></form>}
  </main>;
}
