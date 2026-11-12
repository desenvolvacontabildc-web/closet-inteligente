import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { createBazarPost } from "@/server/bazar-actions";
import SubmitButton from "@/components/submit-button";
import { BAZAR_CATEGORIES } from "@/components/bazar";

export default async function NovoAnuncio({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const pre = await withProfile(async (c, userId) => ({
    city: String((await c.query("SELECT city FROM profiles WHERE user_id=$1", [userId])).rows[0]?.city || ""),
    whatsapp: String((await c.query("SELECT bazar_last_whatsapp($1) w", [userId])).rows[0]?.w || ""),
  }));
  if (!pre) redirect("/");
  const kind = sp.f_kind === "BAZAR" ? "BAZAR" : "ALUGUEL";
  return <main className="shell narrow">
    <div className="top"><span className="eyebrow">NOVO ANÚNCIO</span><Link href="/bazar">← Bazar</Link></div>
    <h1>Anunciar uma peça</h1>
    <p className="look-meta">Fotografe a peça (ou o look inteiro), diga o valor e pronto: quem tiver interesse chama você direto no WhatsApp.</p>
    {sp.error && <p role="alert" className="trial-banner">{sp.error}</p>}
    <form action={createBazarPost} encType="multipart/form-data" className="form">
      <fieldset className="bazar-kind-pick">
        <legend>O que você quer fazer?</legend>
        <label><input type="radio" name="kind" value="ALUGUEL" defaultChecked={kind === "ALUGUEL"} /> Alugar a peça</label>
        <label><input type="radio" name="kind" value="BAZAR" defaultChecked={kind === "BAZAR"} /> Vender no bazar</label>
      </fieldset>
      <label>Fotos (de 1 a 4)<input type="file" name="photos" accept="image/*" multiple required /></label>
      <label>Nome da peça<input name="title" placeholder="Ex.: Vestido longo verde esmeralda" defaultValue={sp.f_title || ""} required maxLength={80} /></label>
      <label>Categoria
        <select name="category" defaultValue={sp.f_category || ""}>
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
      <label>Detalhes (opcional)<textarea name="description" rows={3} maxLength={600} placeholder="Estado da peça, marca, ocasião ideal, retirada/entrega, caução no aluguel…" defaultValue={sp.f_description || ""} /></label>
      <label>Cidade<input name="city" placeholder="Ex.: Recife - PE" defaultValue={sp.f_city || pre.city} maxLength={60} /></label>
      <label>Seu WhatsApp (com DDD)<input name="whatsapp" type="tel" inputMode="tel" placeholder="81 98888-7777" defaultValue={sp.f_whatsapp || pre.whatsapp} required /></label>
      <label className="check"><input type="checkbox" name="consent" required /> Concordo em compartilhar o meu WhatsApp com as usuárias que tocarem em “Chamar no WhatsApp” neste anúncio. Combino valores e pagamento direto com elas.</label>
      <SubmitButton pendingText="Publicando... (enviando as fotos)">Publicar anúncio</SubmitButton>
    </form>
  </main>;
}
