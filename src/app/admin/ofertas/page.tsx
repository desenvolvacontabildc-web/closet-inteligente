import { adminListOffers, adminListRedemptions, adminListAccounts, saveOffer, assignOffer, adminSignupMode, setSignupMode } from "@/server/admin-actions";
import SubmitButton from "@/components/submit-button";
import { PLAN_LABEL, brl, brlInput } from "../labels";

const BASE = process.env.APP_URL || "https://closet.desenvolvacontabil.com.br";

function OfferFields({ o }: { o?: any }) {
  return <>
    <label>Código (letras minúsculas, números, - ou _)<input name="code" defaultValue={o?.code || ""} readOnly={!!o} required placeholder="Ex.: teste199" /></label>
    <label>Nome da oferta (aparece para a usuária)<input name="label" defaultValue={o?.label || ""} placeholder="Ex.: Teste de pagamento" /></label>
    <div className="two-fields">
      <label>Plano liberado
        <select name="plan" defaultValue={o?.plan || "ARRUMADA"}>
          {Object.entries(PLAN_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label>Preço (R$)<input name="price" defaultValue={o ? brlInput(o.price_cents) : "1,99"} required /></label>
    </div>
    <div className="two-fields">
      <label>Dias de acesso<input name="days" type="number" min={1} max={90} defaultValue={o?.days || 7} required /></label>
      <label>Limite de usos (vazio = sem limite)<input name="max_uses" type="number" min={1} defaultValue={o?.max_uses ?? ""} /></label>
    </div>
    <label>Vale até (opcional)<input name="expires" type="date" defaultValue={o?.expires_at ? new Date(o.expires_at).toISOString().slice(0, 10) : ""} /></label>
    <label className="checkbox"><input type="checkbox" name="active" defaultChecked={o ? o.active : true} /> Oferta ativa (aceita novos cadastros)</label>
  </>;
}

export default async function Ofertas({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  const offers = await adminListOffers();
  const signupMode = await adminSignupMode();
  const redemptions = await adminListRedemptions();
  const clients = accounts.filter((a: any) => !a.is_admin);

  return <main className="shell narrow">
    <h1>Ofertas de teste</h1>
    <p className="look-meta">Crie um código para as testadoras. Quem se cadastrar com ele (ou receber a oferta de você) vê, na tela de Assinatura, o botão para pagar o preço da oferta no Pix e usar o plano pelos dias definidos. O pagamento é real (passa pelo Mercado Pago), só que barato, e é liberado automaticamente.</p>
    {error && <p role="alert" className="trial-banner">{error}</p>}

    <section className="card">
      <h2>Cadastro de novas contas: {signupMode === "OPEN" ? "aberto para todas" : "só por convite"}</h2>
      <p className="look-meta">{signupMode === "OPEN"
        ? "Qualquer pessoa pode criar conta e ganha os 7 dias grátis do teste. O link da bio leva ao cadastro."
        : "Só cria conta quem tiver um código de convite válido (como o das ofertas abaixo). Quem chega pelo link da bio sem código vê o botão da lista de espera no WhatsApp."}</p>
      <form action={setSignupMode}>
        <input type="hidden" name="mode" value={signupMode === "OPEN" ? "INVITE" : "OPEN"} />
        <SubmitButton pendingText="Alterando...">{signupMode === "OPEN" ? "Voltar para só por convite" : "Abrir o cadastro para todas"}</SubmitButton>
      </form>
    </section>

    <section className="card">
      <h2>Ofertas criadas</h2>
      {offers.length === 0 && <p>Nenhuma oferta ainda.</p>}
      {offers.map((o: any) => <details key={o.code} className="more offer-row">
        <summary>
          <strong>{o.code}</strong> · {PLAN_LABEL[o.plan]} · {brl(o.price_cents)} por {o.days} dias
          <small> · {o.uses}{o.max_uses ? `/${o.max_uses}` : ""} uso{o.uses === 1 ? "" : "s"}, {Number(o.paid)} pago{Number(o.paid) === 1 ? "" : "s"}{o.active ? "" : " · desativada"}</small>
        </summary>
        <p className="look-meta">Link da apresentação com o código: <strong>{BASE}/apresentacao?cupom={o.code}</strong><br />Link direto para o cadastro: <strong>{BASE}/?cupom={o.code}</strong></p>
        <form action={saveOffer} className="form"><OfferFields o={o} /><SubmitButton pendingText="Salvando...">Salvar alterações</SubmitButton></form>
      </details>)}
    </section>

    <section className="card">
      <h2>Nova oferta</h2>
      <form action={saveOffer} className="form"><OfferFields /><SubmitButton pendingText="Criando...">Criar oferta</SubmitButton></form>
    </section>

    <section className="card">
      <h2>Aplicar a uma usuária que já tem conta</h2>
      <form action={assignOffer} className="form">
        <label>Usuária
          <select name="user_id" required defaultValue="">
            <option value="" disabled>Escolha…</option>
            {clients.map((a: any) => <option key={a.user_id} value={a.user_id}>{a.display_name || a.email} — {a.email}</option>)}
          </select>
        </label>
        <label>Oferta
          <select name="code" required defaultValue="">
            <option value="" disabled>Escolha…</option>
            {offers.filter((o: any) => o.active).map((o: any) => <option key={o.code} value={o.code}>{o.code} — {brl(o.price_cents)} por {o.days} dias</option>)}
          </select>
        </label>
        <SubmitButton pendingText="Aplicando...">Aplicar oferta</SubmitButton>
      </form>
    </section>

    <section className="card">
      <h2>Quem usou</h2>
      {redemptions.length === 0 ? <p>Ninguém usou uma oferta ainda.</p> : <ul className="event-list">
        {redemptions.map((r: any) => <li key={r.user_id}>
          <span><strong>{r.display_name || r.email}</strong><small>{r.email} · código {r.code} · {new Date(r.redeemed_at).toLocaleDateString("pt-BR")}</small></span>
          <span>{r.paid_at ? `Pagou em ${new Date(r.paid_at).toLocaleDateString("pt-BR")}` : "Ainda não pagou"}</span>
        </li>)}
      </ul>}
    </section>
  </main>;
}
