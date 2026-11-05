import { adminListPlans, adminListAccounts, setPlanConfig, adminStandardLimits, setStandardLimit } from "@/server/admin-actions";
import SubmitButton from "@/components/submit-button";
import { PLAN_LABEL, brl, brlInput } from "../labels";

export default async function Precos({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  const plans = await adminListPlans();
  const stdLimits = new Map<string, number | null>((await adminStandardLimits()).map((r: any) => [r.plan, r.standard_photo_monthly_limit]));
  const subscribers = (plan: string) => accounts.filter((a: any) => a.sub_status === "ACTIVE" && a.plan === plan && !a.is_admin).length;

  return <main className="shell narrow">
    <h1>Preços e planos</h1>
    <p className="look-meta">O preço-base é o valor cobrado no Pix e, depois do período de desconto, no cartão recorrente. Alterar aqui vale para as <strong>próximas</strong> cobranças; assinaturas já ativas mantêm o valor atual até renovarem.</p>
    {error && <p role="alert" className="trial-banner">{error}</p>}
    {plans.map((p: any) => (
      <section key={p.plan} className="card">
        <h2>{PLAN_LABEL[p.plan] || p.plan} <small>· {brl(p.base_price_cents)}/mês · {subscribers(p.plan)} assinante(s) ativo(s)</small></h2>
        <form action={setPlanConfig} className="form">
          <input type="hidden" name="plan" value={p.plan} />
          <label>Preço-base (R$/mês)<input name="price" defaultValue={brlInput(p.base_price_cents)} required /></label>
          <label>Operações de IA por mês (vazio = ilimitado)<input name="ai_limit" type="number" min={0} defaultValue={p.ai_ops_monthly_limit ?? ""} /></label>
          <label>Gerações de imagem por mês (vazio = ilimitado)<input name="image_limit" type="number" min={0} defaultValue={p.image_gen_monthly_limit ?? ""} /></label>
          <SubmitButton pendingText="Salvando...">Salvar {PLAN_LABEL[p.plan] || p.plan}</SubmitButton>
        </form>
      </section>
    ))}
    <section className="card">
      <h2>Fotos de catálogo (automáticas)</h2>
      <p className="look-meta">Cada peça com foto ganha, ao ser cadastrada, uma foto de catálogo gerada por IA (custo estimado de R$ 0,30 cada). Defina quantas cada plano gera por mês; passou do limite, a peça segue com a foto original. Vazio = ilimitado. O teste gratuito usa o limite do Fashion.</p>
      {plans.map((p: any) => (
        <form key={p.plan} action={setStandardLimit} className="form">
          <input type="hidden" name="plan" value={p.plan} />
          <label>{PLAN_LABEL[p.plan] || p.plan}: fotos de catálogo por mês<input name="limit" type="number" min={0} defaultValue={stdLimits.get(p.plan) ?? ""} /></label>
          <SubmitButton pendingText="Salvando...">Salvar</SubmitButton>
        </form>
      ))}
    </section>
  </main>;
}
