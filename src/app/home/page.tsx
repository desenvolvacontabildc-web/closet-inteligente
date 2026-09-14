import { redirect } from "next/navigation";
import { logout } from "@/server/auth-actions";
import Link from "next/link";
import { withProfile } from "@/server/profile-session";
export default async function Home(){
 const profile=await withProfile(async(c,id)=>(await c.query("SELECT display_name,experience_tokens,onboarding_completed FROM profiles WHERE user_id=$1",[id])).rows[0]);
 if(!profile)redirect("/");
 if(!profile.onboarding_completed)redirect("/onboarding");
 const {display_name,experience_tokens}=profile;return <main className="shell" style={{"--accent":experience_tokens?.accent||"#b25b76"} as React.CSSProperties}><div className="top"><span className="eyebrow">CLOSET INTELIGENTE</span><form action={logout}><button className="link">Sair</button></form></div><section className="welcome"><p className="eyebrow">SEU CLOSET ESTÁ PRONTO</p><h1>Olá, {display_name}.</h1><p>Preparamos uma experiência com a sua identidade. O próximo passo é adicionar suas peças.</p><div className="empty"><h2>Seu closet começa aqui</h2><p>Em breve você poderá cadastrar fotos e organizar suas peças reais.</p><Link href="/closet">Abrir meu Closet</Link></div></section></main>}
