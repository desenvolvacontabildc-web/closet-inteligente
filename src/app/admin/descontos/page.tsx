import Link from "next/link";
import { adminListPlans, adminListAccounts, setPromoConfig } from "@/server/admin-actions";
import SubmitButton from "@/components/submit-button";
import { PLAN_LABEL, brl, brlInput } from "../labels";

export default async function Descontos({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  const plans = await adminListPlans();
  const withIndividual = accounts.filter((a: any) => a.discount_cents > 0);

  return <main className="shell narrow">
    <h1>Descontos</h1>
    {error && <p role="alert" className="trial-banner">{error}</p>}

    <section className="card">
      <h2>Desconto do cartão recorrente</h2>
      <p className="look-meta">Quem assina no <strong>cartão recorrente</strong> paga o preço promocional nos primeiros meses e depois volta ao preço-base do plano (o app reajusta sozinho no Mercado Pago). Vale só para a primeira assinatura de cartão de cada conta. Deixe o preço vazio (ou 0 meses) para não oferecer desconto naquele plano.</p>
      {plans.map((p: any) => (
        <form key={p.plan} action={setPromoConfig} className="form">
          <input type="hidden" name="plan" value={p.plan} />
          <h3>{PLAN_LABEL[p.plan] || p.plan} <small>· preço-base {brl(p.base_price_cents)}</small></h3>
          <label>Preço promocional no cartão (R$/mês)<input name="promo_price" defaultValue={p.promo_price_cents == null ? "" : brlInput(p.promo_price_cents)} placeholder="Ex.: 19,90" /></label>
          <label>Quantos meses dura o desconto<input name="promo_months" type="number" min={0} max={24} defaultValue={p.promo_months} /></label>
          <SubmitButton pendingText="Salvando...">Salvar desconto do {PLAN_LABEL[p.plan] || p.plan}</SubmitButton>
        </form>
      ))}
    </section>

    <section className="card">
      <h2>Descontos individuais</h2>
      <p className="look-meta">Desconto em reais aplicado manualmente à mensalidade de uma usuária (campo "Desconto individual" na ficha dela).</p>
      {withIndividual.length === 0 ? <p>Nenhuma usuária com desconto individual.</p> : withIndividual.map((a: any) => (
        <Link key={a.user_id} href={`/admin/usuarias/${a.user_id}`} className="user-row">
          <span><strong>{a.display_name || a.email}</strong><small>{a.email}</small></span>
          <span>− {brl(a.discount_cents)}</span>
        </Link>
      ))}
    </section>
  </main>;
}
