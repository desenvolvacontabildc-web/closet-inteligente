import { redirect } from "next/navigation"; import { withProfile } from "@/server/profile-session"; import { generateColorimetria } from "@/server/style-actions"; import { mySubscription, hasPlanAtLeast } from "@/server/limits";
export default async function Colorimetria(){
  const data=await withProfile(async(c,userId)=>{
    const sub=await mySubscription(c,userId);
    const allowed=hasPlanAtLeast(sub,"SUPER_STAR");
    const profile=(await c.query("SELECT subtom,favorable_colors,avoid_colors,notes,updated_at FROM style_profiles WHERE user_id=$1",[userId])).rows[0]||null;
    return {allowed,profile};
  });
  if(!data)redirect("/");
  const {allowed,profile}=data;
  return <main className="shell narrow">
    <a href="/home">← Voltar</a>
    <h1>Colorimetria pessoal</h1>
    <p>Um teste simples, sem precisar de foto de rosto. É uma estimativa por relato — não substitui uma análise profissional presencial.</p>
    {!allowed&&<div className="trial-banner"><p>Exclusiva do plano <strong>Super Star</strong> (ou durante o teste gratuito). Fale com a administradora para migrar de plano.</p></div>}
    {allowed&&<form action={generateColorimetria} className="form">
      <label>Olhando o pulso num lugar bem iluminado, suas veias parecem mais azuladas/roxas ou esverdeadas?
        <select name="veias" defaultValue=""><option value="" disabled>Escolha</option><option>Azuladas/roxas</option><option>Esverdeadas</option><option>Não sei dizer</option></select>
      </label>
      <label>Você se sente melhor com joia dourada ou prateada?
        <select name="joia" defaultValue=""><option value="" disabled>Escolha</option><option>Dourada</option><option>Prateada</option><option>Tanto faz</option></select>
      </label>
      <label>Cor natural do seu cabelo<input name="cabelo" placeholder="Ex.: castanho escuro"/></label>
      <label>Cor dos seus olhos<input name="olhos" placeholder="Ex.: castanho"/></label>
      <label>Como sua pele reage ao sol?<input name="bronzeamento" placeholder="Ex.: bronzeia fácil, queima fácil, etc."/></label>
      <button>Descobrir minha paleta</button>
    </form>}
    {profile&&<section className="card">
      <h2>Seu resultado</h2>
      <p><strong>Subtom estimado:</strong> {profile.subtom}</p>
      <p><strong>Cores que favorecem:</strong> {profile.favorable_colors}</p>
      <p><strong>Cores para evitar perto do rosto:</strong> {profile.avoid_colors}</p>
      <p>{profile.notes}</p>
    </section>}
  </main>;
}
