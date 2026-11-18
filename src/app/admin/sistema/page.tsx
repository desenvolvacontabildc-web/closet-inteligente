import Link from "next/link";
import { adminListAccounts, adminImagesPaused, setImagesPaused, adminSignupMode, adminPushStats, adminPushPreview, sendTestPushToMe } from "@/server/admin-actions";
import SubmitButton from "@/components/submit-button";

export default async function Sistema({ searchParams }: { searchParams: Promise<{ error?: string; simular?: string }> }) {
  const { error, simular } = await searchParams;
  const { accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  const paused = await adminImagesPaused();
  const mode = await adminSignupMode();
  const push = await adminPushStats();
  const preview = simular === "1" ? await adminPushPreview() : null;
  return <main className="shell narrow">
    <h1>Sistema</h1>
    {error && <p role="alert" className="trial-banner">{error}</p>}

    <section className={paused ? "card alert-card" : "card"}>
      <h2>Geração de imagens</h2>
      <p className="look-meta">{paused ? "PAUSADA: ninguém consegue gerar imagens de look nem fotos de catálogo. O resto do app funciona normalmente." : "Liberada: as usuárias geram imagens dentro dos limites do plano."}</p>
      <p className="look-meta">Use a pausa se o saldo da OpenAI estiver acabando ou se algo estranho estiver gastando demais. Os looks e as peças continuam funcionando, só as imagens ficam em espera, e as usuárias veem um aviso claro.</p>
      <form action={setImagesPaused}>
        <input type="hidden" name="paused" value={paused ? "0" : "1"} />
        <SubmitButton pendingText="Salvando...">{paused ? "Liberar a geração de imagens" : "Pausar a geração de imagens"}</SubmitButton>
      </form>
    </section>

    <section className="card">
      <h2>Lembretes no celular</h2>
      <p className="look-meta">{push.users} usuária{push.users === 1 ? "" : "s"} com lembretes ativados ({push.devices} aparelho{push.devices === 1 ? "" : "s"}) · {push.sent_7d} lembrete{push.sent_7d === 1 ? "" : "s"} enviado{push.sent_7d === 1 ? "" : "s"} nos últimos 7 dias.</p>
      <p className="look-meta">Os avisos saem sozinhos às 9h (skincare da manhã e cabelo), às 10h (teste grátis acabando e Pix vencendo) e às 20h (skincare da noite), no horário de Recife, uma vez por dia por tipo.</p>
      <div className="action-row">
        <form action={sendTestPushToMe}><SubmitButton pendingText="Enviando...">Enviar notificação de teste para mim</SubmitButton></form>
        <Link href="/admin/sistema?simular=1" className="link">Simular o que seria enviado agora</Link>
      </div>
      {preview && (preview.length === 0 ? <p className="look-meta">Nada a enviar agora para quem tem lembretes ativados.</p> : <ul>{preview.map((p, i) => <li key={i}>{p.title} <small>({p.kind}, {p.devices} aparelho{p.devices === 1 ? "" : "s"})</small></li>)}</ul>)}
    </section>

    <section className="card">
      <h2>Cadastros</h2>
      <p className="look-meta">Modo atual: <strong>{String(mode) === "OPEN" ? "aberto (qualquer pessoa pode criar conta)" : "por convite (só com código de teste)"}</strong>.</p>
      <p className="look-meta">Para mudar o modo e criar códigos de convite, use <Link href="/admin/ofertas">Ofertas de teste</Link>.</p>
    </section>

    <section className="card">
      <h2>Atalhos</h2>
      <ul>
        <li><a href="/api/admin/usuarias">Baixar a lista de usuárias (planilha)</a></li>
        <li><Link href="/admin/uso">Ver uso e custos</Link></li>
        <li><Link href="/admin/comunicados">Publicar um comunicado no app</Link></li>
      </ul>
    </section>
  </main>;
}
