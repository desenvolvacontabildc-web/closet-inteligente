import Link from "next/link";
import { adminListAccounts, adminAudience, adminListOffers, groupExtend, groupGrantModule, groupGrantCredits } from "@/server/admin-actions";
import ConfirmButton from "@/components/confirm-button";
import { STATUS_LABEL } from "../labels";

const KINDS = [
  { key: "TRIAL", label: "Em teste grátis" },
  { key: "PIX", label: "Assinantes no Pix (inclui o Pix de teste)" },
  { key: "TRIAL_PIX", label: "Teste grátis + Pix" },
  { key: "CARD", label: "Assinantes no cartão recorrente" },
  { key: "ALL", label: "Todas as clientes" },
];
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "–");

export default async function Grupo({ searchParams }: { searchParams: Promise<{ kind?: string; offer?: string; error?: string }> }) {
  const sp = await searchParams;
  const { accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  const kind = KINDS.some((k) => k.key === sp.kind) ? sp.kind! : "TRIAL";
  const offers = await adminListOffers();
  const offer = /^[a-z0-9_-]{1,32}$/i.test(sp.offer || "") ? sp.offer!.toLowerCase() : "";
  const people = sp.kind ? await adminAudience(kind, offer) : [];
  const hidden = <><input type="hidden" name="kind" value={kind} /><input type="hidden" name="offer" value={offer} /></>;

  return <main className="shell narrow">
    <h1>Ações em grupo</h1>
    <p className="look-meta">Faça de uma vez só o que antes era usuária por usuária: estender o prazo, liberar a Colorimetria ou dar créditos. Primeiro escolha o grupo e confira quem entra; só depois aparecem os botões.</p>
    {sp.error && <p role="alert" className="trial-banner">{sp.error}</p>}

    <section className="card">
      <h2>1. Escolha o grupo</h2>
      <form method="get" className="form">
        <label>Quem
          <select name="kind" defaultValue={kind}>{KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
        </label>
        <label>Só quem entrou com o cupom (opcional)
          <select name="offer" defaultValue={offer}>
            <option value="">Qualquer cupom ou nenhum</option>
            {offers.map((o: any) => <option key={o.code} value={o.code}>{o.code}{o.label ? ` — ${o.label}` : ""}</option>)}
          </select>
        </label>
        <button>Ver quem entra</button>
      </form>
    </section>

    {sp.kind && <>
      <section className="card">
        <h2>2. Quem está neste grupo ({people.length})</h2>
        {people.length === 0 ? <p className="look-meta">Ninguém se encaixa neste grupo.</p> : <div className="adm-scroll"><table className="adm-table">
          <thead><tr><th>Usuária</th><th>Situação</th><th>Pagamento</th><th>Acesso até</th></tr></thead>
          <tbody>{people.map((p: any) => <tr key={p.user_id}>
            <td><Link href={`/admin/usuarias/${p.user_id}`}>{p.display_name || p.email}</Link></td>
            <td>{STATUS_LABEL[p.sub_status] || p.sub_status}</td>
            <td>{p.payment_method === "CARD" ? "Cartão" : p.payment_method === "PIX" ? "Pix" : "–"}</td>
            <td>{p.sub_status === "TRIAL" || p.sub_status === "TRIAL_EXPIRED" ? day(p.trial_ends_at) : day(p.current_period_end)}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>

      {people.length > 0 && <>
        <section className="card">
          <h2>3. Estender o prazo</h2>
          <p className="look-meta">Soma dias ao fim do teste grátis e ao fim do período de quem paga no Pix. O cartão recorrente não muda (a renovação é feita pelo Mercado Pago).</p>
          <form action={groupExtend} className="form">
            {hidden}
            <label>Dias a somar<input name="days" type="number" min={1} max={60} defaultValue={10} required /></label>
            <ConfirmButton pendingText="Estendendo..." message={`Estender o prazo de ${people.length} usuária(s) deste grupo?`}>Estender o prazo do grupo</ConfirmButton>
          </form>
        </section>

        <section className="card">
          <h2>Liberar a Colorimetria</h2>
          <p className="look-meta">Presente da campanha. Quem já tem a Colorimetria não é alterada.</p>
          <form action={groupGrantModule}>
            {hidden}
            <ConfirmButton pendingText="Liberando..." message={`Liberar a Colorimetria para ${people.length} usuária(s)?`}>Liberar a Colorimetria para o grupo</ConfirmButton>
          </form>
        </section>

        <section className="card">
          <h2>Dar créditos de imagem</h2>
          <form action={groupGrantCredits} className="form">
            {hidden}
            <label>Créditos para cada uma<input name="credits" type="number" min={1} max={500} placeholder="Ex.: 5" required /></label>
            <label>Motivo (opcional)<input name="note" placeholder="Ex.: agradecimento pelos testes" /></label>
            <ConfirmButton pendingText="Concedendo..." message={`Dar esses créditos para ${people.length} usuária(s)?`}>Dar créditos ao grupo</ConfirmButton>
          </form>
        </section>
      </>}
    </>}
  </main>;
}
