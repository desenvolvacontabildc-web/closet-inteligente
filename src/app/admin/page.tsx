import Link from "next/link";
import { adminListAccounts, adminListNotifications, adminImageSpend, markNotificationsRead } from "@/server/admin-actions";
import SubmitButton from "@/components/submit-button";

const IMAGE_SPEND_ALERT_CENTS = 10000; // R$ 100/mês — avisa quando o gasto estimado com geração de imagem passar disso
const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

export default async function Admin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;

  const notifications = await adminListNotifications();
  const unread = notifications.filter((n: any) => !n.read_at).length;
  const imageSpend = await adminImageSpend();
  const imageSpendOverLimit = Number(imageSpend.estimated_cents) >= IMAGE_SPEND_ALERT_CENTS;

  const clients = accounts.filter((a: any) => !a.is_admin);
  const active = clients.filter((a: any) => a.sub_status === "ACTIVE");
  const mrrCents = active.reduce((sum: number, a: any) => sum + Math.max(0, a.monthly_fee_cents - a.discount_cents), 0);
  const attention = clients.filter((a: any) => ["PAST_DUE", "SUSPENDED", "TRIAL_EXPIRED"].includes(a.sub_status)).length;
  const trial = clients.filter((a: any) => a.sub_status === "TRIAL").length;
  const inactive30d = clients.filter((a: any) => !a.last_login_at || new Date(a.last_login_at).getTime() < Date.now() - 30 * 86400000).length;

  return <main className="shell narrow">
    <h1>Gerenciamento</h1>
    {error && <p role="alert" className="trial-banner">{error}</p>}

    <div className="admin-tiles">
      <Link href="/admin/usuarias" className="admin-tile"><strong>👥 Usuárias</strong><small>{clients.length} cadastrada{clients.length === 1 ? "" : "s"} · {active.length} assinante{active.length === 1 ? "" : "s"}</small>{attention > 0 && <span className="pill">{attention} precisa{attention === 1 ? "" : "m"} de atenção</span>}</Link>
      <Link href="/admin/precos" className="admin-tile"><strong>💲 Preços e planos</strong><small>Valores e limites de cada plano</small></Link>
      <Link href="/admin/descontos" className="admin-tile"><strong>🏷️ Descontos</strong><small>Desconto do cartão recorrente</small></Link>
      <Link href="/admin/beneficios" className="admin-tile"><strong>🎁 Benefícios</strong><small>Créditos de imagem e Colorimetria</small></Link>
      <Link href="/admin/parceiras" className="admin-tile"><strong>🤝 Parcerias</strong><small>Parceiras e vitrine</small></Link>
      <Link href="/admin/tendencias" className="admin-tile"><strong>✨ Tendências</strong><small>Radar de tendências</small></Link>
      <Link href="/admin/achadinhos" className="admin-tile"><strong>🛍️ Achadinhos</strong><small>Achados com desconto</small></Link>
    </div>

    <section className="card">
      <h2>Avisos {unread > 0 && <span className="chip chip-SUSPENDED">{unread} novo{unread === 1 ? "" : "s"}</span>}</h2>
      <p className="look-meta">Pagamentos recebidos já liberam a usuária automaticamente; aqui você só acompanha. Atrasos e suspensões também aparecem aqui.</p>
      {notifications.length === 0 ? <p>Nenhum aviso ainda.</p> : notifications.slice(0, 20).map((n: any) => (
        <div key={n.id} className={`notif ${n.kind}${n.read_at ? "" : " unread"}`}>
          <p><strong>{n.title}</strong> <small>· {new Date(n.created_at).toLocaleString("pt-BR")}</small></p>
          <p className="look-meta">{n.body}</p>
          {n.kind === "PARTNER" ? <Link href="/admin/parceiras" className="link">Abrir parcerias →</Link>
            : n.user_id && <Link href={`/admin/usuarias/${n.user_id}`} className="link">Abrir ficha da usuária →</Link>}
        </div>
      ))}
      {unread > 0 && <form action={markNotificationsRead}><SubmitButton pendingText="Marcando...">Marcar todos como lidos</SubmitButton></form>}
    </section>

    <section className="card">
      <h2>Resumo</h2>
      <p className="look-meta">Receita mensal ativa (MRR)</p>
      <p className="look-pieces"><strong>{brl(mrrCents)}</strong> de {active.length} assinante{active.length === 1 ? "" : "s"} ativo{active.length === 1 ? "" : "s"}</p>
      <p className="look-meta">{trial} em teste gratuito · {attention} com pagamento pendente/suspensa · {inactive30d} sem acessar há 30+ dias</p>
    </section>

    <section className={imageSpendOverLimit ? "card alert-card" : "card"}>
      <h2>Gasto estimado com ilustração de IA este mês</h2>
      <p className="look-pieces"><strong>{brl(Number(imageSpend.estimated_cents))}</strong> · {imageSpend.month_count} ilustração{Number(imageSpend.month_count) === 1 ? "" : "ões"} gerada{Number(imageSpend.month_count) === 1 ? "" : "s"} (estimativa de R$ 0,30 cada)</p>
      {imageSpendOverLimit
        ? <p role="alert">⚠️ Passou de {brl(IMAGE_SPEND_ALERT_CENTS)} este mês. Vale checar o consumo direto na OpenAI.</p>
        : <p className="look-meta">Aviso automático se passar de {brl(IMAGE_SPEND_ALERT_CENTS)}/mês.</p>}
    </section>
  </main>;
}
