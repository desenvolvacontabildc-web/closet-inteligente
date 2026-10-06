import Link from "next/link";
import { redirect } from "next/navigation";
import { withStore } from "@/server/store-session";
import { reconcilePartnerPix } from "@/server/billing-sync";
import { addPartnerItem, updatePartnerItem, togglePartnerItem, removePartnerItem, setPartnerLogo, updatePartnerContact } from "@/server/partner-items-actions";
import { startPartnerPix, startPartnerCard } from "@/server/partner-billing-actions";
import { PARTNER_PACKAGE_LIMIT, PARTNER_PACKAGE_LABEL } from "@/server/partner-limits";
import SubmitButton from "@/components/submit-button";
import StoreNav from "@/components/store-nav";

const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const PACKAGES = ["BASICA", "PLUS", "PREMIUM"];
const GRACE_DAYS = 5;

export default async function MinhaVitrine({ searchParams }: { searchParams: Promise<{ error?: string; pagamento?: string }> }) {
  const { error, pagamento } = await searchParams;
  const data = await withStore(async (c, _userId, partnerId) => {
    let pending = (await c.query("SELECT * FROM partner_my_pending_charge($1)", [partnerId])).rows[0] || null;
    if (await reconcilePartnerPix(c, pending)) pending = (await c.query("SELECT * FROM partner_my_pending_charge($1)", [partnerId])).rows[0] || null;
    const me = (await c.query("SELECT * FROM partner_me($1)", [partnerId])).rows[0];
    const items = (await c.query("SELECT * FROM partner_list_own_items($1)", [partnerId])).rows;
    const stats = new Map<string, any>((await c.query("SELECT * FROM partner_item_stats($1)", [partnerId])).rows.map((r: any) => [r.item_id, r]));
    const store = (await c.query("SELECT * FROM partner_store_stats($1)", [partnerId])).rows[0];
    const prices: Record<string, number> = {};
    for (const p of PACKAGES) prices[p] = (await c.query("SELECT partner_package_price($1) p", [p])).rows[0]?.p ?? 0;
    return { partnerId, pending, me, items, stats, store, prices };
  });
  if (!data) redirect("/");
  const { partnerId, pending, me, items, stats, store, prices } = data;
  const hasLogo = !!me.has_logo;

  const activeCount = items.filter((i: any) => i.active).length;
  const limit = PARTNER_PACKAGE_LIMIT[me.package] ?? null;
  const periodEnd = me.current_period_end ? new Date(me.current_period_end) : null;
  const daysLeft = periodEnd ? Math.ceil((periodEnd.getTime() - Date.now()) / 86400000) : null;
  const expired = daysLeft !== null && daysLeft < 0;
  const hideIn = expired ? GRACE_DAYS + (daysLeft as number) : null;
  const showPix = pending?.kind === "PIX" && pending.status === "pending" && (!pending.pix_expires_at || new Date(pending.pix_expires_at) > new Date());
  const showCardWait = pagamento === "cartao" && pending?.kind === "CARD_PREAPPROVAL" && pending.status === "pending";
  const canPay = me.approved && (!me.live || (daysLeft !== null && daysLeft <= 7));

  return <main className="shell">
    <StoreNav active="vitrine" />
    <section className="hero">
      <span className="eyebrow">MINHA LOJA</span>
      <h1>{me.store_name}</h1>
      <p className="look-meta">{PARTNER_PACKAGE_LABEL[me.package] || me.package} · {activeCount}{limit != null ? `/${limit}` : ""} peça{activeCount === 1 ? "" : "s"} publicada{activeCount === 1 ? "" : "s"}</p>
    </section>
    {error && <p role="alert" className="trial-banner">{error}</p>}

    {!me.approved && <div className="card alert-card" role="status">
      <h2>Aguardando aprovação</h2>
      <p>A equipe do Closet está analisando sua loja. Enquanto isso, você já pode cadastrar peças e configurar o contato — nada aparece para as clientes até a aprovação.</p>
      {me.review_note && <p><strong>Recado da equipe:</strong> {me.review_note}</p>}
    </div>}
    {me.approved && !me.live && <div className="card alert-card" role="status">
      <h2>🎉 Loja aprovada{me.approved_at ? ` em ${new Date(me.approved_at).toLocaleDateString("pt-BR")}` : ""}!</h2>
      <p>{expired ? "O período do seu pacote acabou, por isso a loja saiu da vitrine." : "Falta só ativar o seu pacote para a loja aparecer na vitrine."} Escolha abaixo e pague com Pix ou cartão.</p>
      {me.review_note && <p><strong>Recado da equipe:</strong> {me.review_note}</p>}
    </div>}
    {me.live && <div className={`card${canPay ? " alert-card" : ""}`} role="status">
      <h2>✅ Sua loja está na vitrine</h2>
      <p className="look-meta">{periodEnd ? `Pacote ${expired ? "venceu" : "pago"} até ${periodEnd.toLocaleDateString("pt-BR")}.` : ""}{expired && hideIn !== null ? ` A loja sai da vitrine em ${Math.max(0, hideIn)} dia(s) se não renovar.` : daysLeft !== null && daysLeft <= 7 && daysLeft >= 0 ? ` Renove em até ${daysLeft} dia(s) para continuar aparecendo.` : ""}</p>
    </div>}

    {showCardWait && <div className="card alert-card"><h2>Confirmando sua assinatura...</h2><p>Estamos aguardando a confirmação do Mercado Pago. Atualize a página em alguns segundos.</p><a href="/minha-vitrine?pagamento=cartao"><button className="link">Atualizar</button></a></div>}
    {showPix && pending && <div className="card alert-card" style={{ borderColor: "#a9714c", background: "#fdf6ee" }}>
      <h2>Pix pendente — {brl(pending.amount_cents)}</h2>
      <p>Escaneie o QR code ou copie o código no app do seu banco.{pending.pix_expires_at && ` Expira em ${new Date(pending.pix_expires_at).toLocaleString("pt-BR")}.`}</p>
      {pending.pix_qr_code_base64 && <img src={`data:image/png;base64,${pending.pix_qr_code_base64}`} alt="QR code Pix" style={{ maxWidth: 240, display: "block", margin: "12px 0" }} />}
      {pending.pix_qr_code && <textarea readOnly defaultValue={pending.pix_qr_code} rows={3} style={{ width: "100%", fontSize: 12 }} />}
      <p className="look-meta">Depois de pagar, a loja é liberada automaticamente (até 1 minuto).</p>
      <a href="/minha-vitrine"><button className="link">Já paguei — atualizar</button></a>
    </div>}

    {canPay && <section className="card">
      <h2>{me.live ? "Renovar pacote" : "Ativar pacote da loja"}</h2>
      <p className="look-meta">Pix vale 30 dias e você renova aqui. No cartão a cobrança é mensal e automática. A loja sai da vitrine se passar de {GRACE_DAYS} dias do vencimento.</p>
      {PACKAGES.map((p) => (
        <div key={p} className="strategy-card">
          <strong>{PARTNER_PACKAGE_LABEL[p]}</strong> — {prices[p] ? `${brl(prices[p])}/mês` : "consulte a equipe"}{me.package === p && " · seu pacote atual"}
          {prices[p] > 0 && <div className="action-row">
            <form action={startPartnerPix}><input type="hidden" name="package" value={p} /><SubmitButton pendingText="Gerando Pix...">Pagar com Pix</SubmitButton></form>
            <form action={startPartnerCard}><input type="hidden" name="package" value={p} /><SubmitButton pendingText="Abrindo pagamento...">Assinar no cartão</SubmitButton></form>
          </div>}
        </div>
      ))}
    </section>}

    <section className="card">
      <h2>Contato com as clientes</h2>
      <p className="look-meta">As clientes tocam nesses links na vitrine para falar com a sua loja. Informe pelo menos um.</p>
      <form action={updatePartnerContact} className="form">
        <label>Nome da loja<input name="store_name" required maxLength={80} defaultValue={me.store_name} /></label>
        <label>Instagram (usuário ou link do perfil)<input name="instagram" placeholder="minhaloja" defaultValue={me.instagram} /></label>
        <label>WhatsApp (com DDD)<input name="whatsapp" placeholder="81 99999-9999" defaultValue={me.whatsapp} /></label>
        <SubmitButton pendingText="Salvando...">Salvar contato</SubmitButton>
      </form>
    </section>

    <section className="card">
      <h2>Logo da loja</h2>
      <p className="look-meta">Aparece ao lado do nome da sua loja na Vitrine (depois da aprovação).</p>
      {hasLogo && me.approved && <img src={`/api/vitrine/logos/${partnerId}`} alt={me.store_name} style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover" }} />}
      <form action={setPartnerLogo} encType="multipart/form-data" className="form">
        <label>{hasLogo ? "Trocar logo" : "Adicionar logo"}<input type="file" name="logo" accept="image/*" required /></label>
        <SubmitButton pendingText="Enviando...">Salvar logo</SubmitButton>
      </form>
    </section>

    <section className="card">
      <h2>Desempenho (últimos 30 dias)</h2>
      <p className="look-meta">Conta clientes únicas por dia — a mesma cliente vendo a mesma peça várias vezes no mesmo dia conta uma vez.</p>
      <div className="admin-tiles">
        <div className="admin-tile"><strong>{store?.visitors30 ?? 0}</strong><small>clientes que viram sua loja</small></div>
        <div className="admin-tile"><strong>{store?.views30 ?? 0}</strong><small>visualizações de peças</small></div>
        <div className="admin-tile"><strong>{store?.whatsapp30 ?? 0}</strong><small>toques no WhatsApp</small></div>
        <div className="admin-tile"><strong>{store?.instagram30 ?? 0}</strong><small>toques no Instagram</small></div>
      </div>
    </section>

    <section className="card">
      <h2>Publicar nova peça</h2>
      {limit != null && activeCount >= limit
        ? <p role="alert">Você atingiu o limite de peças publicadas do pacote. Pause uma peça ou faça upgrade do pacote.</p>
        : <form action={addPartnerItem} encType="multipart/form-data" className="form">
            <label>Nome da peça<input name="name" required /></label>
            <label>Descrição<textarea name="description" rows={2} /></label>
            <label>Preço (R$)<input name="price" inputMode="decimal" placeholder="Ex.: 129,90" required /></label>
            <label>Desconto exclusivo Closet (%)<input name="discount" type="number" min="0" max="90" defaultValue={0} /></label>
            <label>Foto (necessária para usar a peça no Provador)<input name="photo" type="file" accept="image/*" /></label>
            <SubmitButton pendingText="Publicando...">Publicar peça</SubmitButton>
          </form>}
    </section>

    <section>
      <h2>Minhas peças</h2>
      {items.length === 0 && <p className="look-meta">Nenhuma peça cadastrada ainda.</p>}
      <div className="cards">
        {items.map((it: any) => {
          const st = stats.get(it.id);
          return <div className="card" key={it.id} style={it.active ? undefined : { opacity: 0.75 }}>
            {it.object_key && <img src={`/api/minha-vitrine/foto/${it.id}`} alt={it.name} style={{ width: "100%", borderRadius: 12 }} />}
            <h3>{it.name} {!it.active && <span className="chip">pausada</span>}</h3>
            {it.description && <p>{it.description}</p>}
            <p>{brl(it.price_cents)}{it.discount_percent > 0 && ` · ${it.discount_percent}% OFF → ${brl(Math.round(it.price_cents * (1 - it.discount_percent / 100)))}`}</p>
            <p className="look-meta">👁 {st?.views30 ?? 0} · 💬 {st?.clicks30 ?? 0} contato(s) nos últimos 30 dias · total {st?.views_total ?? 0} / {st?.clicks_total ?? 0}</p>
            <details>
              <summary>Editar peça</summary>
              <form action={updatePartnerItem} encType="multipart/form-data" className="form">
                <input type="hidden" name="item_id" value={it.id} />
                <label>Nome<input name="name" required defaultValue={it.name} /></label>
                <label>Descrição<textarea name="description" rows={2} defaultValue={it.description} /></label>
                <label>Preço (R$)<input name="price" inputMode="decimal" required defaultValue={(it.price_cents / 100).toFixed(2).replace(".", ",")} /></label>
                <label>Desconto (%)<input name="discount" type="number" min="0" max="90" defaultValue={it.discount_percent} /></label>
                <label>Trocar foto (opcional)<input name="photo" type="file" accept="image/*" /></label>
                <label className="checkbox"><input type="checkbox" name="active" defaultChecked={it.active} /> Visível na vitrine</label>
                <SubmitButton pendingText="Salvando...">Salvar alterações</SubmitButton>
              </form>
            </details>
            <div className="action-row">
              <form action={togglePartnerItem}>
                <input type="hidden" name="item_id" value={it.id} /><input type="hidden" name="activate" value={it.active ? "0" : "1"} />
                <SubmitButton className="link" pendingText="...">{it.active ? "Pausar (esgotou?)" : "Reativar na vitrine"}</SubmitButton>
              </form>
              <form action={removePartnerItem}><input type="hidden" name="item_id" value={it.id} /><SubmitButton className="link" pendingText="Removendo...">Remover</SubmitButton></form>
            </div>
          </div>;
        })}
      </div>
    </section>
  </main>;
}
