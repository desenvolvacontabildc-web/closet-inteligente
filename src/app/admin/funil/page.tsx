import Link from "next/link";
import { adminListAccounts, adminFunnel } from "@/server/admin-actions";

const IMAGE_CENTS = 17; // estimativa por imagem (R$ 0,17), igual a página de uso
const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");
const PERIODS = [{ d: 7, label: "7 dias" }, { d: 30, label: "30 dias" }, { d: 90, label: "90 dias" }, { d: 0, label: "Desde o início" }];

export default async function Funil({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const sp = await searchParams;
  const { accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  const days = PERIODS.some((p) => String(p.d) === sp.dias) ? Number(sp.dias) : 30;
  const { f, weeks } = await adminFunnel(days);

  const steps = [
    { label: "Criaram a conta", n: f.cadastros },
    { label: "Terminaram o cadastro inicial", n: f.onboarding },
    { label: "Cadastraram a primeira peça", n: f.com_peca },
    { label: "Geraram o primeiro look", n: f.com_look },
    { label: "Aprovaram ou usaram um look", n: f.look_aprovado },
    { label: "Voltaram em outro dia", n: f.voltou },
    { label: "Pagaram", n: f.pagou },
  ];
  // maior queda entre uma etapa e a seguinte, para apontar onde vale agir
  let worst = -1, worstLoss = 0;
  for (let i = 1; i < steps.length; i++) { const prev = steps[i - 1].n; const loss = prev > 0 ? (prev - steps[i].n) / prev : 0; if (prev >= 3 && loss > worstLoss) { worstLoss = loss; worst = i; } }
  const cost = f.imagens * IMAGE_CENTS;
  const top = Math.max(1, f.cadastros);

  return <main className="shell">
    <h1>Funil de conversão</h1>
    <p className="look-meta">Mostra por onde as pessoas que se cadastraram avançam, e onde param. Conta só contas reais (sem a sua, sem closets extras de uma mesma conta).</p>
    <div className="action-row">
      {PERIODS.map((p) => <Link key={p.d} href={`/admin/funil?dias=${p.d}`} className={p.d === days ? "chip chip-ACTIVE" : "link"}>{p.label}</Link>)}
    </div>

    <section className="card">
      <h2>{PERIODS.find((p) => p.d === days)?.label === "Desde o início" ? "Todas as contas" : `Quem se cadastrou nos últimos ${days} dias`}</h2>
      {f.cadastros === 0 ? <p className="look-meta">Ninguém se cadastrou neste período ainda.</p> : <div className="funnel">
        {steps.map((s, i) => <div className="funnel-row" key={s.label}>
          <div className="funnel-head"><span>{s.label}</span><strong>{s.n}</strong><small>{i === 0 ? "" : `${pct(s.n, steps[i - 1].n)} da etapa anterior · ${pct(s.n, f.cadastros)} do total`}</small></div>
          <div className="funnel-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, Math.round((s.n / top) * 100))}%` }} /></div>
        </div>)}
      </div>}
      {worst > 0 && <p className="look-meta"><strong>Onde mais se perde:</strong> entre “{steps[worst - 1].label.toLowerCase()}” e “{steps[worst].label.toLowerCase()}” ({Math.round(worstLoss * 100)}% não seguiram).</p>}
    </section>

    <section className="card">
      <h2>Situação das contas deste grupo</h2>
      <div className="adm-stats">
        <div><strong>{f.ativas}</strong><small>assinante{f.ativas === 1 ? "" : "s"} ativa{f.ativas === 1 ? "" : "s"} hoje</small></div>
        <div><strong>{f.em_teste}</strong><small>ainda no teste grátis</small></div>
        <div><strong>{f.com_lembretes}</strong><small>com lembretes no celular</small></div>
      </div>
    </section>

    <section className="card">
      <h2>Custo de IA deste grupo</h2>
      <div className="adm-stats">
        <div><strong>{f.imagens}</strong><small>imagens geradas</small></div>
        <div><strong>{brl(cost)}</strong><small>custo estimado de imagens</small></div>
        <div><strong>{f.cadastros > 0 ? brl(Math.round(cost / f.cadastros)) : "–"}</strong><small>por pessoa cadastrada</small></div>
        <div><strong>{f.pagou > 0 ? brl(Math.round(cost / f.pagou)) : "–"}</strong><small>por pessoa que pagou</small></div>
        <div><strong>{f.ai_ops}</strong><small>pedidos de IA (texto)</small></div>
      </div>
      <p className="look-meta">Estimativa de R$ 0,17 por imagem. O gasto real está na página de uso da OpenAI. Veja o detalhe de cada usuária em <Link href="/admin/uso">Uso e custos</Link>.</p>
    </section>

    <section className="card">
      <h2>Por semana de cadastro</h2>
      <div className="adm-scroll">
        <table className="adm-table">
          <thead><tr><th>Semana de</th><th>Cadastros</th><th>Com peça</th><th>Com look</th><th>Pagaram</th></tr></thead>
          <tbody>{weeks.map((w: any) => <tr key={String(w.week)}>
            <td>{new Date(w.week).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}</td>
            <td>{w.cadastros}</td><td>{w.com_peca} <small>({pct(w.com_peca, w.cadastros)})</small></td><td>{w.com_look} <small>({pct(w.com_look, w.cadastros)})</small></td><td>{w.pagou} <small>({pct(w.pagou, w.cadastros)})</small></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </main>;
}
