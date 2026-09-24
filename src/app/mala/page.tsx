import Link from "next/link"; import { redirect } from "next/navigation"; import { withProfile } from "@/server/profile-session"; import { suggestTrip, deleteLook, generateLookIllustration } from "@/server/look-actions"; import { aiUsageRemaining, imageGenerationsRemaining } from "@/server/limits"; import SubmitButton from "@/components/submit-button";
export default async function Mala({searchParams}:{searchParams:Promise<{error?:string}>}){
  const {error}=await searchParams;
  const data=await withProfile(async(c,userId)=>{
    const looks=(await c.query(`SELECT l.id,l.name,l.occasion,l.trip_label,l.created_at,l.illustration_object_key IS NOT NULL AS has_illustration,
      (SELECT json_agg(json_build_object('id',ci.id,'name',ci.name,'category',ci.category) ORDER BY ci.category)
       FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS items
      FROM looks l WHERE l.kind='TRIP' ORDER BY l.trip_label,l.created_at`)).rows;
    const aiRemaining=await aiUsageRemaining(c,userId);
    const imgRemaining=await imageGenerationsRemaining(c,userId);
    return {looks,aiRemaining,imgRemaining};
  });
  if(!data)redirect("/");
  const {looks,aiRemaining,imgRemaining}=data;
  const trips=new Map<string,any[]>();
  for(const l of looks){const arr=trips.get(l.trip_label)||[];arr.push(l);trips.set(l.trip_label,arr)}
  return <main className="shell">
    <div className="top"><span className="eyebrow">MALA DE VIAGEM</span><Link href="/home">Voltar</Link></div>
    <h1>Sua mala inteligente</h1>
    <p>Diga o destino e quantos dias — a IA monta um look por dia usando só peças reais do seu closet, e a mala vira a lista de tudo que precisa levar.</p>
    {error&&<p role="alert" className="trial-banner">{error}</p>}
    <div className="trial-banner">
      <p>🧠 {aiRemaining===null?"Operações de IA ilimitadas no seu plano.":`${aiRemaining} operaç${aiRemaining===1?"ão":"ões"} de IA disponíve${aiRemaining===1?"l":"is"}.`}</p>
      <p>🖼️ {imgRemaining===null?"Gerações de imagem ilimitadas no seu plano.":`${imgRemaining} geraç${imgRemaining===1?"ão":"ões"} de imagem disponíve${imgRemaining===1?"l":"is"} este período.`}</p>
    </div>
    <form action={suggestTrip} className="form">
      <h2>Montar mala</h2>
      <input name="destino" placeholder="Destino (ex.: São Paulo)" required/>
      <input name="dias" type="number" min={1} max={7} placeholder="Quantos dias (máx. 7)" required/>
      <textarea name="observacoes" placeholder="Compromissos e clima (ex.: 1 reunião, 1 jantar, clima frio)"/>
      <SubmitButton disabled={aiRemaining===0} pendingText="Montando mala... (pode levar até 30s)">Gerar mala com IA</SubmitButton>
    </form>
    {[...trips.entries()].map(([label,tripLooks])=>{
      const allPieces=new Map<string,string>();
      for(const l of tripLooks)for(const it of (l.items||[]))allPieces.set(it.id,`${it.name} (${it.category})`);
      return <section className="card" key={label}>
        <h2>{label}</h2>
        <h3>Lista para levar</h3>
        <ul>{[...allPieces.values()].map((p:string)=><li key={p}>{p}</li>)}</ul>
        <h3>Look por dia</h3>
        <div className="grid">
          {tripLooks.map((l:any)=>(
            <div className="look-card" key={l.id}>
              {l.has_illustration?<img src={`/api/looks/${l.id}/illustration`} alt={`Ilustração de ${l.name||"look"}`}/>
                :<span className="look-thumb-placeholder">✨<small>Sem imagem ainda</small></span>}
              <h3>{l.name||"Look"}</h3>
              <p className="look-meta">{l.occasion||"Ocasião não informada"}</p>
              <p className="look-pieces">{(l.items||[]).map((it:any)=>it.name).join(" + ")}</p>
              <div className="look-actions">
                {!l.has_illustration&&<form action={generateLookIllustration}>
                  <input type="hidden" name="look_id" value={l.id}/>
                  <input type="hidden" name="return_path" value="/mala"/>
                  <SubmitButton disabled={imgRemaining===0} pendingText="Gerando imagem... (até 30s)">🖼️ Gerar inspiração em imagem</SubmitButton>
                </form>}
                <form action={deleteLook}><input type="hidden" name="id" value={l.id}/><button className="link">Excluir</button></form>
              </div>
            </div>
          ))}
        </div>
      </section>;
    })}
  </main>;
}
