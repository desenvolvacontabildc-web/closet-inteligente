import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { createBazarPost } from "@/server/bazar-actions";
import SubmitButton from "@/components/submit-button";
import { BAZAR_CATEGORIES, guessBazarCategory } from "@/components/bazar";

export default async function NovoAnuncio({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const UUID_RE = /^[0-9a-f-]{36}$/i;
  const pecaId = sp.peca || sp.f_item_id || "";
  const pre = await withProfile(async (c, userId) => ({
    city: String((await c.query("SELECT city FROM profiles WHERE user_id=$1", [userId])).rows[0]?.city || ""),
    whatsapp: String((await c.query("SELECT bazar_last_whatsapp($1) w", [userId])).rows[0]?.w || ""),
    can: (await c.query("SELECT * FROM bazar_can_post($1)", [userId])).rows[0] as { ok: boolean; msg: string; used: number; max_posts: number },
    piece: UUID_RE.test(pecaId) ? ((await c.query(
      `SELECT ci.id, ci.name, ci.category, ci.description, ci.status, (ci.standard_object_key IS NOT NULL) AS has_std,
              (SELECT p.id FROM closet_item_photos p WHERE p.item_id = ci.id ORDER BY p.created_at DESC LIMIT 1) AS photo_id
       FROM closet_items ci WHERE ci.id = $1 AND ci.user_id = $2`, [pecaId, userId])).rows[0] as { id: string; name: string; category: string; description: string; status: string; has_std: boolean; photo_id: string | null } | undefined) || null : null,
  }));
  if (!pre) redirect("/");
  const piece = pre.piece;
  if (!pre.can.ok) return <main className="shell narrow">
    <div className="top"><span className="eyebrow">NOVO ANÚNCIO</span><Link href="/bazar">← Bazar</Link></div>
    <h1>Anunciar uma peça</h1>
    <div className="card">
      <p>{pre.can.msg}</p>
      <div className="action-row">
        {pre.can.used >= pre.can.max_posts ? <Link href="/bazar/meus"><button type="button">Ver meus anúncios</button></Link> : null}
        <Link href="/assinatura"><button type="button">Ver planos</button></Link>
      </div>
    </div>
    <p className="look-meta">Navegar pelo Bazar e chamar quem anuncia continua liberado para todas.</p>
  </main>;
  const kind = sp.f_kind === "BAZAR" || (!sp.f_kind && piece) ? "BAZAR" : "ALUGUEL";
  return <main className="shell narrow">
    <div className="top"><span className="eyebrow">NOVO ANÚNCIO</span><Link href="/bazar">← Bazar</Link></div>
    <h1>Anunciar uma peça</h1>
    <p className="look-meta">Fotografe a peça (ou o look inteiro), diga o valor e pronto: quem tiver interesse chama você direto no WhatsApp. Anúncios abertos: {pre.can.used} de {pre.can.max_posts}.</p>
    {sp.error && <p role="alert" className="trial-banner">{sp.error}</p>}
    <form action={createBazarPost} encType="multipart/form-data" className="form">
      <fieldset className="bazar-kind-pick">
        <legend>O que você quer fazer?</legend>
        <label><input type="radio" name="kind" value="ALUGUEL" defaultChecked={kind === "ALUGUEL"} /> Alugar a peça</label>
        <label><input type="radio" name="kind" value="BAZAR" defaultChecked={kind === "BAZAR"} /> Vender no bazar</label>
      </fieldset>
      {piece && <input type="hidden" name="item_id" value={piece.id} />}
      {piece && <div className="card compact">
        <p><strong>Peça do seu closet:</strong> {piece.name}</p>
        {piece.photo_id ? <>
          <p className="look-meta">Escolha as fotos dela que quer usar no anúncio (você também pode enviar outras abaixo):</p>
          <div className="bazar-piece-photos">
            {piece.has_std && <label className="bazar-piece-photo"><img src={`/api/closet/photos/${piece.photo_id}?w=200`} alt="Foto de catálogo" /><span><input type="checkbox" name="use_std" defaultChecked /> Foto de catálogo</span></label>}
            <label className="bazar-piece-photo"><img src={`/api/closet/photos/${piece.photo_id}?orig=1&w=200`} alt="Foto original" /><span><input type="checkbox" name="use_orig" defaultChecked={!piece.has_std} /> Foto original</span></label>
          </div>
        </> : <p className="look-meta">Esta peça ainda não tem foto: envie as fotos abaixo.</p>}
        {piece.status === "ACTIVE" && <p className="look-meta">Quando você marcar “Já vendi” no anúncio de bazar, a peça fica como <strong>Vendida</strong> no seu closet.</p>}
      </div>}
      <label>{piece ? "Outras fotos (opcional)" : "Fotos (de 1 a 4)"}<input type="file" name="photos" accept="image/*" multiple required={!piece || !piece.photo_id} /></label>
      <label>Nome da peça<input name="title" placeholder="Ex.: Vestido longo verde esmeralda" defaultValue={sp.f_title || piece?.name || ""} required maxLength={80} /></label>
      <label>Categoria
        <select name="category" defaultValue={sp.f_category || (piece ? guessBazarCategory(piece.category) : "")}>
          <option value="">Escolha…</option>
          {BAZAR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label>Tamanho<input name="size" placeholder="Ex.: M, 38, 42" defaultValue={sp.f_size || ""} maxLength={20} /></label>
      <div className="bazar-price-row">
        <label>Valor (R$)<input name="price" inputMode="decimal" placeholder="Ex.: 80 ou 79,90" defaultValue={sp.f_price || ""} required /></label>
        <label>Cobrado por <small>(só no aluguel)</small>
          <select name="price_unit" defaultValue={sp.f_price_unit || "EVENTO"}>
            <option value="EVENTO">evento</option>
            <option value="DIA">dia</option>
          </select>
        </label>
      </div>
      <label>Detalhes (opcional)<textarea name="description" rows={3} maxLength={600} placeholder="Estado da peça, marca, ocasião ideal, retirada/entrega, caução no aluguel…" defaultValue={sp.f_description || piece?.description || ""} /></label>
      <label>Cidade<input name="city" placeholder="Ex.: Recife - PE" defaultValue={sp.f_city || pre.city} maxLength={60} /></label>
      <label>Seu WhatsApp (com DDD)<input name="whatsapp" type="tel" inputMode="tel" placeholder="81 98888-7777" defaultValue={sp.f_whatsapp || pre.whatsapp} required /></label>
      <label className="check"><input type="checkbox" name="consent" required /> Concordo em compartilhar o meu WhatsApp com as usuárias que tocarem em “Chamar no WhatsApp” neste anúncio. Combino valores e pagamento direto com elas.</label>
      <SubmitButton pendingText="Publicando... (enviando as fotos)">Publicar anúncio</SubmitButton>
    </form>
  </main>;
}
