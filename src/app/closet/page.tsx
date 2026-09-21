import Link from "next/link"; import { redirect } from "next/navigation"; import { withProfile } from "@/server/profile-session"; import { createItem } from "@/server/closet-actions";
export default async function Closet({searchParams}:{searchParams:Promise<{category?:string;color?:string;status?:string}>}){
  const {category,color,status}=await searchParams;
  const data=await withProfile(async c=>{
    const filters:string[]=[]; const params:string[]=[];
    if(category){params.push(category);filters.push(`category=$${params.length}`)}
    if(color){params.push(color);filters.push(`color=$${params.length}`)}
    if(status){params.push(status);filters.push(`status=$${params.length}`)}
    const where=filters.length?`WHERE ${filters.join(" AND ")}`:"";
    const items=(await c.query(`SELECT id,code,name,category,color,confidence,status,condition_notes FROM closet_items ${where} ORDER BY created_at DESC`,params)).rows;
    const categories=(await c.query("SELECT DISTINCT category FROM closet_items ORDER BY category")).rows.map((r:any)=>r.category);
    const colors=(await c.query("SELECT DISTINCT color FROM closet_items WHERE color<>'' ORDER BY color")).rows.map((r:any)=>r.color);
    const forgotten=(await c.query("SELECT id,name,category FROM closet_items ci WHERE status='ACTIVE' AND NOT EXISTS (SELECT 1 FROM look_items li WHERE li.item_id=ci.id) ORDER BY created_at ASC LIMIT 6")).rows;
    return {items,categories,colors,forgotten};
  });
  if(!data)redirect("/");
  const {items,categories,colors,forgotten}=data;
  return <main className="shell">
    <div className="top"><span className="eyebrow">MEU CLOSET</span><Link href="/home">Voltar</Link></div>
    <h1>Suas peças</h1>
    {forgotten.length>0&&!category&&!color&&!status&&<div className="trial-banner">
      <p>Peças esquecidas — ainda não entraram em nenhum look: {forgotten.map((i:any)=>i.name).join(", ")}. <Link href="/looks">Que tal montar um look com elas?</Link></p>
    </div>}
    <form className="form" style={{display:"flex",flexDirection:"row",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
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
    <div className="grid">{items.map((i:any)=><Link className="empty" href={`/closet/${i.id}`} key={i.id}><strong>{i.condition_notes&&"⚠️ "}{i.name}</strong><span>{i.code} · {i.category}</span><span>{i.color||"Cor a definir"} · {i.confidence}</span></Link>)}</div>
    {items.length===0&&<p>Nenhuma peça encontrada com esse filtro.</p>}
    <form action={createItem} className="form"><h2>Adicionar peça</h2><input name="name" placeholder="Nome da peça" required/><input name="category" placeholder="Categoria" required/><input name="color" placeholder="Cor"/><input name="photo_url" placeholder="Referência da foto (opcional)"/><textarea name="description" placeholder="Observações"/><button>Adicionar ao closet</button></form>
  </main>;
}
