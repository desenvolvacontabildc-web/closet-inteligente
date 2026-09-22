import { redirect } from "next/navigation";
import { generateTodayLook } from "@/server/look-actions";
import Link from "next/link";
import { withProfile } from "@/server/profile-session";
import { aiUsageRemaining, PLAN_LABEL, type Plan } from "@/server/limits";
export default async function Home(){
 const profile=await withProfile(async(c,id)=>{
   const p=(await c.query("SELECT p.display_name,p.onboarding_completed FROM profiles p WHERE p.user_id=$1",[id])).rows[0];
   if(!p)return null;
   const sub=(await c.query("SELECT * FROM my_subscription($1)",[id])).rows[0];
   const aiRemaining=await aiUsageRemaining(c,id);
   const todayLooks=(await c.query(`SELECT l.id,l.name,l.occasion,l.illustration_object_key IS NOT NULL AS has_illustration,
     (SELECT json_agg(ci.name) FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS pieces
     FROM looks l WHERE l.kind='DAILY' AND l.created_at::date=current_date ORDER BY l.created_at`)).rows;
   const activeItems=(await c.query("SELECT id,name,category FROM closet_items WHERE status='ACTIVE' ORDER BY category,name")).rows;
   return {...p,sub,aiRemaining,todayLooks,activeItems};
 });
 if(!profile)redirect("/");
 if(!profile.onboarding_completed)redirect("/onboarding");
 const {display_name,sub,aiRemaining,todayLooks,activeItems}=profile;
 const trialDaysLeft=sub?.status==="TRIAL"&&sub.trial_ends_at?Math.max(0,Math.ceil((new Date(sub.trial_ends_at).getTime()-Date.now())/86400000)):null;
 return <main className="shell">
   <span className="eyebrow">CLOSET INTELIGENTE</span>
   {trialDaysLeft!==null&&<div className="trial-banner"><p>{trialDaysLeft>0?`Faltam ${trialDaysLeft} dia${trialDaysLeft===1?"":"s"} do seu teste gratuito.`:"Seu teste gratuito termina hoje."} Fale com a administradora para assinar e manter o acesso ao seu Closet.</p></div>}
   {sub?.status==="ACTIVE"&&<div className="trial-banner"><p>Plano {PLAN_LABEL[sub.plan as Plan]||sub.plan}{aiRemaining!==null?` · restam ${aiRemaining} usos de IA este mês`:" · usos de IA ilimitados"}.</p></div>}
   <section className="welcome">
     <p className="eyebrow">SEU CLOSET ESTÁ PRONTO</p>
     <h1>Olá, {display_name}.</h1>
     <div className="empty">
       <h2>Look para hoje</h2>
       {todayLooks.length>0?<div className="grid">
         {todayLooks.map((l:any)=>(
           <div className="look-card" key={l.id}>
             {l.has_illustration&&<img src={`/api/looks/${l.id}/illustration`} alt="Ilustração do look de hoje"/>}
             <h3>{l.name||"Opção de hoje"}</h3>
             <p className="look-meta">{l.occasion||"Dia comum"}</p>
             <p className="look-pieces">{(l.pieces||[]).join(" + ")}</p>
           </div>
         ))}
       </div>:<form action={generateTodayLook} className="form">
         <label>Quer usar alguma peça específica como base? (opcional)
           <select name="base_item_id" defaultValue="">
             <option value="">Nenhuma — gerar do zero</option>
             {activeItems.map((i:any)=><option key={i.id} value={i.id}>{i.name} · {i.category}</option>)}
           </select>
         </label>
         <button>Gerar 3 opções de look para hoje</button>
       </form>}
     </div>
     <div className="quick-actions">
       <Link href="/looks">Criar look</Link>
       <Link href="/looks">Avaliar meu look</Link>
       <Link href="/closet">Adicionar peças</Link>
       <Link href="/vitrine">Comprar com desconto</Link>
     </div>
   </section>
 </main>}
