import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { reportBazarPost } from "@/server/bazar-actions";
import SubmitButton from "@/components/submit-button";
import { bazarPrice, BAZAR_KIND } from "@/components/bazar";

export default async function BazarPost({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const loaded = await withProfile(async (c, userId) => ({ post: (await c.query("SELECT * FROM bazar_get($1,$2)", [userId, id])).rows[0] || null }));
  if (!loaded) redirect("/");
  if (!loaded.post) notFound();
  const p = loaded.post as any;
  const available = p.status === "ACTIVE" && !p.hidden;
  return <main className="shell narrow">
    <div className="top"><span className="eyebrow">{BAZAR_KIND[p.kind].toUpperCase()}</span><Link href="/bazar">← Bazar</Link></div>
    {error && <p role="alert" className="trial-banner">{error}</p>}
    {p.photo_ids.length > 0 && <div className="bazar-gallery">
      {p.photo_ids.map((pid: string, i: number) => <a href={`/api/bazar/foto/${pid}`} target="_blank" rel="noopener noreferrer" key={pid}><img src={`/api/bazar/foto/${pid}?w=${i === 0 ? 640 : 200}`} alt={`${p.title} — foto ${i + 1}`} className={i === 0 ? "bazar-main" : "bazar-thumb"} /></a>)}
    </div>}
    {p.photo_ids.length > 0 && <p className="look-meta">Toque na foto para ampliar.</p>}
    <h1>{p.title}</h1>
    <p className="bazar-price">{bazarPrice(p.price_cents, p.price_unit)}</p>
    <p className="look-meta">{BAZAR_KIND[p.kind]}{p.category ? ` · ${p.category}` : ""}{p.size ? ` · Tamanho ${p.size}` : ""}{p.city ? ` · ${p.city}` : ""}</p>
    {p.description && <p>{p.description}</p>}
    <p className="look-meta">Anunciado por {p.owner_name}.</p>
    {p.mine
      ? <div className="card"><p>Este é o seu anúncio{p.hidden ? " (oculto pela administradora)" : p.status === "PAUSED" ? " (pausado)" : p.status === "CLOSED" ? " (encerrado)" : ""}.</p><Link href="/bazar/meus">Gerenciar meus anúncios</Link></div>
      : available
        ? <a href={`/api/bazar/contato?post=${p.id}`} target="_blank" rel="noopener noreferrer"><button type="button" className="bazar-cta">Chamar no WhatsApp</button></a>
        : <p className="trial-banner">Esta peça não está mais disponível.</p>}
    {!p.mine && <details className="more" style={{ marginTop: 16 }}>
      <summary>Denunciar este anúncio</summary>
      <form action={reportBazarPost} className="form">
        <input type="hidden" name="id" value={p.id} />
        <input name="reason" placeholder="O que há de errado? (opcional)" maxLength={300} />
        <SubmitButton pendingText="Enviando...">Enviar denúncia</SubmitButton>
      </form>
    </details>}
    <p className="look-meta" style={{ marginTop: 16 }}>Combine valores, retirada e pagamento direto com a anunciante. O Closet Inteligente apenas conecta vocês e não participa da negociação.</p>
  </main>;
}
