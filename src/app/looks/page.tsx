import Link from "next/link"; import { redirect } from "next/navigation"; import { withProfile } from "@/server/profile-session"; import { createLook, deleteLook, suggestLooks, uploadLookPhoto } from "@/server/look-actions"; import { checkLookAllowance } from "@/server/limits";
const STATUS_LABEL: Record<string, string> = { SUGGESTED: "Sugestão da IA", PHOTOGRAPHED: "Com foto e avaliação", APPROVED: "Aprovado", WORN: "Já usei", REJECTED: "Rejeitado", OUTDATED: "Desatualizado" };
export default async function Looks({searchParams}:{searchParams:Promise<{error?:string}>}){
  const {error}=await searchParams;
  const data=await withProfile(async(c,userId)=>{
    const items=(await c.query("SELECT id,name,category FROM closet_items WHERE status='ACTIVE' ORDER BY category,name")).rows;
    const looks=(await c.query(`SELECT l.id,l.name,l.occasion,l.status,l.created_at,l.illustration_object_key IS NOT NULL AS has_illustration,
      l.photo_object_key IS NOT NULL AS has_photo, l.photo_evaluation,
      (SELECT json_agg(json_build_object('id',ci.id,'name',ci.name,'category',ci.category) ORDER BY ci.category)
       FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS items
      FROM looks l WHERE l.kind NOT IN ('DAILY','TRIP') ORDER BY l.created_at DESC`)).rows;
    const allowance=await checkLookAllowance(c,userId);
    return {items,looks,allowance};
  });
  if(!data)redirect("/");
  const {items,looks,allowance}=data;
  const remaining=allowance.remaining;
  return <main className="shell">
    <div className="top"><span className="eyebrow">MEUS LOOKS</span><Link href="/home">Voltar</Link></div>
    <h1>Seus looks</h1>
    {error&&<p role="alert" className="trial-banner">{error}</p>}
    {remaining!==null&&<div className="trial-banner"><p>{remaining>0?`Você ainda pode criar ${remaining} look${remaining===1?"":"s"} neste período.`:(allowance.message||"Limite de looks atingido neste período.")}</p></div>}
    <div className="grid">
      {looks.map((l:any)=>(
        <div className="look-card" key={l.id}>
          {l.has_photo?<img src={`/api/looks/${l.id}/photo`} alt={`Foto real do look ${l.name||""}`}/>
            :l.has_illustration&&<img src={`/api/looks/${l.id}/illustration`} alt={`Ilustração do look ${l.name||""}`}/>}
          <h3>{l.name||"Look sem nome"}</h3>
          <p className="look-meta">{l.occasion||"Ocasião não informada"} · {STATUS_LABEL[l.status]||l.status}</p>
          <p className="look-pieces">{(l.items||[]).map((it:any)=>it.name).join(" + ")||"Sem peças"}</p>
          {l.photo_evaluation&&<p className="look-evaluation">💬 {l.photo_evaluation}</p>}
          <div className="look-actions">
            <form action={uploadLookPhoto} encType="multipart/form-data">
              <input type="hidden" name="look_id" value={l.id}/>
              <input type="file" name="photo" accept="image/*" required/>
              <button>{l.has_photo?"Avaliar de novo":"Avalie esse look"}</button>
            </form>
            <form action={deleteLook}><input type="hidden" name="id" value={l.id}/><button className="link">Excluir</button></form>
          </div>
        </div>
      ))}
    </div>
    <form action={suggestLooks} className="form">
      <h2>Pedir sugestão de looks</h2>
      <input name="request" placeholder='Ex.: "Preciso de 3 looks pra reuniões essa semana"' required/>
      <button disabled={remaining===0}>Gerar sugestão com IA</button>
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
      <button disabled={remaining===0}>Salvar look</button>
    </form>
  </main>;
}
