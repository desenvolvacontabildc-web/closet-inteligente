import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { reviewCandidates, reviewReason } from "@/server/closet-review";
import { reviewItem, snoozeClosetReview } from "@/server/closet-review-actions";
import { generateLooksWithItem } from "@/server/look-actions";
import SubmitButton from "@/components/submit-button";
import ConfirmButton from "@/components/confirm-button";

const PAGE_SIZE = 6;

export default async function RevisaoCloset({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const data = await withProfile(async (c) => {
    const all = await reviewCandidates(c, 200);
    return { total: all.length, batch: all.slice(0, PAGE_SIZE) };
  });
  if (!data) redirect("/");
  const { total, batch } = data;

  return <main className="shell narrow">
    <div className="top"><span className="eyebrow">REVISÃO DO CLOSET</span><Link href="/closet">← Meu closet</Link></div>
    <h1>Faz sentido manter?</h1>
    <p className="look-meta">Peças que você usa pouco ou nunca usou. Para cada uma, escolha: montar looks com ela, manter, doar ou descartar. Doar e descartar só tiram a peça das sugestões, nada é apagado e dá para reativar na tela da peça.</p>
    {error && <p role="alert" className="trial-banner">{error}</p>}

    {batch.length === 0
      ? <div className="empty-note">Tudo revisado! Nenhuma peça pede atenção agora. Eu aviso de novo quando houver peças paradas.</div>
      : <>
          <p className="usage-line">{total} peça{total === 1 ? "" : "s"} para rever · mostrando {batch.length}</p>
          <div className="review-list">
            {batch.map((p) => (
              <article className="review-card" key={p.id}>
                <Link href={`/closet/${p.id}`} className="review-thumb" aria-label={`Abrir ${p.name}`}>
                  {p.photo_id ? <img src={`/api/closet/photos/${p.photo_id}`} alt={p.name} loading="lazy" /> : <span className="cover-empty">✦</span>}
                </Link>
                <div className="review-body">
                  <h3>{p.name}</h3>
                  <p className="look-meta">{p.category}{p.color ? ` · ${p.color}` : ""}</p>
                  <p className="review-reason">{reviewReason(p)}</p>
                  <div className="review-actions">
                    <form action={generateLooksWithItem}>
                      <input type="hidden" name="item_id" value={p.id} />
                      <SubmitButton pendingText="Montando 3 looks... (até 30s)">Montar looks com ela</SubmitButton>
                    </form>
                    <form action={reviewItem}>
                      <input type="hidden" name="item_id" value={p.id} /><input type="hidden" name="decision" value="KEEP" />
                      <button className="reject">Manter</button>
                    </form>
                    <form action={reviewItem}>
                      <input type="hidden" name="item_id" value={p.id} /><input type="hidden" name="decision" value="DONATE" />
                      <ConfirmButton className="reject" pendingText="Salvando..." message={`Marcar "${p.name}" como doada? Ela sai das sugestões de look (você pode reativar depois na tela da peça).`}>Doar</ConfirmButton>
                    </form>
                    <form action={reviewItem}>
                      <input type="hidden" name="item_id" value={p.id} /><input type="hidden" name="decision" value="DISCARD" />
                      <ConfirmButton className="reject" pendingText="Salvando..." message={`Marcar "${p.name}" como descartada? Ela sai das sugestões de look (você pode reativar depois na tela da peça).`}>Descartar</ConfirmButton>
                    </form>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>}

    <section className="card">
      <h2>Quando eu volto a perguntar</h2>
      <p className="look-meta">Peças que você mantém ficam 3 meses sem aparecer aqui. Na Home, o lembrete desta revisão volta a cada 30 dias, se ainda houver peças paradas.</p>
      <form action={snoozeClosetReview}>
        <input type="hidden" name="return_path" value="/closet" />
        <SubmitButton pendingText="Salvando...">Terminei por agora (lembrar em 30 dias)</SubmitButton>
      </form>
      <p className="look-meta">Liberou espaço no armário? Veja o que vale comprar em <Link href="/looks">Looks → Peças pra comprar</Link>.</p>
    </section>
  </main>;
}
