import { redirect } from "next/navigation"; import { withProfile } from "@/server/profile-session"; import { generateCapsule } from "@/server/capsule-actions"; import { mySubscription, hasPlanAtLeast } from "@/server/limits"; import SubmitButton from "@/components/submit-button";
export default async function Capsula({searchParams}:{searchParams:Promise<{error?:string}>}){
  const {error}=await searchParams;
  const data=await withProfile(async(c,userId)=>{
    const sub=await mySubscription(c,userId);
    const allowed=hasPlanAtLeast(sub,"FASHION");
    const capsule=(await c.query("SELECT reasoning,combinations_estimate,updated_at FROM capsules WHERE user_id=$1",[userId])).rows[0]||null;
    const items=capsule?(await c.query("SELECT ci.name,ci.category,ci.color FROM capsule_items k JOIN closet_items ci ON ci.id=k.item_id WHERE k.user_id=$1 ORDER BY ci.category,ci.name",[userId])).rows:[];
    return {allowed,capsule,items};
  });
  if(!data)redirect("/");
  const {allowed,capsule,items}=data;
  return <main className="shell narrow">
    <a href="/home">← Voltar</a>
    <h1>Closet Cápsula</h1>
    <p>Escolha um número de peças e a IA seleciona, entre as suas peças reais, a combinação mais versátil — a que gera mais looks diferentes usando menos itens.</p>
    {error&&<p role="alert" className="trial-banner">{error}</p>}
    {!allowed&&<div className="trial-banner"><p>Exclusivo dos planos <strong>Fashion</strong> e <strong>Super Star</strong> (ou durante o teste gratuito). Fale com a administradora para migrar de plano.</p></div>}
    {allowed&&<form action={generateCapsule} className="form">
      <label>Quantas peças na cápsula?<input name="target" type="number" min={5} max={30} defaultValue={15}/></label>
      <SubmitButton pendingText="Analisando seu closet... (pode levar até 20s)">Gerar minha cápsula</SubmitButton>
    </form>}
    {capsule&&<section className="card">
      <h2>Sua cápsula atual</h2>
      {capsule.combinations_estimate&&<p>Estimativa: cerca de <strong>{capsule.combinations_estimate}</strong> combinações possíveis.</p>}
      <p>{capsule.reasoning}</p>
      <ul>{items.map((i:any,idx:number)=><li key={idx}>{i.name} · {i.category} · {i.color||"cor não informada"}</li>)}</ul>
    </section>}
  </main>;
}
