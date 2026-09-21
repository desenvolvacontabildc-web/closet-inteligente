import { redirect } from "next/navigation";
import { logout } from "@/server/auth-actions";
import { generateTodayLook } from "@/server/look-actions";
import Link from "next/link";
import { withProfile } from "@/server/profile-session";
import { aiUsageRemaining, PLAN_LABEL, type Plan } from "@/server/limits";
export default async function Home(){
 const profile=await withProfile(async(c,id)=>{
   const p=(await c.query("SELECT p.display_name,p.experience_tokens,p.onboarding_completed,u.is_admin FROM profiles p JOIN app_users u ON u.id=p.user_id WHERE p.user_id=$1",[id])).rows[0];
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
 const {display_name,experience_tokens,is_admin,sub,aiRemaining,todayLooks,activeItems}=profile;
 const trialDaysLeft=sub?.status==="TRIAL"&&sub.trial_ends_at?Math.max(0,Math.ceil((new Date(sub.trial_ends_at).getTime()-Date.now())/86400000)):null;
 return <main className="shell" style={{"--accent":experience_tokens?.accent||"#b25b76"} as React.CSSProperties}>
   <div className="top"><span className="eyebrow">CLOSET INTELIGENTE</span><form action={logout}><button className="link">Sair</button></form></div>
   {trialDaysLeft!==null&&<div className="trial-banner"><p>{trialDaysLeft>0?`Faltam ${trialDaysLeft} dia${trialDaysLeft===1?"":"s"} do seu teste gratuito.`:"Seu teste gratuito termina hoje."} Fale com a administradora para assinar e manter o acesso ao seu Closet.</p></div>}
   {sub?.status==="ACTIVE"&&<div className="trial-banner"><p>Plano {PLAN_LABEL[sub.plan as Plan]||sub.plan}{aiRemaining!==null?` · restam ${aiRemaining} usos de IA este mês`:" · usos de IA ilimitados"}.</p></div>}
   <section className="welcome">
     <p className="eyebrow">SEU CLOSET ESTÁ PRONTO</p>
     <h1>Olá, {display_name}.</h1>
     <div className="empty">
       <h2>Look para hoje</h2>
       {todayLooks.length>0?<div className="grid">
         {todayLooks.map((l:any)=>(
           <div className="empty" key={l.id}>
             {l.has_illustration&&<img src={`/api/looks/${l.id}/illustration`} alt="Ilustração do look de hoje" style={{maxWidth:"100%",borderRadius:12,marginBottom:8}}/>}
             <strong>{l.name||"Opção de hoje"}</strong>
             <span>{l.occasion||"Dia comum"}</span>
             <span>{(l.pieces||[]).join(" + ")}</span>
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
     <div className="empty">
       <h2>Seu closet começa aqui</h2>
       <p>Cadastre suas peças reais e monte looks sem inventar nada que você não tem.</p>
       <nav className="nav-links">
         <Link href="/closet">Abrir meu Closet</Link>
         <Link href="/looks">Meus Looks</Link>
         <Link href="/mala">Mala de Viagem</Link>
         <Link href="/capsula">Closet Cápsula</Link>
         <Link href="/colorimetria">Colorimetria</Link>
         <Link href="/vitrine">Vitrine de Parceiras</Link>
         {is_admin&&<Link href="/admin">Administração de contas</Link>}
         {is_admin&&<Link href="/admin/parceiras">Administração de parceiras</Link>}
       </nav>
     </div>
   </section>
 </main>}
