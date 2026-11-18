import Link from "next/link";
import { adminListAccounts, grantCredits, grantModule, adminCardGift, setCardGift } from "@/server/admin-actions";
import SubmitButton from "@/components/submit-button";

export default async function Beneficios({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  const clients = accounts.filter((a: any) => !a.is_admin);
  const cardGift = await adminCardGift();

  return <main className="shell narrow">
    <h1>Benefícios</h1>
    {error && <p role="alert" className="trial-banner">{error}</p>}

    <section className="card">
      <h2>Regras automáticas</h2>
      <ul>
        <li><strong>Cadastro:</strong> créditos bônus de geração de imagem ao concluir o perfil.</li>
        <li><strong>Marcos de uso:</strong> créditos extras com 1, 3, 6 e 12 meses de conta (5 / 10 / 15 / 30).</li>
        <li><strong>Indicação:</strong> 10 créditos para quem indicou, quando a amiga indicada vira assinante pagante.</li>
        <li><strong>Indicação (10 amigas):</strong> quem indica 10 amigas que viram assinantes ganha a Colorimetria de presente, liberada automaticamente.</li>
        <li><strong>Colorimetria:</strong> vendida à parte (compra única, em Assinatura → Extras); você pode liberar como cortesia abaixo.</li>
      </ul>
    </section>

    <section className={cardGift ? "card start-card" : "card"}>
      <h2>Campanha: Colorimetria de brinde no cartão recorrente</h2>
      <p className="look-meta">{cardGift ? "LIGADA: quem passar a assinar no cartão recorrente ganha a Colorimetria automaticamente (quem já assinava no cartão também recebeu)." : "Desligada: ninguém ganha a Colorimetria só por assinar no cartão."} No plano Super Star ela já vem incluída.</p>
      <form action={setCardGift}>
        <input type="hidden" name="on" value={cardGift ? "0" : "1"} />
        <button>{cardGift ? "Desligar a campanha" : "Ligar a campanha"}</button>
      </form>
      <p className="look-meta">Para dar a Colorimetria a um grupo de uma vez (por exemplo, quem já assina no cartão), use <Link href="/admin/grupo?kind=CARD">Ações em grupo</Link>.</p>
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
