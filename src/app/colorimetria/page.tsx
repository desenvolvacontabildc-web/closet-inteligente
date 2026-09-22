import { redirect } from "next/navigation"; import { withProfile } from "@/server/profile-session"; import { generateColorimetria } from "@/server/style-actions"; import { mySubscription, hasPlanAtLeast } from "@/server/limits";
export default async function Colorimetria({searchParams}:{searchParams:Promise<{error?:string}>}){
  const {error}=await searchParams;
  const data=await withProfile(async(c,userId)=>{
    const sub=await mySubscription(c,userId);
    const allowed=hasPlanAtLeast(sub,"SUPER_STAR");
    const profile=(await c.query("SELECT subtom,favorable_colors,avoid_colors,notes,photo_consent_at,updated_at FROM style_profiles WHERE user_id=$1",[userId])).rows[0]||null;
    return {allowed,profile};
  });
  if(!data)redirect("/");
  const {allowed,profile}=data;
  return <main className="shell narrow">
    <a href="/home">← Voltar</a>
    <h1>Colorimetria pessoal</h1>
    <p>A IA analisa uma foto sua (rosto ou pulso, em boa iluminação) para estimar seu subtom de pele e sugerir cores. É uma estimativa — não substitui uma análise profissional presencial.</p>
    {error&&<p role="alert" className="trial-banner">{error}</p>}
    {!allowed&&<div className="trial-banner"><p>Exclusiva do plano <strong>Super Star</strong> (ou durante o teste gratuito). Fale com a administradora para migrar de plano.</p></div>}
    {allowed&&<form action={generateColorimetria} encType="multipart/form-data" className="form">
      <label>Sua foto (rosto e/ou pulso, luz natural, sem filtro)<input name="photo" type="file" accept="image/*" required/></label>
      <label className="checkbox"><input type="checkbox" name="consent" required/> Autorizo o uso desta foto pela IA, só para gerar esta análise de colorimetria. A foto não fica salva depois da análise.</label>
      <label>Cor natural do seu cabelo (opcional)<input name="cabelo" placeholder="Ex.: castanho escuro"/></label>
      <label>Cor dos seus olhos (opcional)<input name="olhos" placeholder="Ex.: castanho"/></label>
      <label>Como sua pele reage ao sol? (opcional)<input name="bronzeamento" placeholder="Ex.: bronzeia fácil, queima fácil, etc."/></label>
      <button>Descobrir minha paleta</button>
    </form>}
    {profile&&<section className="card">
      <h2>Seu resultado</h2>
      <p><strong>Subtom estimado:</strong> {profile.subtom}</p>
      <p><strong>Cores que favorecem:</strong> {profile.favorable_colors}</p>
      <p><strong>Cores para evitar perto do rosto:</strong> {profile.avoid_colors}</p>
      <p>{profile.notes}</p>
      {profile.photo_consent_at&&<p><small>Autorização de uso da foto registrada em {new Date(profile.photo_consent_at).toLocaleString("pt-BR")}.</small></p>}
    </section>}
  </main>;
}
