import Link from "next/link"; import { redirect } from "next/navigation"; import { withProfile } from "@/server/profile-session"; import { createLook, deleteLook, suggestLooks, uploadLookPhoto, generateLookIllustration, submitLookFeedback, markLookWorn, submitPostUseFeedback } from "@/server/look-actions"; import { generateWardrobeGaps } from "@/server/style-actions"; import { aiUsageRemaining, imageGenerationsRemaining } from "@/server/limits"; import SubmitButton from "@/components/submit-button";
const STATUS_LABEL: Record<string, string> = { SUGGESTED: "Sugestão da IA", PHOTOGRAPHED: "Com foto e avaliação", APPROVED: "Aprovado", WORN: "Já usei", REJECTED: "Rejeitado", OUTDATED: "Desatualizado" };
const EVAL_LABEL: Record<string, string> = { caimento: "👗 Caimento", proporcao: "📐 Proporção", cores: "🎨 Cores", sugestao: "💡 Sugestão" };
const STYLE_LABEL: Record<string, string> = { REALISTA: "Fotografia realista", AVATAR: "Meu avatar", ILUSTRACAO: "Ilustração" };
const POST_USE_LABEL: Record<string, string> = { AMEI: "Amei", GOSTEI: "Gostei", MUDARIA: "Funcionou, mas mudaria algo", NAO_REPETIRIA: "Não repetiria" };
const TABS = [{ key: "todos", label: "Todos" }, { key: "aprovados", label: "Aprovados" }, { key: "usados", label: "Usados" }, { key: "favoritos", label: "Favoritos" }];
function parseEvaluation(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch { /* avaliações antigas eram texto simples, não JSON */ }
  return { avaliacao: raw };
}
export default async function Looks({searchParams}:{searchParams:Promise<{error?:string,filtro?:string}>}){
  const {error,filtro:filtroRaw}=await searchParams;
  const filtro=["aprovados","usados","favoritos"].includes(filtroRaw||"")?filtroRaw!:"todos";
  const data=await withProfile(async(c,userId)=>{
    const items=(await c.query("SELECT id,name,category FROM closet_items WHERE status='ACTIVE' ORDER BY category,name")).rows;
    const statusFilter=filtro==="aprovados"?"AND l.status='APPROVED'":filtro==="usados"?"AND l.status='WORN'":"";
    const favFilter=filtro==="favoritos"?"AND EXISTS (SELECT 1 FROM look_feedback lf WHERE lf.look_id=l.id AND lf.kind='LIKE')":"";
    const looks=(await c.query(`SELECT l.id,l.name,l.occasion,l.status,l.created_at,l.illustration_object_key IS NOT NULL AS has_illustration,
      l.photo_object_key IS NOT NULL AS has_photo, l.photo_evaluation, l.visual_style,
      (SELECT json_agg(json_build_object(
          'id',ci.id,'name',ci.name,'category',ci.category,
          'photo_id',(SELECT p.id FROM closet_item_photos p WHERE p.item_id=ci.id ORDER BY p.created_at DESC LIMIT 1)
        ) ORDER BY ci.category)
       FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS items,
      (SELECT lf.kind FROM look_feedback lf WHERE lf.look_id=l.id ORDER BY lf.created_at DESC LIMIT 1) AS last_feedback
      FROM looks l WHERE l.kind NOT IN ('DAILY','TRIP') ${statusFilter} ${favFilter} ORDER BY l.created_at DESC`)).rows;
    const prof=(await c.query("SELECT default_visual_style, wardrobe_gap_sufficient, wardrobe_gap_reasoning, wardrobe_gap_suggestions, wardrobe_gap_updated_at FROM profiles WHERE user_id=$1",[userId])).rows[0];
    const aiRemaining=await aiUsageRemaining(c,userId);
    const imgRemaining=await imageGenerationsRemaining(c,userId);
    return {items,looks,aiRemaining,imgRemaining,defaultVisualStyle:prof?.default_visual_style||"ILUSTRACAO",wardrobeGap:prof};
  });
  if(!data)redirect("/");
  const {items,looks,aiRemaining,imgRemaining,defaultVisualStyle,wardrobeGap}=data;
  return <main className="shell">
    <div className="top"><span className="eyebrow">MEUS LOOKS</span><Link href="/home">Voltar</Link></div>
    <h1>Seus looks</h1>
    {error&&<p role="alert" className="trial-banner">{error}</p>}
    <div className="trial-banner">
      <p>🧠 {aiRemaining===null?"Operações de IA ilimitadas no seu plano.":`${aiRemaining} operaç${aiRemaining===1?"ão":"ões"} de IA disponíve${aiRemaining===1?"l":"is"} (pedir sugestão, analisar peça, avaliar foto).`}</p>
      <p>🖼️ {imgRemaining===null?"Gerações de imagem ilimitadas no seu plano.":`${imgRemaining} geraç${imgRemaining===1?"ão":"ões"} de imagem disponíve${imgRemaining===1?"l":"is"} este período.`}</p>
    </div>
    <nav className="action-row">
      {TABS.map(t=><Link key={t.key} href={t.key==="todos"?"/looks":`/looks?filtro=${t.key}`} className={filtro===t.key?"active":""}>{t.label}</Link>)}
    </nav>
    <div className="grid">
      {looks.map((l:any)=>(
        <div className="look-card" key={l.id}>
          {l.has_photo?<img src={`/api/looks/${l.id}/photo`} alt={`Foto real do look ${l.name||""}`}/>
            :l.has_illustration?<img src={`/api/looks/${l.id}/illustration`} alt={`Ilustração do look ${l.name||""}`}/>
            :<span className="look-thumb-placeholder">✨<small>Sem imagem ainda</small></span>}
          <h3>{l.name||"Look sem nome"}</h3>
          <p className="look-meta">{l.occasion||"Ocasião não informada"} · {STATUS_LABEL[l.status]||l.status}</p>
          <p className="look-pieces">{(l.items||[]).map((it:any)=>it.name).join(" + ")||"Sem peças"}</p>
          {(l.items||[]).length>0&&<>
            <p className="look-meta">👗 Ver com minhas peças</p>
            <div className="outfit-collage">
              {(l.items||[]).map((it:any)=>(
                <div className="outfit-collage-item" key={it.id}>
                  {it.photo_id?<img src={`/api/closet/photos/${it.photo_id}`} alt={it.name}/>:<span className="outfit-collage-placeholder">👕</span>}
                  <span>{it.name}</span>
                </div>
              ))}
            </div>
          </>}
          {parseEvaluation(l.photo_evaluation) && (
            <div className="eval-grid">
              {Object.entries(parseEvaluation(l.photo_evaluation)!).map(([key, text]) => text && (
                <div className="eval-card" key={key}>
                  <strong>{EVAL_LABEL[key] || "💬 Avaliação"}</strong>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          )}
          {(l.has_illustration||l.has_photo)&&<div className="action-row">
            <form action={submitLookFeedback}>
              <input type="hidden" name="look_id" value={l.id}/><input type="hidden" name="kind" value="LIKE"/><input type="hidden" name="return_path" value={filtro==="todos"?"/looks":`/looks?filtro=${filtro}`}/>
              <button className={l.last_feedback==="LIKE"?"active":""}>♡ Gostei</button>
            </form>
            <form action={submitLookFeedback}>
              <input type="hidden" name="look_id" value={l.id}/><input type="hidden" name="kind" value="DISLIKE"/><input type="hidden" name="return_path" value={filtro==="todos"?"/looks":`/looks?filtro=${filtro}`}/>
              <button className={l.last_feedback==="DISLIKE"?"active":""}>Não é pra mim</button>
            </form>
          </div>}
          {l.status!=="WORN"&&<form action={markLookWorn} className="action-row">
            <input type="hidden" name="look_id" value={l.id}/><input type="hidden" name="return_path" value={filtro==="todos"?"/looks":`/looks?filtro=${filtro}`}/>
            <button className="link">Usei esse look</button>
          </form>}
          {l.status==="WORN"&&<details>
            <summary>Como você se sentiu com este look?</summary>
            <form action={submitPostUseFeedback} className="action-row">
              <input type="hidden" name="look_id" value={l.id}/><input type="hidden" name="return_path" value={filtro==="todos"?"/looks":`/looks?filtro=${filtro}`}/>
              {Object.entries(POST_USE_LABEL).map(([value,label])=>(
                <button key={value} name="sentiment" value={value}>{label}</button>
              ))}
            </form>
          </details>}
          <div className="look-actions">
            <form action={generateLookIllustration}>
              <input type="hidden" name="look_id" value={l.id}/>
              <input type="hidden" name="return_path" value="/looks"/>
              <label>Como você quer visualizar este look?
                <select name="visual_style" defaultValue={l.visual_style||defaultVisualStyle}>
                  {Object.entries(STYLE_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <SubmitButton disabled={imgRemaining===0} pendingText="Gerando imagem... (até 30s)">🖼️ {l.has_illustration?"Gerar de novo":"Gerar inspiração em imagem"}</SubmitButton>
            </form>
            <form action={uploadLookPhoto} encType="multipart/form-data">
              <input type="hidden" name="look_id" value={l.id}/>
              <input type="file" name="photo" accept="image/*" required/>
              <SubmitButton pendingText="Avaliando...">{l.has_photo?"Avaliar de novo":"Avalie esse look"}</SubmitButton>
            </form>
            <form action={deleteLook}><input type="hidden" name="id" value={l.id}/><button className="link">Excluir</button></form>
          </div>
        </div>
      ))}
    </div>
    <div className="card">
      <h2>Peças coringa pra comprar</h2>
      {wardrobeGap?.wardrobe_gap_updated_at?(
        wardrobeGap.wardrobe_gap_sufficient?(
          <p className="look-meta">Você já tem peças coringa suficientes no closet. {wardrobeGap.wardrobe_gap_reasoning}</p>
        ):(<>
          <p className="look-meta">{wardrobeGap.wardrobe_gap_reasoning}</p>
          <ul>
            {(wardrobeGap.wardrobe_gap_suggestions||[]).map((s:any,idx:number)=>(
              <li key={idx}><strong>{s.item}</strong> — {s.why}</li>
            ))}
          </ul>
        </>)
      ):<p className="look-meta">Ainda não analisei seu closet pra isso.</p>}
      <form action={generateWardrobeGaps}>
        <input type="hidden" name="return_path" value="/looks"/>
        <SubmitButton disabled={aiRemaining===0} pendingText="Analisando seu closet...">{wardrobeGap?.wardrobe_gap_updated_at?"Analisar de novo":"Analisar meu closet"}</SubmitButton>
      </form>
    </div>
    <form action={suggestLooks} className="form">
      <h2>Pedir sugestão de looks</h2>
      <input name="request" placeholder='Ex.: "Preciso de 3 looks pra reuniões essa semana"' required/>
      <SubmitButton disabled={aiRemaining===0} pendingText="Pensando... (pode levar até 20s)">Gerar sugestão com IA</SubmitButton>
    </form>
    <form action={createLook} className="form">
      <h2>Ou monte você mesma</h2>
      <input name="name" placeholder="Nome do look (opcional)"/>
      <input name="occasion" placeholder="Ocasião (opcional)"/>
      <fieldset>
        <legend>Peças (marque as que compõem o look)</legend>
        {items.map((i:any)=>(
          <label key={i.id} className="checkbox"><input type="checkbox" name="items" value={i.id}/> {i.name} · {i.category}</label>
        ))}
      </fieldset>
      <button>Salvar look</button>
    </form>
  </main>;
}
