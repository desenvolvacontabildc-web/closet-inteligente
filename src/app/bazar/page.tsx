import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { bazarPrice, BAZAR_KIND } from "@/components/bazar";

export default async function Bazar({ searchParams }: { searchParams: Promise<{ tipo?: string; q?: string; categoria?: string; error?: string }> }) {
  const { tipo, q, categoria, error } = await searchParams;
  const kind = tipo === "ALUGUEL" || tipo === "BAZAR" ? tipo : "";
  const data = await withProfile(async (c, userId) => {
    const posts = (await c.query("SELECT * FROM bazar_list($1,$2,$3,$4)", [userId, kind, q || "", categoria || ""])).rows;
    const categories = (await c.query("SELECT * FROM bazar_categories()")).rows.map((r: any) => String(r.bazar_categories));
    return { posts, categories };
  });
  if (!data) redirect("/");
  const { posts, categories } = data;
  const tab = (value: string, label: string) => {
    const p = new URLSearchParams(); if (value) p.set("tipo", value); if (q) p.set("q", q); if (categoria) p.set("categoria", categoria);
    return <Link key={label} href={`/bazar${p.toString() ? `?${p}` : ""}`} className={`bazar-tab${kind === value ? " active" : ""}`}>{label}</Link>;
  };
  return <main className="shell">
    <div className="top"><span className="eyebrow">BAZAR & ALUGUEL</span><Link href="/home">Voltar</Link></div>
    <section className="hero">
      <h1>Alugue ou garimpe peças de outras mulheres.</h1>
      <p>Aqui as usuárias do Closet anunciam looks e peças para <strong>alugar</strong> (para um evento, uma viagem…) ou para o <strong>bazar</strong> (venda). Toque em “Chamar no WhatsApp” e a conversa abre direto com a dona da peça.</p>
      <div className="action-row">
        <Link href="/bazar/novo"><button type="button">＋ Anunciar uma peça</button></Link>
        <Link href="/bazar/meus">Meus anúncios</Link>
      </div>
    </section>
    {error && <p role="alert" className="trial-banner">{error}</p>}
    <div className="bazar-tabs">{tab("", "Tudo")}{tab("ALUGUEL", "Aluguel")}{tab("BAZAR", "Bazar")}</div>
    <form className="filter-form" method="get">
      {kind && <input type="hidden" name="tipo" value={kind} />}
      <input name="q" placeholder="Buscar (vestido, festa, cidade…)" defaultValue={q || ""} />
      {categories.length > 0 && <select name="categoria" defaultValue={categoria || ""}>
        <option value="">Todas as categorias</option>
        {categories.map((c: string) => <option key={c} value={c}>{c}</option>)}
      </select>}
      <button>Buscar</button>
    </form>
    {posts.length === 0 && <p className="look-meta">Nenhum anúncio por aqui ainda. Seja a primeira: <Link href="/bazar/novo">anuncie uma peça</Link>.</p>}
    <div className="product-grid bazar-grid">
      {posts.map((p: any) => (
        <Link href={`/bazar/${p.id}`} className="card secondary find-card" key={p.id}>
          {p.photo_id ? <img src={`/api/bazar/foto/${p.photo_id}?w=480`} alt={p.title} loading="lazy" /> : <span className="cover-empty">✦</span>}
          <span className={`bazar-kind ${p.kind}`}>{BAZAR_KIND[p.kind]}</span>
          <h3>{p.title}</h3>
          <p><strong>{bazarPrice(p.price_cents, p.price_unit)}</strong>{p.size ? ` · Tam. ${p.size}` : ""}</p>
          <p className="look-meta">{p.owner_name}{p.city ? ` · ${p.city}` : ""}{p.mine ? " · seu anúncio" : ""}</p>
        </Link>
      ))}
    </div>
  </main>;
}
