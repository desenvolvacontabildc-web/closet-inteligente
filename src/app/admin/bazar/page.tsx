import { adminListBazar, adminSetBazarHidden } from "@/server/bazar-actions";
import { bazarPrice, BAZAR_KIND } from "@/components/bazar";
import SubmitButton from "@/components/submit-button";

export default async function AdminBazar() {
  const posts = await adminListBazar();
  if (!posts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/admin">← Gerenciamento</a></main>;
  return <main className="shell narrow">
    <a href="/admin">← Gerenciamento</a>
    <h1>Bazar & Aluguel</h1>
    <p className="look-meta">Anúncios das usuárias. Os mais denunciados aparecem primeiro; com 3 denúncias o anúncio some sozinho até você revisar. Ocultar não apaga: dá para liberar de novo.</p>
    {posts.length === 0 && <p>Nenhum anúncio ainda.</p>}
    {posts.map((p: any) => (
      <section className={p.reports > 0 ? "card alert-card" : "card"} key={p.id}>
        <div className="bazar-mine-row">
          {p.photo_id ? <img src={`/api/bazar/foto/${p.photo_id}?w=200`} alt={p.title} /> : <span className="cover-empty">✦</span>}
          <div>
            <h3>{p.title}</h3>
            <p className="look-meta">{BAZAR_KIND[p.kind]} · {bazarPrice(p.price_cents, p.price_unit)} · {p.status === "ACTIVE" ? "no ar" : p.status === "PAUSED" ? "pausado" : "encerrado"}{p.hidden ? " · OCULTO" : ""}</p>
            <p className="look-meta">{p.owner_name} ({p.owner_email}) · {p.contacts} contato{p.contacts === 1 ? "" : "s"} · {p.reports} denúncia{p.reports === 1 ? "" : "s"}</p>
            <p className="look-meta"><a href={`/bazar/${p.id}`}>Ver anúncio</a> · <a href={`/admin/usuarias/${p.owner_id}`}>Ficha da usuária</a></p>
          </div>
        </div>
        <form action={adminSetBazarHidden}>
          <input type="hidden" name="id" value={p.id} /><input type="hidden" name="hidden" value={p.hidden ? "0" : "1"} />
          <SubmitButton pendingText="Salvando...">{p.hidden ? "Liberar anúncio" : "Ocultar anúncio"}</SubmitButton>
        </form>
      </section>
    ))}
  </main>;
}
