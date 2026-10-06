import Link from "next/link";
import { adminListAccounts, adminUserOverview, adminListAudit, setSubscription, resetPassword, recordPayment, grantModule, grantCredits } from "@/server/admin-actions";
import SubmitButton from "@/components/submit-button";
import { STATUS_LABEL, PLAN_LABEL, brl, brlInput } from "../../labels";

const AUDIT_LABEL: Record<string, string> = {
  SET_SUBSCRIPTION: "Alteração de plano/status", RESET_PASSWORD: "Senha resetada", PAYMENT_RECEIVED: "Pagamento registrado (manual)",
  PIX_PAYMENT_APPROVED: "Pix aprovado", CARD_SUBSCRIPTION_AUTHORIZED: "Assinatura no cartão ativada", CARD_CYCLE_CHARGED: "Cobrança mensal do cartão paga",
  CARD_CYCLE_REJECTED: "Cobrança do cartão recusada", CARD_SUBSCRIPTION_CANCELLED: "Assinatura no cartão cancelada", CARD_SUBSCRIPTION_PAUSED: "Assinatura no cartão pausada",
  AUTO_SUSPENDED: "Suspensa automaticamente por atraso", GRANT_CREDITS: "Créditos concedidos", GRANT_MODULE: "Módulo liberado",
};
const CHARGE_KIND: Record<string, string> = { PIX: "Pix", CARD_PREAPPROVAL: "Cartão recorrente" };
const CHARGE_STATUS: Record<string, string> = { pending: "pendente", approved: "pago", cancelled: "cancelado", rejected: "recusado", expired: "expirado", authorized: "autorizado", paused: "pausado" };

export default async function UsuariaDetalhe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ temp?: string; error?: string }> }) {
  const { id } = await params;
  const { temp, error } = await searchParams;
  const { actorId, accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  const a = accounts.find((x: any) => x.user_id === id);
  if (!a) return <main className="shell narrow"><h1>Usuária não encontrada</h1><Link href="/admin/usuarias">← Usuárias</Link></main>;

  const [overview, audit] = await Promise.all([adminUserOverview(id), adminListAudit(id)]);
  const self = a.user_id === actorId;
  const back = `/admin/usuarias/${a.user_id}`;
  const needsAttention = ["PAST_DUE", "SUSPENDED", "TRIAL_EXPIRED"].includes(a.sub_status);
  const dueDays = a.current_period_end ? Math.ceil((new Date(a.current_period_end).getTime() - Date.now()) / 86400000) : null;
  const hasColorimetria = (overview?.modules || []).some((m: any) => m.module === "COLORIMETRIA");

  return <main className="shell narrow">
    <Link href="/admin/usuarias">← Usuárias</Link>
    <h1>{a.display_name || "(sem nome)"} {a.is_admin && <small>· administradora</small>}</h1>
    <p className="look-meta">{a.email} · cadastrada em {new Date(a.created_at).toLocaleDateString("pt-BR")}{overview?.city ? ` · ${overview.city}` : ""}</p>
    <p><span className={`chip chip-${a.sub_status}`}>{STATUS_LABEL[a.sub_status] || a.sub_status}</span> {a.sub_status === "TRIAL" ? "Teste gratuito" : `Plano ${PLAN_LABEL[a.plan] || a.plan}`}</p>
    {error && <p role="alert" className="trial-banner">{error}</p>}
    {temp && <p role="alert" className="trial-banner">Senha temporária: <strong>{temp}</strong> (copie agora; não será mostrada de novo)</p>}

    {needsAttention && !self && <section className="card alert-card" role="alert">
      <h2>{a.sub_status === "SUSPENDED" ? "Conta suspensa por atraso" : a.sub_status === "PAST_DUE" ? "Pagamento em atraso" : "Teste gratuito encerrado"}</h2>
      <p className="look-meta">
        {a.sub_status === "SUSPENDED" ? "Ela só enxerga a tela de assinatura até pagar. Pagando (Pix ou cartão), o acesso volta sozinho."
          : a.sub_status === "PAST_DUE" ? "A suspensão automática acontece 5 dias após o vencimento."
          : "Ela precisa escolher um plano para voltar a usar o app."}
      </p>
      <form action={setSubscription}>
        <input type="hidden" name="user_id" value={a.user_id} /><input type="hidden" name="return_to" value={back} />
        <input type="hidden" name="status" value="ACTIVE" /><input type="hidden" name="plan" value={a.plan} />
        <input type="hidden" name="fee" value={brlInput(a.monthly_fee_cents)} /><input type="hidden" name="discount" value={brlInput(a.discount_cents)} />
        <input type="hidden" name="notes" value={`${a.notes ? a.notes + " · " : ""}liberada manualmente`} />
        <SubmitButton pendingText="Liberando...">Liberar acesso agora (cortesia)</SubmitButton>
      </form>
    </section>}

    <section className="card">
      <h2>Assinatura</h2>
      <p className="look-meta">
        {a.provider === "MERCADOPAGO"
          ? `Mercado Pago · ${a.payment_method === "CARD" ? "cartão recorrente" : "Pix"}${dueDays !== null ? ` · ${dueDays >= 0 ? `renova em ${dueDays} dia${dueDays === 1 ? "" : "s"} (${new Date(a.current_period_end).toLocaleDateString("pt-BR")})` : `vencido há ${-dueDays} dia${dueDays === -1 ? "" : "s"}`}` : ""}`
          : "Gerenciada manualmente (sem cobrança automática)"}
      </p>
      {a.sub_status === "TRIAL" && a.trial_ends_at && <p className="look-meta">Teste termina em {new Date(a.trial_ends_at).toLocaleDateString("pt-BR")}.</p>}
      {overview?.promo_cycles_left > 0 && <p className="look-meta">🏷️ Desconto do cartão: faltam {overview.promo_cycles_left} mês(es) com preço promocional.</p>}
      <p className="look-meta">Mensalidade atual: {brl(a.monthly_fee_cents)}{a.discount_cents > 0 ? ` − desconto ${brl(a.discount_cents)}` : ""}</p>
      <form action={setSubscription} className="form">
        <input type="hidden" name="user_id" value={a.user_id} /><input type="hidden" name="return_to" value={back} />
        <label>Status
          <select name="status" defaultValue={a.sub_status === "TRIAL_EXPIRED" ? "TRIAL" : a.sub_status} disabled={self}>
            <option value="TRIAL">Em teste gratuito</option>
            <option value="ACTIVE">Ativa (assinante)</option>
            <option value="PAST_DUE">Em atraso</option>
            <option value="SUSPENDED">Suspensa</option>
            <option value="BLOCKED">Bloqueada</option>
            <option value="CANCELED">Cancelada</option>
          </select>
        </label>
        <label>Plano
          <select name="plan" defaultValue={a.plan} disabled={self}>
            <option value="ARRUMADA">Arrumada</option>
            <option value="FASHION">Fashion (+ Closet Cápsula)</option>
            <option value="SUPER_STAR">Super Star (+ Colorimetria)</option>
          </select>
        </label>
        <label>Mensalidade (R$)<input name="fee" defaultValue={brlInput(a.monthly_fee_cents)} disabled={self} /></label>
        <label>Desconto individual (R$)<input name="discount" defaultValue={brlInput(a.discount_cents)} disabled={self} /></label>
        <label>Observações<input name="notes" defaultValue={a.notes} disabled={self} /></label>
        <SubmitButton disabled={self} pendingText="Salvando...">Salvar assinatura</SubmitButton>
        {self && <p className="look-meta">Sua própria conta de administradora não pode ser alterada aqui.</p>}
      </form>
    </section>

    <section className="card">
      <h2>Cobranças</h2>
      {(overview?.charges || []).length === 0 ? <p className="look-meta">Nenhuma cobrança pelo app ainda.</p> : <ul>
        {overview.charges.map((c: any, i: number) => (
          <li key={i}>{CHARGE_KIND[c.kind] || c.kind} · {PLAN_LABEL[c.plan] || c.plan} · {brl(c.amount_cents)} · <strong>{CHARGE_STATUS[c.status] || c.status}</strong> <small>({new Date(c.created_at).toLocaleString("pt-BR")})</small></li>
        ))}
      </ul>}
      {!self && <form action={recordPayment} className="form">
        <input type="hidden" name="user_id" value={a.user_id} />
        <h3>Registrar pagamento recebido por fora</h3>
        <label>Valor (R$)<input name="amount" placeholder="Ex.: 49,90" required /></label>
        <label>Data<input name="paid_at" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
        <label>Observações<input name="payment_notes" placeholder="Ex.: transferência..." /></label>
        <SubmitButton pendingText="Registrando...">Registrar pagamento</SubmitButton>
      </form>}
    </section>

    <section className="card">
      <h2>Benefícios</h2>
      <p className="look-meta">🎁 {overview?.bonus_credits ?? 0} crédito(s) bônus de imagem · {overview?.referrals ?? 0} indicação(ões){overview?.referral_code ? ` · código ${overview.referral_code}` : ""}</p>
      <p className="look-meta">Colorimetria: {hasColorimetria ? (overview.modules.find((m: any) => m.module === "COLORIMETRIA").status) : "não liberada"}</p>
      {!self && <>
        <form action={grantCredits} className="form">
          <input type="hidden" name="user_id" value={a.user_id} /><input type="hidden" name="return_to" value={back} />
          <label>Conceder créditos de imagem<input name="credits" type="number" min={1} max={500} placeholder="Ex.: 10" required /></label>
          <label>Motivo (opcional)<input name="note" placeholder="Ex.: cortesia de boas-vindas" /></label>
          <SubmitButton pendingText="Concedendo...">Conceder créditos</SubmitButton>
        </form>
        <form action={grantModule}>
          <input type="hidden" name="user_id" value={a.user_id} /><input type="hidden" name="module" value="COLORIMETRIA" />
          <input type="hidden" name="origin" value="CORTESIA_ADMIN" /><input type="hidden" name="return_to" value={back} />
          <SubmitButton pendingText="Liberando...">{hasColorimetria ? "Reabrir Colorimetria" : "Liberar Colorimetria"}</SubmitButton>
        </form>
      </>}
    </section>

    <section className="card">
      <h2>Uso do app</h2>
      <p className="look-meta">{a.last_login_at ? `Último acesso em ${new Date(a.last_login_at).toLocaleString("pt-BR")}` : "Nunca fez login"} · {a.closet_count} peça(s) no closet · {a.looks_count} look(s)</p>
      {!self && <form action={resetPassword}><input type="hidden" name="user_id" value={a.user_id} /><SubmitButton pendingText="Resetando...">Resetar senha</SubmitButton></form>}
    </section>

    <section className="card">
      <h2>Histórico</h2>
      {audit.length === 0 ? <p className="look-meta">Nenhum registro ainda.</p> : <ul>
        {audit.map((h: any, i: number) => (
          <li key={i}>
            <strong>{AUDIT_LABEL[h.action] || h.action}</strong> — {new Date(h.created_at).toLocaleString("pt-BR")}
            {h.action === "PAYMENT_RECEIVED" && <> · {brl(h.details.amount_cents)}{h.details.notes && ` · ${h.details.notes}`}</>}
            {h.action === "PIX_PAYMENT_APPROVED" && <> · {brl(h.details.amount_cents)} · {PLAN_LABEL[h.details.plan] || h.details.plan}</>}
            {h.action === "SET_SUBSCRIPTION" && <> · status {h.details.status}, plano {PLAN_LABEL[h.details.plan] || h.details.plan}, mensalidade {brl(h.details.fee_cents)}</>}
            {h.action === "GRANT_CREDITS" && <> · {h.details.credits} crédito(s){h.details.note && ` · ${h.details.note}`}</>}
          </li>
        ))}
      </ul>}
    </section>
  </main>;
}
