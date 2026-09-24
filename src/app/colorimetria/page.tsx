import { redirect } from "next/navigation"; import { withProfile } from "@/server/profile-session"; import { generateColorimetria } from "@/server/style-actions";
export default async function Colorimetria({searchParams}:{searchParams:Promise<{error?:string}>}){
  const {error}=await searchParams;
  const data=await withProfile(async(c,userId)=>{
    const mod=(await c.query("SELECT status,origin FROM my_module_status($1,'COLORIMETRIA')",[userId])).rows[0];
    const profile=(await c.query("SELECT subtom,favorable_colors,avoid_colors,notes,dossier,photo_consent_at,updated_at FROM style_profiles WHERE user_id=$1",[userId])).rows[0]||null;
    return {status:mod?.status||"NAO_ADQUIRIDA",profile};
  });
  if(!data)redirect("/");
  const {status,profile}=data;
  const dossier=profile?.dossier&&Object.keys(profile.dossier).length>0?profile.dossier:null;
  return <main className="shell narrow">
    <a href="/cuidese">← Cuide-se</a>
    <h1>Colorimetria pessoal</h1>
    <p>A IA analisa uma foto sua (rosto ou pulso, em boa iluminação) para estimar seu subtom de pele e montar um dossiê de cores. É uma estimativa — não substitui uma análise profissional presencial.</p>
    {error&&<p role="alert" className="trial-banner">{error}</p>}
    {status==="NAO_ADQUIRIDA"&&<div className="trial-banner"><p>Experiência avulsa, liberação única (não é recurso mensal): <strong>R$ 59,90</strong>, ou incluída ao assinar o plano <strong>Super Star</strong>. Fale com a administradora pra liberar.</p></div>}
    {(status==="LIBERADA"||status==="EM_ANALISE")&&<form action={generateColorimetria} encType="multipart/form-data" className="form">
      <label>Sua foto (rosto e/ou pulso, luz natural, sem filtro)<input name="photo" type="file" accept="image/*" required/></label>
      <label className="checkbox"><input type="checkbox" name="consent" required/> Autorizo o uso desta foto pela IA, só para gerar esta análise de colorimetria. A foto não fica salva depois da análise.</label>
      <label>Cor natural do seu cabelo
        <select name="cabelo" defaultValue="">
          <option value="" disabled>Escolha</option>
          <option>Preto</option><option>Castanho escuro</option><option>Castanho médio</option><option>Castanho claro</option>
          <option>Ruivo</option><option>Loiro escuro</option><option>Loiro claro</option><option>Grisalho/branco</option>
        </select>
      </label>
      <label>Seu cabelo está tingido hoje?
        <select name="tingido" defaultValue="">
          <option value="" disabled>Escolha</option>
          <option>Não, é a cor natural</option>
          <option>Tingido, em tom parecido com o natural</option>
          <option>Sim, mudei bastante a cor</option>
        </select>
      </label>
      <label>Cor dos seus olhos
        <select name="olhos" defaultValue="">
          <option value="" disabled>Escolha</option>
          <option>Castanho escuro</option><option>Castanho claro / mel</option><option>Verde</option><option>Azul</option><option>Cinza</option><option>Misto / heterocromia</option>
        </select>
      </label>
      <label>Como sua pele reage ao sol?
        <select name="bronzeamento" defaultValue="">
          <option value="" disabled>Escolha</option>
          <option>Queima fácil, quase não bronzeia</option>
          <option>Queima um pouco e depois bronzeia</option>
          <option>Bronzeia fácil, raramente queima</option>
          <option>Já sou morena/negra, pele naturalmente escura</option>
        </select>
      </label>
      <button>Descobrir minha paleta</button>
    </form>}
    {status==="CONCLUIDA"?<>
      {dossier?<section className="card">
        <h2>Seu dossiê de colorimetria</h2>
        <p><strong>Subtom:</strong> {dossier.subtom}</p>
        {dossier.profundidade&&<p><strong>Profundidade:</strong> {dossier.profundidade}</p>}
        {dossier.intensidade&&<p><strong>Intensidade:</strong> {dossier.intensidade}</p>}
        {dossier.contraste&&<p><strong>Contraste:</strong> {dossier.contraste}</p>}
        {dossier.cores_protagonistas&&<p><strong>Cores protagonistas:</strong> {dossier.cores_protagonistas}</p>}
        {dossier.neutros&&<p><strong>Neutros que favorecem:</strong> {dossier.neutros}</p>}
        {dossier.cores_destaque&&<p><strong>Cores de destaque:</strong> {dossier.cores_destaque}</p>}
        {dossier.melhores_combinacoes&&<p><strong>Melhores combinações:</strong> {dossier.melhores_combinacoes}</p>}
        {dossier.metais&&<p><strong>Metais (joias):</strong> {dossier.metais}</p>}
        {dossier.orientacao_maquiagem&&<p><strong>Maquiagem:</strong> {dossier.orientacao_maquiagem}</p>}
        {dossier.orientacao_cabelo&&<p><strong>Cabelo:</strong> {dossier.orientacao_cabelo}</p>}
        <p><strong>Cores que favorecem perto do rosto:</strong> {dossier.favorable_colors||profile.favorable_colors}</p>
        <p><strong>Cores que exigem mais estratégia:</strong> {dossier.cores_que_exigem_estrategia||dossier.avoid_colors||profile.avoid_colors}</p>
        <p>{dossier.notes||profile.notes}</p>
        {profile.photo_consent_at&&<p><small>Autorização de uso da foto registrada em {new Date(profile.photo_consent_at).toLocaleString("pt-BR")}.</small></p>}
      </section>:<p>Resultado concluído anteriormente, mas sem dossiê detalhado salvo.</p>}
    </>:null}
  </main>;
}
