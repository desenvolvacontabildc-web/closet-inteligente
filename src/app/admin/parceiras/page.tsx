import Link from "next/link";
import { adminListPartners, adminPartnerPrices, adminPartnerCharges, setPartner, grantPartnerDays, setPartnerPrice } from "@/server/admin-partner-actions";
import { PARTNER_PACKAGE_LABEL, PARTNER_PACKAGE_IMAGE_LIMIT } from "@/server/partner-limits";
import SubmitButton from "@/components/submit-button";
import { brl, brlInput } from "../labels";

const KIND: Record<string, string> = { PIX: "Pix", CARD_PREAPPROVAL: "Cartão recorrente" };
const STATUS: Record<string, string> = { pending: "pendente", approved: "pago", cancelled: "cancelado", rejected: "recusado", paused: "pausado" };

export default async function AdminParceiras({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { partners } = await adminListPartners();
  if (!partners) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/admin">← Gerenciamento</a></main>;
  const prices = await adminPartnerPrices();
  const charges = new Map<string, any[]>();
  for (const p of partners) charges.set(p.id, await adminPartnerCharges(p.id));
  const pending = partners.filter((p: any) => !p.approved).length;

  return <main className="shell narrow">
    <h1>Parcerias</h1>
    {error && <p role="alert" className="trial-banner">{error}</p>}

    <section className="card">
      <h2>Preço dos pacotes das lojas</h2>
      <p className="look-meta">Mensalidade de cada pacote (Pix ou cartão recorrente, como as clientes). O limite de peças e de imagens do Provador por mês é fixo por pacote.</p>
      {prices.map((p: any) => (
        <form key={p.package} action={setPartnerPrice} className="form">
          <input type="hidden" name="package" value={p.package} />
          <label>{PARTNER_PACKAGE_LABEL[p.package]} · {PARTNER_PACKAGE_IMAGE_LIMIT[p.package]} imagens/mês no Provador — preço (R$/mês)
            <input name="price" defaultValue={brlInput(p.price_cents)} required />
          </label>
          <SubmitButton pendingText="Salvando...">Salvar preço</SubmitButton>
        </form>
      ))}
    </section>

    <h2>Lojas {pending > 0 && <span className="chip chip-SUSPENDED">{pending} aguardando aprovação</span>}</h2>
    {partners.length === 0 && <p className="look-meta">Nenhuma loja cadastrada ainda. As usuárias abrem a loja em Perfil → "Quero ser parceira".</p>}
    {partners.map((p: any) => {
      const dueDays = p.current_period_end ? Math.ceil((new Date(p.current_period_end).getTime() - Date.now()) / 86400000) : null;
      return <section key={p.id} className="card">
        <h3>{p.store_name} <span className={`chip ${p.live ? "chip-ACTIVE" : p.approved ? "chip-PAST_DUE" : "chip-TRIAL"}`}>{p.live ? "na vitrine" : p.approved ? "aprovada, sem pacote ativo" : "aguardando aprovação"}</span></h3>
        <p className="look-meta">{p.email}{p.user_id && <> · <Link href={`/admin/usuarias/${p.user_id}`}>ficha da usuária</Link></>} · desde {new Date(p.created_at).toLocaleDateString("pt-BR")}</p>
        <p className="look-meta">{p.whatsapp ? `WhatsApp ${p.whatsapp}` : "sem WhatsApp"} · {p.instagram ? `@${p.instagram}` : "sem Instagram"} · {p.item_count} peça(s) publicada(s)</p>
        <p className="look-meta">Últimos 30 dias: {p.views30} visualizações · {p.clicks30} contatos</p>
        <p className="look-meta">
          {p.provider === "MERCADOPAGO" ? `${p.payment_method === "CARD" ? "Cartão recorrente" : "Pix"} · ` : p.current_period_end ? "Cortesia · " : "Sem pacote pago · "}
          {dueDays !== null ? (dueDays >= 0 ? `vitrine liberada por mais ${dueDays} dia(s)` : `vencido há ${-dueDays} dia(s)`) : "sem período ativo"}
        </p>
        <form action={setPartner} className="form">
          <input type="hidden" name="partner_id" value={p.id} />
          <label>Pacote
            <select name="package" defaultValue={p.package}>
              <option value="BASICA">{PARTNER_PACKAGE_LABEL.BASICA}</option>
              <option value="PLUS">{PARTNER_PACKAGE_LABEL.PLUS}</option>
              <option value="PREMIUM">{PARTNER_PACKAGE_LABEL.PREMIUM}</option>
            </select>
          </label>
          <label className="checkbox"><input type="checkbox" name="approved" defaultChecked={p.approved} /> Aprovada (pode ativar o pacote e aparecer na vitrine)</label>
          <label>Recado para a loja (aparece no painel dela)<input name="note" defaultValue={p.review_note} placeholder="Ex.: falta o logo; bem-vinda!" /></label>
          <SubmitButton pendingText="Salvando...">Salvar</SubmitButton>
        </form>
        <form action={grantPartnerDays} className="form">
          <input type="hidden" name="partner_id" value={p.id} />
          <label>Cortesia: liberar dias de vitrine sem cobrar<input name="days" type="number" min={1} max={3650} placeholder="Ex.: 30" required /></label>
          <SubmitButton pendingText="Liberando...">Liberar dias</SubmitButton>
        </form>
        {(charges.get(p.id) || []).length > 0 && <>
          <h4>Cobranças</h4>
          <ul>{charges.get(p.id)!.map((c: any, i: number) => <li key={i}>{KIND[c.kind] || c.kind} · {PARTNER_PACKAGE_LABEL[c.package]} · {brl(c.amount_cents)} · <strong>{STATUS[c.status] || c.status}</strong> <small>({new Date(c.created_at).toLocaleString("pt-BR")})</small></li>)}</ul>
        </>}
      </section>;
    })}
  </main>;
}
