"use server";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { scrypt as sc } from "node:crypto";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { flash } from "./flash";
const scrypt=promisify(sc);
async function makeHash(p:string){const salt=randomBytes(16),key=await scrypt(p,salt,64) as Buffer;return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`}

/** Só aceita caminhos internos da área de gestão (evita open redirect via campo escondido). */
function adminPath(raw:FormDataEntryValue|null,fallback:string):string{
  const v=String(raw||"");
  return /^\/admin(\/[A-Za-z0-9_-]+)*$/.test(v)?v:fallback;
}
const reais=(raw:FormDataEntryValue|null)=>Number(String(raw||"0").replace(",","."))||0;

export async function adminListAccounts(){
  const result=await withProfile(async(c,userId)=>{
    try{const q=await c.query("SELECT * FROM admin_list_accounts($1)",[userId]);return{actorId:userId,accounts:q.rows}}
    catch(e){console.error("adminListAccounts falhou:",e);return{actorId:userId,accounts:null}}
  });
  if(!result)redirect("/");
  return result;
}
export async function adminUserOverview(targetId:string){
  const result=await withProfile(async(c,userId)=>{
    try{return (await c.query("SELECT admin_user_overview($1,$2) o",[userId,targetId])).rows[0].o}
    catch(e){console.error("adminUserOverview falhou:",e);return null}
  });
  return result||null;
}
export async function adminListNotifications(){
  const result=await withProfile(async(c,userId)=>{
    try{return (await c.query("SELECT * FROM admin_list_notifications($1)",[userId])).rows}
    catch(e){console.error("adminListNotifications falhou:",e);return null}
  });
  return result||[];
}
export async function markNotificationsRead(){
  await withProfile(async(c,userId)=>{await c.query("SELECT admin_mark_notifications_read($1)",[userId]);return true});
  await flash("Avisos marcados como lidos.");
  redirect("/admin");
}

export async function setSubscription(f:FormData){
  const target=String(f.get("user_id")||""),status=String(f.get("status")||"ACTIVE"),plan=String(f.get("plan")||"ARRUMADA");
  const back=adminPath(f.get("return_to"),`/admin/usuarias/${encodeURIComponent(target)}`);
  const notes=String(f.get("notes")||"").trim();
  try{
    await withProfile(async(c,userId)=>{
      await c.query("SELECT admin_set_subscription($1,$2,$3,$4,$5,$6,$7)",
        [userId,target,status,Math.round(reais(f.get("fee"))*100),Math.round(reais(f.get("discount"))*100),notes,plan]);
      return true;
    });
  }catch(e){console.error("setSubscription falhou:",e);bounce(back,"Não foi possível salvar o plano/status dessa usuária.")}
  await flash("Plano e status salvos.");
  redirect(back);
}
export async function resetPassword(f:FormData){
  const target=String(f.get("user_id")||"");
  const temp=randomBytes(9).toString("base64url");
  const hash=await makeHash(temp);
  await withProfile(async(c,userId)=>{
    await c.query("SELECT admin_reset_password($1,$2,$3)",[userId,target,hash]);
    return true;
  });
  await flash("Senha resetada. Copie a senha temporária mostrada na tela.","info");
  redirect(`/admin/usuarias/${encodeURIComponent(target)}?temp=${encodeURIComponent(temp)}`);
}
export async function recordPayment(f:FormData){
  const target=String(f.get("user_id")||"");
  const back=`/admin/usuarias/${encodeURIComponent(target)}`;
  const amountReais=reais(f.get("amount"));
  const paidAt=String(f.get("paid_at")||"")||new Date().toISOString().slice(0,10);
  const notes=String(f.get("payment_notes")||"").trim();
  if(amountReais<=0)bounce(back,"Informe um valor de pagamento maior que zero.");
  await withProfile(async(c,userId)=>{
    await c.query("SELECT admin_record_payment($1,$2,$3,$4,$5)",[userId,target,Math.round(amountReais*100),paidAt,notes]);
    return true;
  });
  await flash("Pagamento registrado no histórico.");
  redirect(back);
}
export async function adminListAudit(targetUserId:string){
  const result=await withProfile(async(c,userId)=>{
    try{return (await c.query("SELECT * FROM admin_list_audit($1,$2)",[userId,targetUserId])).rows}
    catch(e){console.error("adminListAudit falhou:",e);return null}
  });
  return result||[];
}
export async function adminImageSpend(){
  const result=await withProfile(async(c,userId)=>{
    try{return (await c.query("SELECT * FROM admin_image_spend($1)",[userId])).rows[0]}
    catch(e){console.error("adminImageSpend falhou:",e);return null}
  });
  return result||{month_count:0,estimated_cents:0};
}
export async function adminListPlans(){
  const result=await withProfile(async(c,userId)=>{
    try{return (await c.query("SELECT * FROM admin_list_plans($1)",[userId])).rows}
    catch(e){console.error("adminListPlans falhou:",e);return null}
  });
  return result||[];
}
export async function setPlanConfig(f:FormData){
  const plan=String(f.get("plan")||"");
  const aiLimitRaw=String(f.get("ai_limit")||"").trim();
  const imageLimitRaw=String(f.get("image_limit")||"").trim();
  const aiLimit=aiLimitRaw===""?null:Math.max(0,Math.floor(Number(aiLimitRaw)));
  const imageLimit=imageLimitRaw===""?null:Math.max(0,Math.floor(Number(imageLimitRaw)));
  try{
    await withProfile(async(c,userId)=>{
      await c.query("SELECT admin_set_plan_config($1,$2,$3,$4,$5)",[userId,plan,Math.round(reais(f.get("price"))*100),aiLimit,imageLimit]);
      return true;
    });
  }catch(e){console.error("setPlanConfig falhou:",e);bounce("/admin/precos","Não foi possível salvar o plano.")}
  await flash("Preço e limites do plano salvos. Valem para novas cobranças.");
  redirect("/admin/precos");
}
export async function setPromoConfig(f:FormData){
  const plan=String(f.get("plan")||"");
  const promoRaw=String(f.get("promo_price")||"").trim();
  const months=Math.max(0,Math.min(24,Math.floor(Number(f.get("promo_months")||0))));
  const promoCents=promoRaw===""?null:Math.round(reais(promoRaw)*100);
  try{
    await withProfile(async(c,userId)=>{
      await c.query("SELECT admin_set_promo_config($1,$2,$3,$4)",[userId,plan,promoCents,months]);
      return true;
    });
  }catch(e){console.error("setPromoConfig falhou:",e);bounce("/admin/descontos","Não foi possível salvar o desconto.")}
  await flash("Desconto do cartão salvo. Vale para novas assinaturas.");
  redirect("/admin/descontos");
}
export async function grantModule(f:FormData){
  const target=String(f.get("user_id")||"");
  const module=String(f.get("module")||"COLORIMETRIA");
  const origin=String(f.get("origin")||"CORTESIA_ADMIN");
  const back=adminPath(f.get("return_to"),`/admin/usuarias/${encodeURIComponent(target)}`);
  await withProfile(async(c,userId)=>{
    await c.query("SELECT admin_grant_module($1,$2,$3,$4)",[userId,target,module,origin]);
    return true;
  });
  await flash("Colorimetria liberada para essa usuária.");
  redirect(back);
}
export async function grantCredits(f:FormData){
  const target=String(f.get("user_id")||"");
  const credits=Math.floor(Number(f.get("credits")||0));
  const note=String(f.get("note")||"").trim();
  const back=adminPath(f.get("return_to"),`/admin/usuarias/${encodeURIComponent(target)}`);
  if(!target)bounce(back,"Escolha a usuária.");
  if(!(credits>=1&&credits<=500))bounce(back,"Informe entre 1 e 500 créditos.");
  try{
    await withProfile(async(c,userId)=>{
      await c.query("SELECT admin_grant_credits($1,$2,$3,$4)",[userId,target,credits,note]);
      return true;
    });
  }catch(e){console.error("grantCredits falhou:",e);bounce(back,"Não foi possível conceder os créditos (a usuária já concluiu o cadastro?).")}
  await flash(`${credits} crédito${credits===1?"":"s"} de imagem concedido${credits===1?"":"s"}.`);
  redirect(back);
}
