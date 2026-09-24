"use server";
import { randomBytes, createHash, scrypt as sc, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Client } from "minio";
import { cookies } from "next/headers"; import { redirect } from "next/navigation";
import { getPool } from "./db"; import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "./auth";
import { withProfile } from "./profile-session";
import { resolveAccent } from "./accent";
import { bounce } from "./action-error";
import { generateBodyAvatar } from "./avatar-actions";
const store=new Client({endPoint:(process.env.S3_ENDPOINT||"http://storage:9000").replace(/^https?:\/\//,'').split(':')[0],port:9000,useSSL:false,accessKey:process.env.S3_ACCESS_KEY_ID||"closet-web",secretKey:process.env.S3_SECRET_ACCESS_KEY||""});
const scrypt=promisify(sc), hash=(v:string)=>createHash("sha256").update(v).digest("hex");
async function makeHash(p:string){if(p.length<6)throw new Error("A senha deve ter pelo menos 6 caracteres.");const salt=randomBytes(16),key=await scrypt(p,salt,64) as Buffer;return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`}
async function checkHash(p:string,v:string|null){if(!v?.startsWith("scrypt$"))return false;const[,s,k]=v.split("$");const key=await scrypt(p,Buffer.from(s,"hex"),64) as Buffer;return key.length===k.length/2&&timingSafeEqual(key,Buffer.from(k,"hex"))}
async function issue(c:any,id:string){const t=randomBytes(32).toString("base64url");await c.query("SELECT create_auth_session($1,$2)",[hash(t),id]);(await cookies()).set(SESSION_COOKIE,t,SESSION_COOKIE_OPTIONS)}
export async function register(f:FormData){
  const email=String(f.get("email")||"").trim().toLowerCase(),name=String(f.get("name")||"").trim(),terms=f.get("terms")==="on",password=String(f.get("password")||"");
  if(!/^\S+@\S+\.\S+$/.test(email)||!name)bounce("/","Informe nome e e-mail válidos.");
  if(!terms)bounce("/","É necessário aceitar os Termos de Uso e a Política de Privacidade.");
  if(password.length<6)bounce("/","A senha deve ter pelo menos 6 caracteres.");
  const ph=await makeHash(password);
  const c=getPool();const x=await c.connect();
  try{
    await x.query("BEGIN");
    const id=(await x.query("SELECT user_id FROM register_account($1,$2,$3,$4)",[email,ph,name,terms])).rows[0].user_id;
    await issue(x,id);
    await x.query("COMMIT");
    redirect("/onboarding");
  }catch(e){
    try{await x.query("ROLLBACK")}catch{}
    if((e as any).code==="23505")bounce("/","Este e-mail já está cadastrado.");
    throw e;
  }finally{x.release()}
}
export async function login(f:FormData){const email=String(f.get("email")||"").trim().toLowerCase(),p=String(f.get("password")||""),c=await getPool().connect();try{const q=await c.query("SELECT id,password_hash FROM lookup_login($1)",[email]);if(!q.rowCount||!(await checkHash(p,q.rows[0].password_hash)))redirect("/?error=credentials");const status=(await c.query("SELECT check_account_access($1) s",[q.rows[0].id])).rows[0].s;if(status==="BLOCKED"||status==="CANCELED")redirect("/?error=blocked");if(status==="TRIAL_EXPIRED")redirect("/?error=trial_expired");await issue(c,q.rows[0].id);await c.query("SELECT record_login($1)",[q.rows[0].id]);const onboarded=(await c.query("SELECT onboarding_completed FROM profiles WHERE user_id=$1",[q.rows[0].id])).rows[0]?.onboarding_completed;redirect(onboarded?"/home":"/onboarding")}finally{c.release()}}
export async function logout(){
  await withProfile(async c => { await c.query("DELETE FROM auth_sessions WHERE token_hash=current_setting('app.session_hash')"); return true; });
  (await cookies()).delete(SESSION_COOKIE); redirect("/");
}
export async function saveOnboarding(f:FormData){
  const fields=["feeling","avoid","routine","style","accent","tone"];
  const answers=Object.fromEntries(fields.map(k=>[k,String(f.get(k)||"").trim()]));
  if(!answers.feeling||!answers.avoid) bounce("/onboarding","Preencha as respostas obrigatórias.");
  const tokens={accent:resolveAccent(answers.accent),tone:answers.tone||"acolhedor",density:"equilibrada"};
  const avatar=f.get("avatar");
  const hasAvatar=avatar instanceof File && avatar.size>0;
  if(hasAvatar&&!(avatar as File).type.startsWith("image/")) bounce("/onboarding","Envie um arquivo de imagem pra foto.");
  const avatarBuf=hasAvatar?Buffer.from(await (avatar as File).arrayBuffer()):null;
  const bodyPhoto=f.get("body_photo");
  const bodyConsent=f.get("body_photo_consent")==="on";
  const hasBodyPhoto=bodyPhoto instanceof File && bodyPhoto.size>0 && bodyConsent;
  if(hasBodyPhoto&&!(bodyPhoto as File).type.startsWith("image/")) bounce("/onboarding","Envie um arquivo de imagem pra foto de corpo.");
  const bodyPhotoBuf=hasBodyPhoto?Buffer.from(await (bodyPhoto as File).arrayBuffer()):null;
  const saved=await withProfile(async(c,id)=>{
    let avatarKey:string|null=null;
    if(hasAvatar&&avatarBuf){
      avatarKey=`avatars/${id}-${Date.now()}`;
      await store.putObject(process.env.S3_BUCKET||"closet-private",avatarKey,avatarBuf,avatarBuf.length,{"Content-Type":(avatar as File).type});
    }
    let bodyPhotoKey:string|null=null;
    if(hasBodyPhoto&&bodyPhotoBuf){
      bodyPhotoKey=`avatars/${id}-body-${Date.now()}`;
      await store.putObject(process.env.S3_BUCKET||"closet-private",bodyPhotoKey,bodyPhotoBuf,bodyPhotoBuf.length,{"Content-Type":(bodyPhoto as File).type});
    }
    const q=await c.query(
      "UPDATE profiles SET answers=$1,experience_tokens=$2,onboarding_completed=true"
      +(avatarKey?",avatar_object_key=$4,avatar_content_type=$5":"")
      +(bodyPhotoKey?",body_photo_object_key=$6,body_photo_content_type=$7,body_photo_consent_at=now()":"")
      +",updated_at=now() WHERE user_id=$3 RETURNING user_id",
      [answers,tokens,id,
        ...(avatarKey?[avatarKey,(avatar as File).type]:(bodyPhotoKey?[null,null]:[])),
        ...(bodyPhotoKey?[bodyPhotoKey,(bodyPhoto as File).type]:[]),
      ],
    );
    if(q.rowCount!==1) bounce("/onboarding","Não foi possível salvar seu perfil.");
    if(bodyPhotoKey) await generateBodyAvatar(c,id,bodyPhotoKey,(bodyPhoto as File).type);
    return true;
  });
  if(!saved) redirect("/");
  redirect("/home");
}
