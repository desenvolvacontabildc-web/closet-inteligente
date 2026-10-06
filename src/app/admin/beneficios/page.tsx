import { adminListAccounts, grantCredits, grantModule } from "@/server/admin-actions";
import SubmitButton from "@/components/submit-button";

export default async function Beneficios({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  const clients = accounts.filter((a: any) => !a.is_admin);

  return <main className="shell narrow">
    <h1>Benefícios</h1>
    {error && <p role="alert" className="trial-banner">{error}</p>}

    <section className="card">
      <h2>Regras automáticas</h2>
      <ul>
        <li>🎁 <strong>Cadastro:</strong> créditos bônus de geração de imagem ao concluir o perfil.</li>
        <li>🗓️ <strong>Marcos de uso:</strong> créditos extras com 1, 3, 6 e 12 meses de conta (5 / 10 / 15 / 30).</li>
        <li>🤝 <strong>Indicação:</strong> 10 créditos para quem indicou, quando a amiga indicada vira assinante pagante.</li>
        <li>🎨 <strong>Colorimetria:</strong> incluída no plano Super Star; as demais usuárias podem receber como cortesia abaixo.</li>
      </ul>
    </section>

    <section className="card">
      <h2>Conceder créditos de imagem</h2>
      <p className="look-meta">Créditos bônus não expiram e são usados depois do limite mensal do plano.</p>
      <form action={grantCredits} className="form">
        <input type="hidden" name="return_to" value="/admin/beneficios" />
        <label>Usuária
          <select name="user_id" required defaultValue="">
            <option value="" disabled>Escolha…</option>
            {clients.map((a: any) => <option key={a.user_id} value={a.user_id}>{a.display_name || a.email} — {a.email}</option>)}
          </select>
        </label>
        <label>Créditos<input name="credits" type="number" min={1} max={500} placeholder="Ex.: 10" required /></label>
        <label>Motivo (opcional)<input name="note" placeholder="Ex.: pedido de desculpas, campanha..." /></label>
        <SubmitButton pendingText="Concedendo...">Conceder créditos</SubmitButton>
      </form>
    </section>

    <section className="card">
      <h2>Liberar Colorimetria (cortesia)</h2>
      <form action={grantModule} className="form">
        <input type="hidden" name="module" value="COLORIMETRIA" /><input type="hidden" name="origin" value="CORTESIA_ADMIN" />
        <input type="hidden" name="return_to" value="/admin/beneficios" />
        <label>Usuária
          <select name="user_id" required defaultValue="">
            <option value="" disabled>Escolha…</option>
            {clients.map((a: any) => <option key={a.user_id} value={a.user_id}>{a.display_name || a.email} — {a.email}</option>)}
          </select>
        </label>
        <SubmitButton pendingText="Liberando...">Liberar Colorimetria</SubmitButton>
      </form>
    </section>
  </main>;
}
