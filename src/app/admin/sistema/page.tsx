import Link from "next/link";
import { adminListAccounts, adminImagesPaused, setImagesPaused, adminSignupMode } from "@/server/admin-actions";
import SubmitButton from "@/components/submit-button";

export default async function Sistema({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  const paused = await adminImagesPaused();
  const mode = await adminSignupMode();
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
