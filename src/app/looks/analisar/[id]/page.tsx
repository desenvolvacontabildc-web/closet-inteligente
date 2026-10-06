import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { saveAnalyzedLook, discardAnalyzedLook } from "@/server/look-analysis-actions";
import SubmitButton from "@/components/submit-button";

const EVAL_LABEL: Record<string, string> = { caimento: "👗 Caimento", proporcao: "📐 Proporção", cores: "🎨 Cores", sugestao: "💡 O que eu mudaria", quando_usar: "📅 Quando usar" };

export default async function AnaliseResultado({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await withProfile(async (c) => {
    const look = (await c.query("SELECT id, name, occasion, photo_evaluation, described_pieces FROM looks WHERE id=$1 AND kind='ANALYSIS'", [id])).rows[0];
    if (!look) return null;
    const ids = (look.described_pieces || []).map((p: any) => p.closet_item_id).filter(Boolean);
    const matched = ids.length
      ? (await c.query(
        `SELECT ci.id, ci.name, ci.category, (SELECT p.id FROM closet_item_photos p WHERE p.item_id=ci.id ORDER BY p.created_at DESC LIMIT 1) AS photo_id
         FROM closet_items ci WHERE ci.id = ANY($1::uuid[])`, [ids])).rows
      : [];
    return { look, matched };
  });
  if (!data) redirect("/looks/analisar");
  const { look, matched } = data;
  let evaluation: Record<string, string> = {};
  try { evaluation = JSON.parse(look.photo_evaluation || "{}"); } catch { /* sem avaliação legível */ }
  const pieces: { descricao: string; closet_item_id: string | null }[] = look.described_pieces || [];
  const matchedById = new Map<string, any>(matched.map((m: any) => [m.id, m]));

  return <main className="shell narrow">
    <div className="top"><span className="eyebrow">ANÁLISE DO LOOK</span><Link href="/looks/analisar">Analisar outro</Link></div>
    <h1>{look.name || "Seu look"}</h1>
    <img src={`/api/looks/${look.id}/photo`} alt="Foto do seu look" style={{ maxWidth: "100%", maxHeight: 460, borderRadius: 16, display: "block", margin: "8px 0" }} />
    {look.occasion && <p className="look-meta">Ocasião: {look.occasion}</p>}

    {evaluation.veredito && <div className="card"><h2>⭐ Minha opinião</h2><p>{evaluation.veredito}</p></div>}
    <div className="eval-grid">
      {Object.entries(EVAL_LABEL).map(([key, label]) => evaluation[key] ? (
        <div className="eval-card" key={key}><strong>{label}</strong><p>{evaluation[key]}</p></div>
      ) : null)}
    </div>

    {pieces.length > 0 && <div className="card">
      <h2>Peças que eu vi no look</h2>
      <ul>
        {pieces.map((p, i) => {
          const m = p.closet_item_id ? matchedById.get(p.closet_item_id) : null;
          return <li key={i}>{p.descricao}{m && <span className="match-badge">no seu closet: {m.name}</span>}</li>;
        })}
      </ul>
    </div>}

    <form action={saveAnalyzedLook} className="card form">
      <h2>Salvar como look pronto</h2>
      <p className="look-meta">Fica guardado em Meus looks, com a sua foto e esta análise, para você repetir em outras ocasiões.</p>
      <input type="hidden" name="look_id" value={look.id} />
      <label>Nome do look<input name="name" defaultValue={look.name} placeholder="Ex.: Blazer off-white + jeans" required /></label>
      <label>Ocasião<input name="occasion" defaultValue={look.occasion} placeholder="Ex.: reunião, jantar..." /></label>
      {matched.length > 0 && <fieldset>
        <legend>Ligar às peças do seu closet</legend>
        {matched.map((m: any) => (
          <label key={m.id} className="checkbox"><input type="checkbox" name="items" value={m.id} defaultChecked /> {m.name} · {m.category}</label>
        ))}
      </fieldset>}
      <SubmitButton pendingText="Salvando...">💾 Salvar look</SubmitButton>
    </form>

    <form action={discardAnalyzedLook}>
      <input type="hidden" name="look_id" value={look.id} />
      <SubmitButton className="link" pendingText="Descartando...">Descartar esta análise</SubmitButton>
    </form>
  </main>;
}
