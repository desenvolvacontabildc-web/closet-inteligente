import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { updateBazarPost } from "@/server/bazar-actions";
import SubmitButton from "@/components/submit-button";
import { BAZAR_CATEGORIES } from "@/components/bazar";

export default async function EditarAnuncio({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await withProfile(async (c, userId) => ({
    post: (await c.query("SELECT * FROM bazar_get($1,$2)", [userId, id])).rows[0] || null,
    whatsapp: String((await c.query("SELECT bazar_post_whatsapp($1,$2) w", [userId, id])).rows[0]?.w || ""),
  }));
  if (!data) redirect("/");
  const p = data.post as any;
  if (!p || !p.mine) notFound();
  const price = (p.price_cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");
  const categories = BAZAR_CATEGORIES.includes(p.category) || !p.category ? BAZAR_CATEGORIES : [p.category, ...BAZAR_CATEGORIES];
  return <main className="shell narrow">
    <div className="top"><span className="eyebrow">EDITAR ANÚNCIO</span><Link href="/bazar/meus">← Meus anúncios</Link></div>
    <h1>Editar anúncio</h1>
    {error && <p role="alert" className="trial-banner">{error}</p>}
    <form action={updateBazarPost} encType="multipart/form-data" className="form">
      <input type="hidden" name="id" value={p.id} />
      <fieldset className="bazar-kind-pick">
        <legend>Tipo</legend>
        <label><input type="radio" name="kind" value="ALUGUEL" defaultChecked={p.kind === "ALUGUEL"} /> Alugar a peça</label>
        <label><input type="radio" name="kind" value="BAZAR" defaultChecked={p.kind === "BAZAR"} /> Vender no bazar</label>
      </fieldset>
      {p.photo_ids.length > 0 && <div>
        <p className="look-meta">Fotos atuais (marque para remover):</p>
        <div className="bazar-piece-photos">
          {p.photo_ids.map((pid: string) => <label className="bazar-piece-photo" key={pid}>
            <img src={`/api/bazar/foto/${pid}?w=200`} alt="Foto do anúncio" />
            <span><input type="checkbox" name="remove_photo" value={pid} /> Remover</span>
          </label>)}
        </div>
      </div>}
      <label>Adicionar fotos (até 4 no total)<input type="file" name="photos" accept="image/*" multiple /></label>
      <label>Nome da peça<input name="title" defaultValue={p.title} required maxLength={80} /></label>
      <label>Categoria
        <select name="category" defaultValue={p.category || ""}>
          <option value="">Escolha…</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label>Tamanho<input name="size" defaultValue={p.size || ""} maxLength={20} /></label>
      <div className="bazar-price-row">
        <label>Valor (R$)<input name="price" inputMode="decimal" defaultValue={price} required /></label>
        <label>Cobrado por <small>(só no aluguel)</small>
          <select name="price_unit" defaultValue={p.price_unit === "DIA" ? "DIA" : "EVENTO"}>
            <option value="EVENTO">evento</option>
            <option value="DIA">dia</option>
          </select>
        </label>
      </div>
      <label>Detalhes<textarea name="description" rows={3} maxLength={600} defaultValue={p.description || ""} /></label>
      <label>Cidade<input name="city" defaultValue={p.city || ""} maxLength={60} /></label>
      <label>Seu WhatsApp (com DDD)<input name="whatsapp" type="tel" inputMode="tel" defaultValue={data.whatsapp.replace(/^55/, "")} required /></label>
      <SubmitButton pendingText="Salvando... (enviando as fotos)">Salvar alterações</SubmitButton>
    </form>
  </main>;
}
