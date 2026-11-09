import { redirect } from "next/navigation";
import { generateTodayLook, generateLookIllustration, submitLookFeedback } from "@/server/look-actions";
import Link from "next/link";
import { withProfile } from "@/server/profile-session";
import { aiUsageRemaining, imageGenerationsRemaining, checkAndGrantMilestones, MILESTONE_LABEL, PLAN_LABEL, type Plan } from "@/server/limits";
import { fetchCurrentWeather } from "@/server/weather";
import SubmitButton from "@/components/submit-button";
import { reviewCandidates } from "@/server/closet-review";
import { snoozeClosetReview } from "@/server/closet-review-actions";
import { hairReminder } from "@/server/hair-progress";
import { skinReminder } from "@/server/skin-progress";
import { toggleHairStep } from "@/server/hair-actions";
import { STEP_TYPES } from "@/server/hair-options";
export default async function Home({searchParams}:{searchParams:Promise<{error?:string,skip?:string}>}){
 const {error,skip}=await searchParams;
 const skipIds=(skip||"").split(",").filter(Boolean);
 const profile=await withProfile(async(c,id)=>{
   const p=(await c.query("SELECT p.display_name,p.onboarding_completed,p.avatar_object_key,p.city,p.closet_review_snooze_until FROM profiles p WHERE p.user_id=$1",[id])).rows[0];
   if(!p)return null;
   const sub=(await c.query("SELECT * FROM my_subscription($1)",[id])).rows[0];
   const aiRemaining=await aiUsageRemaining(c,id);
   const novasConquistas=await checkAndGrantMilestones(c,id);
   const todayLooks=(await c.query(`SELECT l.id,l.name,l.occasion,l.illustration_object_key IS NOT NULL AS has_illustration,
     (SELECT lf.kind FROM look_feedback lf WHERE lf.look_id=l.id ORDER BY lf.created_at DESC LIMIT 1) AS last_feedback,
     (SELECT array_agg(ci.name) FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS pieces
     FROM looks l WHERE l.kind='DAILY' AND l.status<>'REJECTED' AND l.created_at::date=current_date ORDER BY l.created_at`)).rows;
   const activeItems=(await c.query("SELECT id,name,category FROM closet_items WHERE status='ACTIVE' ORDER BY category,name")).rows;
   const trend=(await c.query("SELECT * FROM list_active_trends(1)")).rows[0]||null;
   // LOOK DO DIA: muda todo dia (chave de desempate estável por data), priorizando looks já
   // aprovados, depois looks salvos não usados recentemente -- podem ser novos, já salvos ou
   // aprovados, sempre variando. A ideia é ela sempre ter uma opção pronta sem precisar gerar
   // (e gastar crédito de imagem). PEÇA DO DIA: se não houver nenhum look salvo com peças, cai
   // pra uma peça real pouco usada -- nunca gera imagem automaticamente só pra preencher a Home.
   const dayLook=skipIds.length?null:(await c.query(`SELECT l.id,l.name,l.occasion,l.status,l.illustration_object_key IS NOT NULL AS has_illustration,l.photo_object_key IS NOT NULL AS has_photo,
       (SELECT array_agg(ci.name) FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS pieces
     FROM looks l WHERE l.kind NOT IN ('DAILY','TRIP','ANALYSIS') AND l.status NOT IN ('REJECTED','OUTDATED')
       AND l.id::text != ALL($1::text[]) AND EXISTS (SELECT 1 FROM look_items li WHERE li.look_id=l.id)
     ORDER BY (l.status='APPROVED') DESC, (l.worn_at IS NULL OR l.worn_at < now() - interval '14 days') DESC, md5(l.id::text||current_date::text)
     LIMIT 1`,[skipIds])).rows[0]||null;
   const dayPiece=dayLook?null:(await c.query(`SELECT ci.id,ci.name,ci.category,
       (SELECT p.id FROM closet_item_photos p WHERE p.item_id=ci.id ORDER BY p.created_at DESC LIMIT 1) AS photo_id,
       (SELECT MAX(l.created_at) FROM look_items li JOIN looks l ON l.id=li.look_id WHERE li.item_id=ci.id) AS last_used_at
     FROM closet_items ci WHERE ci.status='ACTIVE' AND ci.id::text != ALL($1::text[])
     ORDER BY last_used_at ASC NULLS FIRST LIMIT 1`,[skipIds])).rows[0]||null;
   const review=await reviewCandidates(c,50);
   const hair=await hairReminder(c);
   const skin=await skinReminder(c);
   return {...p,sub,aiRemaining,todayLooks,activeItems,trend,dayLook,dayPiece,novasConquistas,review,hair,skin};
 });
 if(!profile)redirect("/");
 if(!profile.onboarding_completed)redirect("/onboarding");
 const {display_name,sub,aiRemaining,todayLooks,activeItems,trend,avatar_object_key,dayLook,dayPiece,novasConquistas,city,review,closet_review_snooze_until,hair,skin}=profile;
 const showReview=review.length>0&&(!closet_review_snooze_until||new Date(closet_review_snooze_until)<new Date());
 const weather=await fetchCurrentWeather(city||"");
 const firstName=((display_name||"").trim().split(/\s+/)[0]||"").toLowerCase().replace(/^./,(ch:string)=>ch.toUpperCase());
 const poucasPecas=activeItems.length<8;
 const dayPieceDays=dayPiece?.last_used_at?Math.floor((Date.now()-new Date(dayPiece.last_used_at).getTime())/86400000):null;
 const trialDaysLeft=sub?.status==="TRIAL"&&sub.trial_ends_at?Math.max(0,Math.ceil((new Date(sub.trial_ends_at).getTime()-Date.now())/86400000)):null;
 return <main className="shell">
   <span className="eyebrow">CLOSET INTELIGENTE</span>
   {error&&<p role="alert" className="trial-banner">{error}</p>}
   {novasConquistas.map((m:any)=>(
     <div className="trial-banner" key={m.reason}><p>Parabéns! Você completa {MILESTONE_LABEL[m.reason]||m.reason} de Closet Inteligente e ganhou {m.credits} créditos bônus de geração de imagem!</p></div>
   ))}
   {trialDaysLeft!==null&&<div className="trial-banner"><p>{trialDaysLeft>0?`Faltam ${trialDaysLeft} dia${trialDaysLeft===1?"":"s"} do seu teste gratuito.`:"Seu teste gratuito termina hoje."} <Link href="/assinatura">Escolha um plano</Link> para manter o acesso ao seu Closet.</p></div>}
   {sub?.status==="ACTIVE"&&<p className="usage-line">Plano {PLAN_LABEL[sub.plan as Plan]||sub.plan}{aiRemaining!==null?` · restam ${aiRemaining} operações de IA este mês`:" · operações de IA ilimitadas"}.</p>}
   <section className="welcome">
     <p className="eyebrow">SEU CLOSET ESTÁ PRONTO</p>
     <div className="avatar-row">
       {avatar_object_key
         ? <img className="avatar" src="/api/perfil/foto" alt={display_name}/>
         : <span className="avatar avatar-placeholder">✦</span>}
       <h1>Olá, {firstName}.</h1>
     </div>
     {weather
       ? <p className="look-meta">Hoje em {weather.city}: {weather.temp}°C{weather.chovendo?", chance de chuva":""}.</p>
       : <p className="look-meta">Cadastre sua cidade no <Link href="/perfil">Perfil</Link> pra eu te avisar aqui do clima do dia.</p>}
     <div className="empty">
       <h2>Look para hoje</h2>
       {poucasPecas&&<p className="look-meta">Suas sugestões ainda vão melhorar: quanto mais peças você cadastrar e mais looks usar/avaliar, mais o app entende sua rotina e seu estilo e mais certeiras ficam as opções.</p>}
       {todayLooks.length>0?<div className="grid two-col">
         {todayLooks.map((l:any)=>(
           <div className="look-card" key={l.id}>
             {l.has_illustration?<img src={`/api/looks/${l.id}/illustration?w=640`} alt="Ilustração do look de hoje"/>
               :<span className="look-thumb-placeholder">✦<small>Sem imagem ainda</small></span>}
             <h3>{l.name||"Opção de hoje"}</h3>
             <p className="look-meta">{l.occasion||"Dia comum"}</p>
             <p className="look-pieces">{(l.pieces||[]).join(" + ")}</p>
             {!l.has_illustration&&<form action={generateLookIllustration}>
               <input type="hidden" name="look_id" value={l.id}/>
               <input type="hidden" name="return_path" value="/home"/>
               <SubmitButton pendingText="Gerando imagem... (pode levar até 2 minutos)">Ver este look em imagem</SubmitButton>
             </form>}
             <div className="action-row">
               <form action={submitLookFeedback}>
                 <input type="hidden" name="look_id" value={l.id}/><input type="hidden" name="kind" value="LIKE"/><input type="hidden" name="return_path" value="/home"/>
                 <button className={l.last_feedback==="LIKE"?"active":""}>♡ Gostei</button>
               </form>
               <form action={submitLookFeedback}>
                 <input type="hidden" name="look_id" value={l.id}/><input type="hidden" name="kind" value="DISLIKE"/><input type="hidden" name="return_path" value="/home"/>
                 <button className={l.last_feedback==="DISLIKE"?"active":""}>Não é pra mim</button>
               </form>
             </div>
           </div>
         ))}
       </div>:dayLook?<div className="day-look">
         <div className="day-cover">
           {dayLook.has_photo?<img src={`/api/looks/${dayLook.id}/photo?w=640`} alt={dayLook.name}/>
             :dayLook.has_illustration?<img src={`/api/looks/${dayLook.id}/illustration?w=640`} alt={dayLook.name}/>:<span className="cover-empty">✦</span>}
         </div>
         <div className="day-body">
         <div>
           <span className="eyebrow">LOOK DO DIA</span>
           <strong>{dayLook.name||(dayLook.status==="APPROVED"?"Um look que você já aprovou":"Uma opção pronta pra hoje")}</strong>
           <p className="look-meta">{(dayLook.pieces||[]).join(" + ")}</p>
         </div>
         <div className="action-row">
           <Link href="/looks">Ver look</Link>
           {!dayLook.has_illustration&&!dayLook.has_photo&&<form action={generateLookIllustration}>
             <input type="hidden" name="look_id" value={dayLook.id}/><input type="hidden" name="return_path" value="/home"/>
             <SubmitButton pendingText="Gerando... (pode levar até 2 minutos)">Ver este look em imagem</SubmitButton>
           </form>}
           <Link href={`/home?skip=${dayLook.id}`}>Gerar outra sugestão</Link>
         </div>
         </div>
       </div>:dayPiece?<div className="day-look">
         <div className="day-cover">{dayPiece.photo_id?<img src={`/api/closet/photos/${dayPiece.photo_id}?w=640`} alt={dayPiece.name}/>:<span className="cover-empty">✦</span>}</div>
         <div className="day-body">
         <div>
           <span className="eyebrow">PEÇA DO DIA</span>
           <strong>{dayPiece.name}</strong>
           <p className="look-meta">{dayPieceDays===null?"Você ainda não usou essa peça em nenhum look.":`Você não usa essa peça há ${dayPieceDays} dias.`} Que tal incluir ela hoje?</p>
         </div>
         <div className="action-row">
           <form action={generateTodayLook}>
             <input type="hidden" name="base_item_id" value={dayPiece.id}/>
             <SubmitButton pendingText="Pensando... (pode levar até 20s)">Montar look com esta peça</SubmitButton>
           </form>
           <Link href={`/home?skip=${dayPiece.id}`}>Gerar outra sugestão</Link>
         </div>
         </div>
       </div>:null}
       <details>
         <summary>Ou monte um novo look para hoje do zero</summary>
         <form action={generateTodayLook} className="form">
           <label>Quer usar alguma peça específica como base? (opcional)
             <select name="base_item_id" defaultValue="">
               <option value="">Nenhuma — gerar do zero</option>
               {activeItems.map((i:any)=><option key={i.id} value={i.id}>{i.name} · {i.category}</option>)}
             </select>
           </label>
           <SubmitButton pendingText="Pensando... (pode levar até 20s)">Gerar 2 opções de look para hoje</SubmitButton>
         </form>
       </details>
     </div>
     {hair&&<div className="card hair-reminder">
       <span className="eyebrow">CRONOGRAMA CAPILAR{hair.state!=="FINISHED"?` · SEMANA ${hair.week} DE ${hair.weeks}`:""}</span>
       {hair.state==="DUE"&&<>
         <h2>{hair.late?"Etapa pendente: ":"Sua etapa da semana: "}{STEP_TYPES[hair.step.tipo]||hair.step.tipo}</h2>
         <p className="look-meta">{hair.step.titulo}{hair.late?` (da semana ${hair.step.week})`:""}</p>
         {hair.step.preferir.length>0&&<p className="look-meta">Prefira produtos com {hair.step.preferir.slice(0,3).join(", ")}.</p>}
         <div className="hair-progress" aria-hidden="true"><i style={{width:`${Math.round((hair.done/hair.total)*100)}%`}}/></div>
         <div className="action-row">
           <form action={toggleHairStep}>
             <input type="hidden" name="cycle_id" value={hair.cycleId}/><input type="hidden" name="step_id" value={hair.step.id}/><input type="hidden" name="return_to" value="/home"/>
             <SubmitButton pendingText="Salvando...">Marcar como feita</SubmitButton>
           </form>
           <Link href={`/cuidese/cronograma#semana-${hair.step.week}`}>Como fazer</Link>
         </div>
       </>}
       {hair.state==="ONTRACK"&&<>
         <h2>Você está em dia</h2>
         <p className="look-meta">As etapas desta semana já foram feitas. A próxima semana do cronograma começa em {hair.nextStart.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})}.</p>
         <div className="hair-progress" aria-hidden="true"><i style={{width:`${Math.round((hair.done/hair.total)*100)}%`}}/></div>
         <div className="action-row"><Link href="/cuidese/cronograma">Ver o cronograma</Link></div>
       </>}
       {hair.state==="FINISHED"&&<>
         <h2>Ciclo concluído</h2>
         <p className="look-meta">{hair.done} de {hair.total} etapas feitas. Hora de reavaliar o cabelo: um novo questionário gera o próximo diagnóstico e ciclo.</p>
         <div className="action-row"><Link href="/cuidese/cronograma?novo=1"><strong>Fazer o novo questionário</strong></Link></div>
       </>}
     </div>}
     {skin&&(skin.steps||skin.review)&&<div className="card hair-reminder">
       <span className="eyebrow">SKINCARE{skin.steps?` · ${skin.steps.period==="AM"?"MANHÃ":"NOITE"}`:""}</span>
       {skin.steps?<>
         <h2>{skin.steps.period==="AM"?"Rotina da manhã":"Rotina da noite"}: {skin.steps.done} de {skin.steps.total}</h2>
         <p className="look-meta">Próxima etapa: {skin.steps.next.titulo}</p>
         <div className="hair-progress" aria-hidden="true"><i style={{width:`${Math.round((skin.steps.done/skin.steps.total)*100)}%`}}/></div>
         <div className="action-row"><Link href="/cuidese/skincare"><strong>Abrir minha rotina</strong></Link></div>
       </>:<>
         <h2>Hora de reavaliar a pele</h2>
         <p className="look-meta">O prazo da sua rotina chegou ao fim. Um novo questionário ajusta o diagnóstico e os produtos.</p>
         <div className="action-row"><Link href="/cuidese/skincare?novo=1"><strong>Fazer o novo questionário</strong></Link></div>
       </>}
     </div>}
     <div className="quick-actions">
       <Link href="/looks"><span aria-hidden="true">✦</span>Criar look</Link>
       <Link href="/looks/analisar"><span aria-hidden="true">✦</span>Analisar meu look</Link>
       <Link href="/closet"><span aria-hidden="true">✦</span>Adicionar peças</Link>
       <Link href="/vitrine"><span aria-hidden="true">✦</span>Comprar com desconto</Link>
     </div>
     {showReview&&<div className="card home-review">
       <h2>Hora de rever seu closet</h2>
       <p className="look-meta">{review.length} peça{review.length===1?"":"s"} parada{review.length===1?"":"s"} há um bom tempo. Vale manter, doar ou descartar?</p>
       <div className="home-review-thumbs">
         {review.slice(0,4).map((r:any)=>(
           <Link href={`/closet/${r.id}`} key={r.id} className="home-review-thumb" aria-label={r.name}>
             {r.photo_id?<img src={`/api/closet/photos/${r.photo_id}?w=240`} alt={r.name} loading="lazy"/>:<span className="cover-empty">✦</span>}
           </Link>
         ))}
       </div>
       <div className="action-row">
         <Link href="/closet/revisao"><strong>Revisar agora</strong></Link>
         <form action={snoozeClosetReview}><input type="hidden" name="return_path" value="/home"/><button className="link">Agora não (lembrar em 30 dias)</button></form>
       </div>
     </div>}
     {trend&&<Link href="/tendencias" className="trend-teaser">
       {trend.object_key&&<img src={`/api/tendencias/photos/${trend.id}`} alt={trend.title}/>}
       <div>
         <span className="eyebrow">TENDÊNCIA PARA VOCÊ</span>
         <strong>{trend.title}</strong>
       </div>
     </Link>}
   </section>
 </main>}
