import Link from "next/link"; import { redirect } from "next/navigation"; import { withProfile } from "@/server/profile-session"; import { createLook, deleteLook, suggestLooks } from "@/server/look-actions";
const TRIAL_DAILY_LOOK_LIMIT = 2;
export default async function Looks(){
  const data=await withProfile(async(c,userId)=>{
    const items=(await c.query("SELECT id,name,category FROM closet_items WHERE status='ACTIVE' ORDER BY category,name")).rows;
    const looks=(await c.query(`SELECT l.id,l.name,l.occasion,l.status,l.created_at,
      (SELECT json_agg(json_build_object('id',ci.id,'name',ci.name,'category',ci.category) ORDER BY ci.category)
       FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS items
      FROM looks l ORDER BY l.created_at DESC`)).rows;
    const sub=(await c.query("SELECT * FROM my_subscription($1)",[userId])).rows[0];
    let remainingToday:number|null=null;
    if(sub?.status==="TRIAL"){
      const cnt=await c.query("SELECT count(*) n FROM looks WHERE created_at::date=current_date");
      remainingToday=Math.max(0,TRIAL_DAILY_LOOK_LIMIT-Number(cnt.rows[0].n));
    }
    return {items,looks,remainingToday};
  });
  if(!data)redirect("/");
  const {items,looks,remainingToday}=data;
  return <main className="shell">
    <div className="top"><span className="eyebrow">MEUS LOOKS</span><Link href="/home">Voltar</Link></div>
    <h1>Seus looks</h1>
    {remainingToday!==null&&<div className="trial-banner"><p>{remainingToday>0?`Você ainda pode criar ${remainingToday} look${remainingToday===1?"":"s"} hoje no teste gratuito.`:"Limite de looks do teste gratuito atingido por hoje. Assine para criar sem limite."}</p></div>}
    <div className="grid">
      {looks.map((l:any)=>(
        <div className="empty" key={l.id}>
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
      <button disabled={remainingToday===0}>Gerar sugestão com IA</button>
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
      <button disabled={remainingToday===0}>Salvar look</button>
    </form>
  </main>;
}
