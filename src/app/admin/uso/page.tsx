import Link from "next/link";
import { adminListAccounts, adminUsage, adminListPlans } from "@/server/admin-actions";
import { STATUS_LABEL, PLAN_LABEL } from "../labels";

const IMAGE_CENTS = 17; // estimativa por imagem (R$ 0,17), igual ao painel inicial
const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default async function Uso() {
  const { accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  const { users, months } = await adminUsage();
  const plans = await adminListPlans();
  const limit = (plan: string) => plans.find((p: any) => p.plan === plan)?.image_gen_monthly_limit ?? null;
  const aiLimit = (plan: string) => plans.find((p: any) => p.plan === plan)?.ai_ops_monthly_limit ?? null;
  const cur = months[0] || { images: 0, look_images: 0, catalog_images: 0, ai_ops: 0 };
  const clients = users.filter((u: any) => !accounts.find((a: any) => a.user_id === u.user_id)?.is_admin);
  const active = clients.filter((u: any) => u.images_month > 0 || u.ai_ops_month > 0);

  return <main className="shell">
    <h1>Uso e custos</h1>
    <p className="look-meta">O custo é uma <strong>estimativa</strong> (R$ 0,17 por imagem). O gasto real está na página de uso da OpenAI.</p>

    <section className="card">
      <h2>Este mês</h2>
      <div className="adm-stats">
        <div><strong>{cur.images}</strong><small>imagens geradas ({cur.look_images} de look, {cur.catalog_images} de catálogo)</small></div>
        <div><strong>{brl(cur.images * IMAGE_CENTS)}</strong><small>custo estimado de imagens</small></div>
        <div><strong>{cur.ai_ops}</strong><small>pedidos de IA (texto)</small></div>
        <div><strong>{active.length}</strong><small>usuária{active.length === 1 ? "" : "s"} usando IA este mês</small></div>
      </div>
    </section>

    <section className="card">
      <h2>Últimos 6 meses</h2>
      <table className="adm-table">
        <thead><tr><th>Mês</th><th>Imagens</th><th>Custo estimado</th><th>Pedidos de IA</th></tr></thead>
        <tbody>{months.map((m: any) => <tr key={String(m.month)}><td>{MESES[new Date(m.month).getUTCMonth()]}/{String(new Date(m.month).getUTCFullYear()).slice(2)}</td><td>{m.images} <small>({m.look_images} look + {m.catalog_images} catálogo)</small></td><td>{brl(m.images * IMAGE_CENTS)}</td><td>{m.ai_ops}</td></tr>)}</tbody>
      </table>
    </section>

    <section className="card">
      <h2>Por usuária (este mês)</h2>
      <p className="look-meta">Em ordem de quem mais gerou imagens. Em vermelho: perto ou acima do limite do plano.</p>
      <div className="adm-scroll">
        <table className="adm-table">
          <thead><tr><th>Usuária</th><th>Situação</th><th>Imagens</th><th>IA</th><th>Créditos bônus</th><th>Peças</th></tr></thead>
          <tbody>{clients.map((u: any) => {
            const plan = u.sub_status === "TRIAL" ? "ARRUMADA" : u.plan; const lim = limit(plan); const aLim = aiLimit(plan);
            const hot = (lim && u.images_month >= lim * 0.85) || (aLim && u.ai_ops_month >= aLim * 0.85);
            return <tr key={u.user_id} className={hot ? "hot" : ""}>
              <td><Link href={`/admin/usuarias/${u.user_id}`}>{u.display_name || u.email}</Link></td>
              <td>{STATUS_LABEL[u.sub_status] || u.sub_status}{u.sub_status === "TRIAL" ? "" : ` · ${PLAN_LABEL[u.plan] || u.plan}`}</td>
              <td>{u.images_month}{lim ? ` / ${lim}` : ""} <small>({u.look_images_month}+{u.catalog_month})</small></td>
              <td>{u.ai_ops_month}{aLim ? ` / ${aLim}` : ""}</td>
              <td>{u.bonus_credits}</td>
              <td>{u.items_count}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  </main>;
}
