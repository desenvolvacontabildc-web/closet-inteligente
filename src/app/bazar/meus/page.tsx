import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { setBazarStatus, deleteBazarPost } from "@/server/bazar-actions";
import ConfirmButton from "@/components/confirm-button";
import { bazarPrice, BAZAR_KIND } from "@/components/bazar";

export default async function MeusAnuncios({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const posts = await withProfile(async (c, userId) => (await c.query("SELECT * FROM bazar_my_posts($1)", [userId])).rows);
  if (!posts) redirect("/");
  const label = (p: any) => p.hidden ? "Oculto pela administradora" : p.status === "ACTIVE" ? "No ar" : p.status === "PAUSED" ? "Pausado" : p.kind === "ALUGUEL" ? "Alugada / encerrado" : "Vendida / encerrado";
  return <main className="shell narrow">
    <div className="top"><span className="eyebrow">MEUS ANÚNCIOS</span><Link href="/bazar">← Bazar</Link></div>
    <h1>Meus anúncios</h1>
    {error && <p role="alert" className="trial-banner">{error}</p>}
    <div className="action-row"><Link href="/bazar/novo"><button type="button">＋ Novo anúncio</button></Link></div>
    {posts.length === 0 && <p className="look-meta">Você ainda não anunciou nada.</p>}
    {posts.map((p: any) => (
      <section className="card bazar-mine" key={p.id}>
        <div className="bazar-mine-row">
          {p.photo_id ? <img src={`/api/bazar/foto/${p.photo_id}?w=200`} alt={p.title} /> : <span className="cover-empty">✦</span>}
          <div>
            <h3><Link href={`/bazar/${p.id}`}>{p.title}</Link></h3>
            <p className="look-meta">{BAZAR_KIND[p.kind]} · {bazarPrice(p.price_cents, p.price_unit)}{p.size ? ` · Tam. ${p.size}` : ""}</p>
            <p className="look-meta"><strong>{label(p)}</strong> · {p.contacts} pessoa{p.contacts === 1 ? "" : "s"} chamou{p.contacts === 1 ? "" : "ram"} no WhatsApp</p>
          </div>
        </div>
        <div className="action-row">
          {p.status === "ACTIVE" && <form action={setBazarStatus}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value="PAUSED" /><button>Pausar</button></form>}
          {p.status !== "ACTIVE" && <form action={setBazarStatus}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value="ACTIVE" /><button>Reativar</button></form>}
          {p.status !== "CLOSED" && <form action={setBazarStatus}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value="CLOSED" /><button>{p.kind === "ALUGUEL" ? "Já aluguei" : "Já vendi"}</button></form>}
          <form action={deleteBazarPost}><input type="hidden" name="id" value={p.id} /><ConfirmButton className="link danger-link" pendingText="Excluindo..." message="Excluir este anúncio? Isso não pode ser desfeito.">Excluir</ConfirmButton></form>
        </div>
      </section>
    ))}
  </main>;
}
