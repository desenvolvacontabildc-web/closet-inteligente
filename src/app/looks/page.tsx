import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { createLook, deleteLook, suggestLooks, uploadLookPhoto, generateLookIllustration, submitLookFeedback, restoreLook, markLookWorn, submitPostUseFeedback } from "@/server/look-actions";
import { generateWardrobeGaps } from "@/server/style-actions";
import { aiUsageRemaining, imageGenerationsRemaining } from "@/server/limits";
import SubmitButton from "@/components/submit-button";
import ConfirmButton from "@/components/confirm-button";

const STATUS_LABEL: Record<string, string> = { SUGGESTED: "Sugestão da IA", PHOTOGRAPHED: "Com foto e avaliação", APPROVED: "Aprovado", WORN: "Já usei", REJECTED: "Descartado", OUTDATED: "Desatualizado" };
const EVAL_LABEL: Record<string, string> = { veredito: "⭐ Opinião", caimento: "👗 Caimento", proporcao: "📐 Proporção", cores: "🎨 Cores", sugestao: "💡 Sugestão", quando_usar: "📅 Quando usar" };
const STYLE_LABEL: Record<string, string> = { REALISTA: "Fotografia realista", AVATAR: "Meu avatar", ILUSTRACAO: "Ilustração" };
const POST_USE_LABEL: Record<string, string> = { AMEI: "Amei", GOSTEI: "Gostei", MUDARIA: "Funcionou, mas mudaria algo", NAO_REPETIRIA: "Não repetiria" };
const TABS = [{ key: "todos", label: "Todos" }, { key: "usados", label: "Usados" }, { key: "descartados", label: "Descartados" }];

function parseEvaluation(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch { /* avaliações antigas eram texto simples, não JSON */ }
  return { avaliacao: raw };
}

type LookRow = any;
type Ctx = { returnPath: string; imgRemaining: number | null; defaultVisualStyle: string };

/** Imagem de capa do look: foto real > ilustração > colagem das fotos das peças > ícone. */
function Cover({ l }: { l: LookRow }) {
  if (l.has_photo) return <img src={`/api/looks/${l.id}/photo`} alt={`Foto do look ${l.name || ""}`} loading="lazy" />;
  if (l.has_illustration) return <img src={`/api/looks/${l.id}/illustration`} alt={`Imagem do look ${l.name || ""}`} loading="lazy" />;
  const withPhoto = (l.items || []).filter((it: any) => it.photo_id).slice(0, 4);
  if (withPhoto.length > 0) {
    return <div className={`cover-collage n${withPhoto.length}`}>{withPhoto.map((it: any) => <img key={it.id} src={`/api/closet/photos/${it.photo_id}`} alt={it.name} loading="lazy" />)}</div>;
  }
  return <span className="cover-empty">✨</span>;
}

/** Tudo sobre um look: peças, avaliação e ações. Fica recolhido dentro dos cards/fotos. */
function LookDetails({ l, ctx, mode }: { l: LookRow; ctx: Ctx; mode: "ready" | "pending" | "rejected" }) {
  const evaluation = parseEvaluation(l.photo_evaluation);
  const rp = <input type="hidden" name="return_path" value={ctx.returnPath} />;
  return <div className="look-details">
    <h3>{l.name || "Look sem nome"}</h3>
    <p className="look-meta">{l.occasion || "Ocasião não informada"} · {STATUS_LABEL[l.status] || l.status}</p>
    <p className="look-pieces">{(l.items || []).map((it: any) => it.name).join(" + ") || "Sem peças"}</p>

    {(l.items || []).length > 0 && <div className="outfit-collage">
      {(l.items || []).map((it: any) => (
        <div className="outfit-collage-item" key={it.id}>
          {it.photo_id ? <img src={`/api/closet/photos/${it.photo_id}`} alt={it.name} /> : <span className="outfit-collage-placeholder">👕</span>}
          <span>{it.name}</span>
        </div>
      ))}
    </div>}

    {evaluation && <div className="eval-grid">
      {Object.entries(evaluation).map(([key, text]) => text && (
        <div className="eval-card" key={key}><strong>{EVAL_LABEL[key] || "💬 Avaliação"}</strong><p>{text}</p></div>
      ))}
    </div>}

    {mode === "rejected" && <form action={restoreLook} className="action-row">
      <input type="hidden" name="look_id" value={l.id} />{rp}
      <SubmitButton pendingText="Restaurando...">Restaurar look</SubmitButton>
    </form>}

    {mode === "ready" && <>
      {l.status !== "WORN" && <form action={markLookWorn} className="action-row">
        <input type="hidden" name="look_id" value={l.id} />{rp}
        <SubmitButton pendingText="Salvando...">Usei esse look</SubmitButton>
      </form>}
      {l.status === "WORN" && <details className="more">
        <summary>Como você se sentiu com este look?</summary>
        <form action={submitPostUseFeedback} className="action-row">
          <input type="hidden" name="look_id" value={l.id} />{rp}
          {Object.entries(POST_USE_LABEL).map(([value, label]) => <button key={value} name="sentiment" value={value}>{label}</button>)}
        </form>
      </details>}
    </>}

    {mode !== "rejected" && <details className="more">
      <summary>Mais opções</summary>
      <form action={generateLookIllustration} className="stack">
        <input type="hidden" name="look_id" value={l.id} /><input type="hidden" name="return_path" value="/looks" />
        <label>Como você quer visualizar este look?
          <select name="visual_style" defaultValue={l.visual_style || ctx.defaultVisualStyle}>
            {Object.entries(STYLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <SubmitButton disabled={ctx.imgRemaining === 0} pendingText="Gerando imagem... (pode levar até 2 minutos)">🖼️ {l.has_illustration ? "Gerar imagem de novo" : "Gerar inspiração em imagem"}</SubmitButton>
        <p className="look-meta">{ctx.imgRemaining === 0 ? "⚠️ Seu limite de gerações de imagem deste mês acabou. Veja os planos em Perfil → Assinatura." : ctx.imgRemaining !== null ? `Usa 1 das suas ${ctx.imgRemaining} gerações de imagem restantes.` : "Gerações de imagem ilimitadas no seu plano."}</p>
      </form>
      <form action={uploadLookPhoto} encType="multipart/form-data" className="stack">
        <input type="hidden" name="look_id" value={l.id} />
        <label>{l.has_photo ? "Trocar a foto e avaliar de novo" : "Enviar uma foto minha usando este look"}<input type="file" name="photo" accept="image/*" required /></label>
        <SubmitButton pendingText="Avaliando...">{l.has_photo ? "Avaliar de novo" : "Avaliar com a minha foto"}</SubmitButton>
      </form>
    </details>}

    <form action={deleteLook} className="delete-row">
      <input type="hidden" name="id" value={l.id} /><input type="hidden" name="return_path" value={ctx.returnPath} />
      <ConfirmButton className="danger-btn" message={`Excluir o look "${l.name || "sem nome"}" para sempre? As peças do seu closet continuam guardadas, mas o look e as imagens dele serão apagados. Isso não pode ser desfeito.`}>🗑 Excluir look</ConfirmButton>
    </form>
  </div>;
}

export default async function Looks({ searchParams }: { searchParams: Promise<{ error?: string; filtro?: string }> }) {
  const { error, filtro: filtroRaw } = await searchParams;
  const filtro = ["usados", "descartados"].includes(filtroRaw || "") ? filtroRaw! : "todos";
  const data = await withProfile(async (c, userId) => {
    const items = (await c.query("SELECT id,name,category FROM closet_items WHERE status='ACTIVE' ORDER BY category,name")).rows;
    const looks = (await c.query(`SELECT l.id,l.name,l.occasion,l.status,l.created_at,l.illustration_object_key IS NOT NULL AS has_illustration,
      l.photo_object_key IS NOT NULL AS has_photo, l.photo_evaluation, l.visual_style,
      (SELECT json_agg(json_build_object(
          'id',ci.id,'name',ci.name,'category',ci.category,
          'photo_id',(SELECT p.id FROM closet_item_photos p WHERE p.item_id=ci.id ORDER BY p.created_at DESC LIMIT 1)
        ) ORDER BY ci.category)
       FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS items
      FROM looks l WHERE l.kind NOT IN ('DAILY','TRIP','ANALYSIS') ORDER BY l.created_at DESC`)).rows;
    const prof = (await c.query("SELECT default_visual_style, wardrobe_gap_sufficient, wardrobe_gap_reasoning, wardrobe_gap_suggestions, wardrobe_gap_updated_at FROM profiles WHERE user_id=$1", [userId])).rows[0];
    const aiRemaining = await aiUsageRemaining(c, userId);
    const imgRemaining = await imageGenerationsRemaining(c, userId);
    return { items, looks, aiRemaining, imgRemaining, defaultVisualStyle: prof?.default_visual_style || "ILUSTRACAO", wardrobeGap: prof };
  });
  if (!data) redirect("/");
  const { items, looks, aiRemaining, imgRemaining, defaultVisualStyle, wardrobeGap } = data;

  const ready = looks.filter((l: LookRow) => l.status === "APPROVED" || l.status === "WORN");
  const worn = looks.filter((l: LookRow) => l.status === "WORN");
  const pending = looks.filter((l: LookRow) => !["APPROVED", "WORN", "REJECTED"].includes(l.status));
  const rejected = looks.filter((l: LookRow) => l.status === "REJECTED");
  const ctx: Ctx = { returnPath: filtro === "todos" ? "/looks" : `/looks?filtro=${filtro}`, imgRemaining, defaultVisualStyle };

  const gallery = (list: LookRow[], emptyText: string) => list.length === 0
    ? <p className="empty-note">{emptyText}</p>
    : <div className="ready-grid">
        {list.map((l) => (
          <details className="ready-tile" key={l.id}>
            <summary aria-label={`${l.name || "Look"}: ver detalhes`} title={l.name || "Look"}>
              <span className="ready-cover"><Cover l={l} /></span>
              {l.status === "WORN" && <span className="ready-badge">usado</span>}
            </summary>
            <div className="ready-detail"><LookDetails l={l} ctx={ctx} mode="ready" /></div>
          </details>
        ))}
      </div>;

  return <main className="shell">
    <div className="top"><span className="eyebrow">MEUS LOOKS</span><Link href="/home">Voltar</Link></div>
    <h1>Seus looks</h1>
    {error && <p role="alert" className="trial-banner">{error}</p>}
    <p className="usage-line">🧠 {aiRemaining === null ? "IA ilimitada" : `${aiRemaining} operaç${aiRemaining === 1 ? "ão" : "ões"} de IA`} · 🖼️ {imgRemaining === null ? "imagens ilimitadas" : `${imgRemaining} imagem${imgRemaining === 1 ? "" : "ns"} este período`}</p>

    <div className="action-cards">
      <div className="card compact">
        <h2>📸 Analisar esse look</h2>
        <p className="look-meta">Envie uma foto sua usando um look e receba uma opinião sincera. Gostou? Salve como look pronto.</p>
        <Link href="/looks/analisar"><button>Analisar meu look</button></Link>
      </div>
      <form action={suggestLooks} className="card compact">
        <h2>✨ Pedir sugestão de looks</h2>
        <p className="look-meta">Monta combinações só com peças reais do seu closet, sem gastar imagem.</p>
        <input name="request" placeholder='Ex.: "3 looks pra reuniões essa semana"' required />
        <SubmitButton disabled={aiRemaining === 0} pendingText="Pensando... (até 20s)">Gerar sugestão com IA</SubmitButton>
        {aiRemaining === 0 && <p className="look-meta">⚠️ Seu limite de IA deste mês acabou. Veja os planos em Perfil → Assinatura.</p>}
      </form>
    </div>
    <details className="more diy">
      <summary>Ou monte você mesma</summary>
      <form action={createLook} className="form">
        <input name="name" placeholder="Nome do look (opcional)" />
        <input name="occasion" placeholder="Ocasião (opcional)" />
        <fieldset>
          <legend>Peças (marque as que compõem o look)</legend>
          {items.map((i: any) => <label key={i.id} className="checkbox"><input type="checkbox" name="items" value={i.id} /> {i.name} · {i.category}</label>)}
        </fieldset>
        <SubmitButton pendingText="Salvando...">Salvar look</SubmitButton>
      </form>
    </details>

    <nav className="tabs" aria-label="Filtrar looks">
      {TABS.map((t) => <Link key={t.key} href={t.key === "todos" ? "/looks" : `/looks?filtro=${t.key}`} className={filtro === t.key ? "active" : ""}>
        {t.label}{t.key === "descartados" && rejected.length > 0 ? ` (${rejected.length})` : ""}
      </Link>)}
    </nav>

    {filtro === "todos" && <>
      <section>
        <div className="section-head"><h2>Looks prontos</h2><span className="look-meta">{ready.length} {ready.length === 1 ? "look aprovado" : "looks aprovados"} · toque numa foto para ver os detalhes</span></div>
        {gallery(ready, "Nenhum look aprovado ainda. Toque em \"Gostei\" nas sugestões abaixo e eles aparecem aqui, só com as fotos.")}
      </section>

      {pending.length > 0 && <section>
        <div className="section-head"><h2>Para decidir</h2><span className="look-meta">Aprove o que gostou. O que não for pra você some da lista.</span></div>
        <div className="decide-list">
          {pending.map((l: LookRow) => (
            <article className="decide-card" key={l.id}>
              <div className="decide-cover"><Cover l={l} /></div>
              <div className="decide-body">
                <h3>{l.name || "Look sem nome"}</h3>
                <p className="look-meta">{l.occasion || "Ocasião não informada"}</p>
                <p className="look-pieces">{(l.items || []).map((it: any) => it.name).join(" + ") || "Sem peças"}</p>
                <div className="decide-actions">
                  <form action={submitLookFeedback}>
                    <input type="hidden" name="look_id" value={l.id} /><input type="hidden" name="kind" value="LIKE" /><input type="hidden" name="return_path" value={ctx.returnPath} />
                    <button className="approve">♡ Gostei</button>
                  </form>
                  <form action={submitLookFeedback}>
                    <input type="hidden" name="look_id" value={l.id} /><input type="hidden" name="kind" value="DISLIKE" /><input type="hidden" name="return_path" value={ctx.returnPath} />
                    <button className="reject">Não é pra mim</button>
                  </form>
                </div>
                <details className="more"><summary>Ver detalhes e mais opções</summary><LookDetails l={l} ctx={ctx} mode="pending" /></details>
              </div>
            </article>
          ))}
        </div>
      </section>}
    </>}

    {filtro === "usados" && <section>
      <div className="section-head"><h2>Looks usados</h2><span className="look-meta">Os que você marcou como "usei"</span></div>
      {gallery(worn, "Você ainda não marcou nenhum look como usado.")}
    </section>}

    {filtro === "descartados" && <section>
      <div className="section-head"><h2>Descartados</h2><span className="look-meta">Composições que você marcou como "não é pra mim". Dá para restaurar.</span></div>
      {rejected.length === 0 ? <p className="empty-note">Nada descartado.</p> : <div className="ready-grid">
        {rejected.map((l: LookRow) => (
          <details className="ready-tile dim" key={l.id}>
            <summary aria-label={`${l.name || "Look"}: ver detalhes`} title={l.name || "Look"}><span className="ready-cover"><Cover l={l} /></span></summary>
            <div className="ready-detail"><LookDetails l={l} ctx={ctx} mode="rejected" /></div>
          </details>
        ))}
      </div>}
    </section>}

    <div className="card">
      <h2>Peças coringa pra comprar</h2>
      {wardrobeGap?.wardrobe_gap_updated_at ? (
        wardrobeGap.wardrobe_gap_sufficient ? (
          <p className="look-meta">Você já tem peças coringa suficientes no closet. {wardrobeGap.wardrobe_gap_reasoning}</p>
        ) : (<>
          <p className="look-meta">{wardrobeGap.wardrobe_gap_reasoning}</p>
          <ul>
            {(wardrobeGap.wardrobe_gap_suggestions || []).map((s: any, idx: number) => (
              <li key={idx}><strong>{s.item}</strong> — {s.why}</li>
            ))}
          </ul>
        </>)
      ) : <p className="look-meta">Ainda não analisei seu closet pra isso.</p>}
      <form action={generateWardrobeGaps}>
        <input type="hidden" name="return_path" value="/looks" />
        <SubmitButton disabled={aiRemaining === 0} pendingText="Analisando seu closet...">{wardrobeGap?.wardrobe_gap_updated_at ? "Analisar de novo" : "Analisar meu closet"}</SubmitButton>
      </form>
      {aiRemaining === 0 && <p className="look-meta">⚠️ Seu limite de IA deste mês acabou. Veja os planos em Perfil → Assinatura.</p>}
    </div>
  </main>;
}
