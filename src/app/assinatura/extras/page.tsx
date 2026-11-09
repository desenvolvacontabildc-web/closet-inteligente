import { redirect } from "next/navigation";
import Link from "next/link";
import { withProfile } from "@/server/profile-session";
import { startExtraPix, startCuideseCard, startCreditsPix } from "@/server/extras-actions";
import { reconcileExtraPix } from "@/server/billing-sync";
import { cuideseAccess, extraPricing, brl, EXTRA_NAME, type Extra } from "@/server/extras";
import SubmitButton from "@/components/submit-button";

const day = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "");

function PixPending({ p, product }: { p: any; product: Extra | "CREDITOS" }) {
  const valid = p && p.kind === "PIX" && p.status === "pending" && (!p.pix_expires_at || new Date(p.pix_expires_at) > new Date());
  if (!valid) return null;
  return <div className="card alert-card">
    <h2>Pix pendente: {EXTRA_NAME[product]} — {brl(p.amount_cents)}</h2>
    <p>Escaneie o QR code ou copie o código Pix no app do seu banco.{p.pix_expires_at && ` Expira em ${new Date(p.pix_expires_at).toLocaleString("pt-BR")}.`}</p>
    {p.pix_qr_code_base64 && <img src={`data:image/png;base64,${p.pix_qr_code_base64}`} alt="QR code Pix" style={{ maxWidth: 240, display: "block", margin: "12px 0" }} />}
    {p.pix_qr_code && <textarea readOnly defaultValue={p.pix_qr_code} rows={3} style={{ width: "100%", fontSize: 12 }} />}
    <p className="look-meta">Depois de pagar, a liberação é automática; pode levar até um minuto.</p>
    <a href="/assinatura/extras"><button className="link">Já paguei — atualizar esta página</button></a>
  </div>;
}

export default async function Extras({ searchParams }: { searchParams: Promise<{ error?: string; produto?: string; pagamento?: string }> }) {
  const sp = await searchParams;
  const data = await withProfile(async (c, userId) => {
    const pend = async (product: Extra | "CREDITOS") => {
      let p = (await c.query("SELECT * FROM extra_my_pending_charge($1,$2)", [userId, product])).rows[0] || null;
      if (await reconcileExtraPix(c, p)) p = (await c.query("SELECT * FROM extra_my_pending_charge($1,$2)", [userId, product])).rows[0] || null;
      return p;
    };
    const pendCu = await pend("CUIDESE"), pendCol = await pend("COLORIMETRIA"), pendCr = await pend("CREDITOS");
    const packs = (await c.query("SELECT * FROM list_credit_packs()")).rows as { id: string; label: string; price_cents: number; credits: number }[];
    const credits = Number((await c.query("SELECT bonus_image_credits n FROM profiles WHERE user_id=$1", [userId])).rows[0]?.n || 0);
    const cu = await cuideseAccess(c, userId);
    const colStatus = (await c.query("SELECT status, origin FROM my_module_status($1,'COLORIMETRIA')", [userId])).rows[0] || null;
    const priceCu = await extraPricing(c, "CUIDESE"), priceCol = await extraPricing(c, "COLORIMETRIA");
    const promoUsed = !!(await c.query("SELECT extra_card_promo_used($1,'CUIDESE') u", [userId])).rows[0]?.u;
    return { pendCu, pendCol, pendCr, packs, credits, cu, colStatus, priceCu, priceCol, promoUsed };
  });
  if (!data) redirect("/");
  const { pendCu, pendCol, pendCr, packs, credits, cu, colStatus, priceCu, priceCol, promoUsed } = data;

  const hasCol = !!colStatus && colStatus.status !== "NAO_ADQUIRIDA";
  const promo = priceCu.promo_price_cents != null && priceCu.promo_months > 0 && !promoUsed;
  const includedNow = cu.via === "ADMIN" || cu.via === "PLAN" || cu.via === "TRIAL";
  const cardPending = sp.pagamento === "cartao" && pendCu?.kind === "CARD_PREAPPROVAL" && pendCu.status === "pending";

  return <main className="shell narrow">
    <Link href="/assinatura">← Assinatura</Link>
    <span className="eyebrow">EXTRAS</span>
    <h1>Extras do Closet</h1>
    {sp.error && <p role="alert" className="trial-banner">{sp.error}</p>}
    <PixPending p={pendCu} product="CUIDESE" />
    <PixPending p={pendCol} product="COLORIMETRIA" />
    <PixPending p={pendCr} product="CREDITOS" />
    {cardPending && <div className="card alert-card"><h2>Confirmando sua assinatura...</h2>
      <p>Estamos aguardando a confirmação do Mercado Pago. Pode levar alguns segundos.</p>
      <a href="/assinatura/extras?pagamento=cartao"><button className="link">Atualizar esta página</button></a></div>}

    <section id="cuidese" className="card">
      <h2>Cuide-se</h2>
      <p>Skincare (rotina de manhã e de noite) e Cronograma Capilar, com diagnóstico, ingredientes certos para o seu caso e acompanhamento diário.</p>
      {includedNow && <p className="look-meta">
        {cu.via === "TRIAL" ? `Incluído no seu teste gratuito${cu.until ? ` (até ${day(cu.until)})` : ""}. Depois do teste, continua incluído nos planos Fashion e Super Star; no Arrumada é um extra de ${brl(priceCu.price_cents)} por mês.`
          : cu.via === "PLAN" ? "Incluído no seu plano." : "Acesso total da administradora."}
      </p>}
      {!includedNow && cu.access && <p className="look-meta">
        Extra ativo até <strong>{day(cu.until)}</strong> ({cu.method === "CARD" ? "cartão recorrente, renova sozinho" : "Pix, renove a cada 30 dias"}).
      </p>}
      {!includedNow && !cu.access && <p className="look-meta">{cu.until ? `Seu extra terminou em ${day(cu.until)}. ` : ""}Extra de <strong>{brl(priceCu.price_cents)}/mês</strong> para quem está no plano Arrumada. Está incluído nos planos Fashion e Super Star.</p>}
      {!includedNow && (!cu.access || cu.method !== "CARD") && <div className="action-row">
        <form action={startExtraPix}>
          <input type="hidden" name="product" value="CUIDESE" />
          <SubmitButton pendingText="Gerando Pix...">{cu.access ? `Renovar +30 dias no Pix (${brl(priceCu.price_cents)})` : `Pagar 30 dias no Pix (${brl(priceCu.price_cents)})`}</SubmitButton>
        </form>
        {!cu.access && <form action={startCuideseCard}>
          <SubmitButton pendingText="Abrindo pagamento...">{promo ? `Assinar no cartão (${brl(priceCu.promo_price_cents as number)}/mês)` : `Assinar no cartão (${brl(priceCu.price_cents)}/mês)`}</SubmitButton>
        </form>}
      </div>}
      {!includedNow && !cu.access && promo && <p className="look-meta">No cartão recorrente: {brl(priceCu.promo_price_cents as number)}/mês nos primeiros {priceCu.promo_months} meses, depois {brl(priceCu.price_cents)}/mês. Cancele quando quiser.</p>}
      {cu.access && <p><Link href="/cuidese">Abrir o Cuide-se</Link></p>}
    </section>

    <section id="colorimetria" className="card">
      <h2>Colorimetria pessoal</h2>
      <p>Descubra seu subtom e a paleta de cores que mais favorece você, cruzada com o que você já tem no closet. Pagamento único, sem mensalidade.</p>
      {hasCol ? <>
        <p className="look-meta">Liberada na sua conta.</p>
        <p><Link href="/colorimetria">Abrir a Colorimetria</Link></p>
      </> : <>
        <p className="look-meta"><strong>{brl(priceCol.price_cents)}</strong> uma única vez, via Pix.</p>
        <form action={startExtraPix}>
          <input type="hidden" name="product" value="COLORIMETRIA" />
          <SubmitButton pendingText="Gerando Pix...">Comprar por {brl(priceCol.price_cents)} no Pix</SubmitButton>
        </form>
      </>}
    </section>

    <section id="creditos" className="card">
      <h2>Créditos de imagem</h2>
      <p>Precisa de mais imagens este mês? Cada crédito gera <strong>um look em imagem</strong> ou <strong>uma foto de catálogo</strong> a mais.</p>
      <p className="look-meta"><strong>Seu saldo: {credits} crédito{credits === 1 ? "" : "s"}.</strong> Os créditos não expiram e só são usados depois que a cota mensal do seu plano acaba. A foto de catálogo automática (ao cadastrar uma peça) nunca gasta créditos; para usar crédito numa peça, toque em "Gerar de novo" na tela dela.</p>
      <div className="credit-packs">
        {packs.map((p) => <div key={p.id} className="credit-pack">
          <span className="hair-tag">{p.label}</span>
          <p className="credit-pack-price">{brl(p.price_cents)}</p>
          <p className="credit-pack-credits"><strong>{p.credits}</strong> créditos</p>
          <small>{brl(Math.round(p.price_cents / p.credits))} cada</small>
          <form action={startCreditsPix}>
            <input type="hidden" name="pack" value={p.id} />
            <SubmitButton pendingText="Gerando Pix...">Pagar no Pix</SubmitButton>
          </form>
        </div>)}
      </div>
    </section>
  </main>;
}
