import Link from "next/link"; import { redirect } from "next/navigation"; import { withProfile } from "@/server/profile-session"; import { createItem } from "@/server/closet-actions"; import SubmitButton from "@/components/submit-button"; import { reviewCandidates } from "@/server/closet-review";
import { standardizeProgress, isStandardizing } from "@/server/closet-standardize";
import { startStandardize } from "@/server/closet-standardize-actions";
export default async function Closet({searchParams}:{searchParams:Promise<{category?:string;color?:string;status?:string;error?:string;f_name?:string;f_category?:string;f_color?:string;f_description?:string}>}){
  const {category,color,status,error,f_name,f_category,f_color,f_description}=await searchParams;
  const data=await withProfile(async (c,userId)=>{
    const filters:string[]=[]; const params:string[]=[];
    if(category){params.push(category);filters.push(`category=$${params.length}`)}
    if(color){params.push(color);filters.push(`color=$${params.length}`)}
    if(status){params.push(status);filters.push(`status=$${params.length}`)}
    const where=filters.length?`WHERE ${filters.join(" AND ")}`:"";
    const items=(await c.query(`SELECT ci.id,ci.code,ci.name,ci.category,ci.color,ci.confidence,ci.status,ci.condition_notes,
      (SELECT p.id FROM closet_item_photos p WHERE p.item_id=ci.id ORDER BY p.created_at DESC LIMIT 1) AS photo_id
      FROM closet_items ci ${where.replace(/(category|color|status)=/g,"ci.$1=")} ORDER BY ci.created_at DESC`,params)).rows;
    const categories=(await c.query("SELECT DISTINCT category FROM closet_items ORDER BY category")).rows.map((r:any)=>r.category);
    const colors=(await c.query("SELECT DISTINCT color FROM closet_items WHERE color<>'' ORDER BY color")).rows.map((r:any)=>r.color);
    const forgotten=(await c.query("SELECT id,name,category FROM closet_items ci WHERE status='ACTIVE' AND NOT EXISTS (SELECT 1 FROM look_items li WHERE li.item_id=ci.id) ORDER BY created_at ASC LIMIT 6")).rows;
    const reviewCount=(await reviewCandidates(c,200)).length;
    const isAdmin=!!(await c.query("SELECT is_admin FROM app_users WHERE id=$1",[userId])).rows[0]?.is_admin;
    const std=isAdmin?await standardizeProgress(c):null;
    return {items,categories,colors,forgotten,reviewCount,std,standardizing:isStandardizing(userId)};
  });
  if(!data)redirect("/");
  const {items,categories,colors,forgotten,reviewCount,std,standardizing}=data;
  return <main className="shell">
    <div className="top"><span className="eyebrow">MEU CLOSET</span><Link href="/home">Voltar</Link></div>
    <h1>Suas peças</h1>
    {error&&<p role="alert" className="trial-banner">{error}</p>}
    {(forgotten.length>0||reviewCount>0)&&!category&&!color&&!status&&<div className="trial-banner">
      {forgotten.length>0&&<p>Peças esquecidas — ainda não entraram em nenhum look: {forgotten.map((i:any)=>i.name).join(", ")}. Toque numa peça e gere 3 looks com ela.</p>}
      {reviewCount>0&&<p style={forgotten.length>0?{marginTop:8}:undefined}>{reviewCount} peça{reviewCount===1?"":"s"} parada{reviewCount===1?"":"s"} pede{reviewCount===1?"":"m"} uma revisão: manter, doar ou descartar. <Link href="/closet/revisao">Revisar agora</Link></p>}
    </div>}
    <details className="add-panel" open={!!error||items.length===0}>
      <summary><span aria-hidden="true">＋</span> Adicionar peça</summary>
    <form action={createItem} encType="multipart/form-data" className="form">
      <input name="name" placeholder="Nome da peça" defaultValue={f_name||""} required/>
      <input name="category" placeholder="Categoria" defaultValue={f_category||""} required/>
      <input name="color" placeholder="Cor" defaultValue={f_color||""}/>
      <label>Foto real da peça (opcional, mas ajuda a IA a identificar)<input type="file" name="photo" accept="image/*"/></label>
      <textarea name="description" placeholder="Observações" defaultValue={f_description||""}/>
      <SubmitButton pendingText="Adicionando... (se enviou foto, a IA analisa em seguida, até 20s)">Adicionar ao closet</SubmitButton>
    </form>
    </details>
    {std&&<details className="add-panel" open={standardizing}>
      <summary><span aria-hidden="true">✦</span> Padronizar fotos das peças (administradora)</summary>
      <div className="std-panel">
        <p className="look-meta">Gera uma foto de catálogo de cada peça (só a peça, fundo marfim, mesma luz) a partir da foto original, que continua guardada. Hoje: <strong>{std.done} de {std.total}</strong> prontas{std.failed>0?`, ${std.failed} com falha`:""}.{standardizing?" Em andamento: atualize a página para ver o progresso.":""}</p>
        <div className="action-row">
          <form action={startStandardize}><input type="hidden" name="limit" value="3"/><SubmitButton disabled={standardizing} pendingText="Iniciando...">Testar com 3 peças</SubmitButton></form>
          <form action={startStandardize}><SubmitButton disabled={standardizing||std.done>=std.total} pendingText="Iniciando...">{`Padronizar as ${Math.max(0,std.total-std.done)} restantes`}</SubmitButton></form>
        </div>
        <p className="look-meta">Cada peça usa 1 geração de imagem (custo estimado de R$ 0,30 cada).</p>
      </div>
    </details>}
    <div className="section-head"><h2>Peças cadastradas</h2><span className="look-meta">{items.length} {items.length===1?"peça":"peças"}{(category||color||status)?" com este filtro":""}</span></div>
    <details className="more filter-panel" open={!!(category||color||status)}>
    <summary>Filtrar peças{(category||color||status)?" (filtro ativo)":""}</summary>
    <form className="filter-form">
      <label>Categoria
        <select name="category" defaultValue={category||""}>
          <option value="">Todas</option>
          {categories.map((c:string)=><option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label>Cor
        <select name="color" defaultValue={color||""}>
          <option value="">Todas</option>
          {colors.map((c:string)=><option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label>Status
        <select name="status" defaultValue={status||""}>
          <option value="">Todos</option>
          <option value="ACTIVE">Ativa</option>
          <option value="EVALUATION">Em avaliação</option>
          <option value="ALTERATION">Em ajuste</option>
          <option value="LOANED">Emprestada</option>
          <option value="DONATED">Doada</option>
          <option value="SOLD">Vendida</option>
          <option value="DISCARDED">Descartada</option>
        </select>
      </label>
      <button>Filtrar</button>
      {(category||color||status)&&<Link href="/closet">Limpar filtro</Link>}
    </form>
    </details>
    <div className="closet-grid">{items.map((i:any)=>(
      <Link className="closet-tile" href={`/closet/${i.id}`} key={i.id}>
        <span className="thumb">{i.photo_id?<img src={`/api/closet/photos/${i.photo_id}?w=480`} loading="lazy" decoding="async" alt={i.name}/>:"✦"}</span>
        <strong>{i.condition_notes&&"Atenção: "}{i.name}</strong>
        <span>{i.code} · {i.color||"cor a definir"}</span>
      </Link>
    ))}</div>
    {items.length===0&&<p>Nenhuma peça encontrada com esse filtro.</p>}
  </main>;
}
