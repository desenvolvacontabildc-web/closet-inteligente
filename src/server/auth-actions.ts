"use server";
import { randomBytes, createHash, scrypt as sc, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers"; import { redirect } from "next/navigation";
import { getPool } from "./db"; import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "./auth";
import { withProfile } from "./profile-session";
const scrypt=promisify(sc), hash=(v:string)=>createHash("sha256").update(v).digest("hex");
async function makeHash(p:string){if(p.length<6)throw new Error("A senha deve ter pelo menos 6 caracteres.");const salt=randomBytes(16),key=await scrypt(p,salt,64) as Buffer;return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`}
async function checkHash(p:string,v:string|null){if(!v?.startsWith("scrypt$"))return false;const[,s,k]=v.split("$");const key=await scrypt(p,Buffer.from(s,"hex"),64) as Buffer;return key.length===k.length/2&&timingSafeEqual(key,Buffer.from(k,"hex"))}
async function issue(c:any,id:string){const t=randomBytes(32).toString("base64url");await c.query("SELECT create_auth_session($1,$2)",[hash(t),id]);(await cookies()).set(SESSION_COOKIE,t,SESSION_COOKIE_OPTIONS)}
export async function register(f:FormData){const email=String(f.get("email")||"").trim().toLowerCase(),name=String(f.get("name")||"").trim(),terms=f.get("terms")==="on",ph=await makeHash(String(f.get("password")||""));if(!/^\S+@\S+\.\S+$/.test(email)||!name)throw new Error("Informe nome e e-mail válidos.");if(!terms)throw new Error("É necessário aceitar os Termos de Uso e a Política de Privacidade.");const c=getPool();const x=await c.connect();try{await x.query("BEGIN");const id=(await x.query("SELECT user_id FROM register_account($1,$2,$3,$4)",[email,ph,name,terms])).rows[0].user_id;await issue(x,id);await x.query("COMMIT");redirect("/onboarding")}catch(e){try{await x.query("ROLLBACK")}catch{}if((e as any).code==="23505")throw new Error("Este e-mail já está cadastrado.");throw e}finally{x.release()}}
export async function login(f:FormData){const email=String(f.get("email")||"").trim().toLowerCase(),p=String(f.get("password")||""),c=await getPool().connect();try{const q=await c.query("SELECT id,password_hash FROM lookup_login($1)",[email]);if(!q.rowCount||!(await checkHash(p,q.rows[0].password_hash)))redirect("/?error=credentials");const status=(await c.query("SELECT check_account_access($1) s",[q.rows[0].id])).rows[0].s;if(status==="BLOCKED"||status==="CANCELED")redirect("/?error=blocked");if(status==="TRIAL_EXPIRED")redirect("/?error=trial_expired");await issue(c,q.rows[0].id);redirect("/onboarding")}finally{c.release()}}
export async function logout(){
  await withProfile(async c => { await c.query("DELETE FROM auth_sessions WHERE token_hash=current_setting('app.session_hash')"); return true; });
  (await cookies()).delete(SESSION_COOKIE); redirect("/");
}
export async function saveOnboarding(f:FormData){
  const fields=["feeling","avoid","routine","style","accent","tone"];
  const answers=Object.fromEntries(fields.map(k=>[k,String(f.get(k)||"").trim()]));
  if(!answers.feeling||!answers.avoid) throw new Error("Preencha as respostas obrigatórias.");
  const tokens={accent:answers.accent||"#b25b76",tone:answers.tone||"acolhedor",density:"equilibrada"};
  const saved=await withProfile(async(c,id)=>{
    const q=await c.query("UPDATE profiles SET answers=$1,experience_tokens=$2,onboarding_completed=true,updated_at=now() WHERE user_id=$3 RETURNING user_id",[answers,tokens,id]);
    if(q.rowCount!==1) throw new Error("Não foi possível salvar seu perfil.");
    return true;
  });
  if(!saved) redirect("/");
  redirect("/home");
}
