import Link from "next/link"; import { redirect } from "next/navigation"; import { withProfile } from "@/server/profile-session"; import { createLook, deleteLook, suggestLooks } from "@/server/look-actions"; import { checkLookAllowance } from "@/server/limits";
export default async function Looks(){
  const data=await withProfile(async(c,userId)=>{
    const items=(await c.query("SELECT id,name,category FROM closet_items WHERE status='ACTIVE' ORDER BY category,name")).rows;
    const looks=(await c.query(`SELECT l.id,l.name,l.occasion,l.status,l.created_at,l.illustration_object_key IS NOT NULL AS has_illustration,
      (SELECT json_agg(json_build_object('id',ci.id,'name',ci.name,'category',ci.category) ORDER BY ci.category)
       FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS items
      FROM looks l ORDER BY l.created_at DESC`)).rows;
    const allowance=await checkLookAllowance(c,userId);
    return {items,looks,allowance};
  });
  if(!data)redirect("/");
  const {items,looks,allowance}=data;
  const remaining=allowance.remaining;
  return <main className="shell">
    <div className="top"><span className="eyebrow">MEUS LOOKS</span><Link href="/home">Voltar</Link></div>
    <h1>Seus looks</h1>
    {remaining!==null&&<div className="trial-banner"><p>{remaining>0?`Você ainda pode criar ${remaining} look${remaining===1?"":"s"} neste período.`:(allowance.message||"Limite de looks atingido neste período.")}</p></div>}
    <div className="grid">
      {looks.map((l:any)=>(
        <div className="empty" key={l.id}>
          {l.has_illustration&&<img src={`/api/looks/${l.id}/illustration`} alt={`Ilustração do look ${l.name||""}`} style={{maxWidth:"100%",borderRadius:12,marginBottom:8}}/>}
          <strong>{l.name||"Look sem nome"}</strong>
          <span>{l.occasion||"Ocasião não informada"} · {l.status}</span>
          <span>{(l.items||[]).map((it:any)=>it.name).join(" + ")||"Sem peças"}</span>
          <form action={deleteLook}><input type="hidden" name="id" value={l.id}/><button>Excluir</button></form>
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
