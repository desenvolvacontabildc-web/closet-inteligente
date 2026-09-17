import { redirect } from "next/navigation";
import { logout } from "@/server/auth-actions";
import Link from "next/link";
import { withProfile } from "@/server/profile-session";
export default async function Home(){
 const profile=await withProfile(async(c,id)=>{
   const p=(await c.query("SELECT p.display_name,p.experience_tokens,p.onboarding_completed,u.is_admin FROM profiles p JOIN app_users u ON u.id=p.user_id WHERE p.user_id=$1",[id])).rows[0];
   if(!p)return null;
   const sub=(await c.query("SELECT * FROM my_subscription($1)",[id])).rows[0];
   return {...p,sub};
 });
 if(!profile)redirect("/");
 if(!profile.onboarding_completed)redirect("/onboarding");
 const {display_name,experience_tokens,is_admin,sub}=profile;
 const trialDaysLeft=sub?.status==="TRIAL"&&sub.trial_ends_at?Math.max(0,Math.ceil((new Date(sub.trial_ends_at).getTime()-Date.now())/86400000)):null;
 return <main className="shell" style={{"--accent":experience_tokens?.accent||"#b25b76"} as React.CSSProperties}><div className="top"><span className="eyebrow">CLOSET INTELIGENTE</span><form action={logout}><button className="link">Sair</button></form></div>{trialDaysLeft!==null&&<div className="trial-banner"><p>{trialDaysLeft>0?`Faltam ${trialDaysLeft} dia${trialDaysLeft===1?"":"s"} do seu teste gratuito.`:"Seu teste gratuito termina hoje."} Fale com a administradora para assinar e manter o acesso ao seu Closet.</p></div>}<section className="welcome"><p className="eyebrow">SEU CLOSET ESTÁ PRONTO</p><h1>Olá, {display_name}.</h1><p>Preparamos uma experiência com a sua identidade. O próximo passo é adicionar suas peças.</p><div className="empty"><h2>Seu closet começa aqui</h2><p>Em breve você poderá cadastrar fotos e organizar suas peças reais.</p><Link href="/closet">Abrir meu Closet</Link><Link href="/looks">Meus Looks</Link>{is_admin&&<Link href="/admin">Administração de contas</Link>}</div></section></main>}
