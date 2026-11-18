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
export async function adminStandardLimits(){
  const result=await withProfile(async(c,userId)=>{
    try{return (await c.query("SELECT * FROM admin_list_standard_limits($1)",[userId])).rows}
    catch(e){console.error("adminStandardLimits falhou:",e);return null}
  });
  return result||[];
}
export async function setStandardLimit(f:FormData){
  const plan=String(f.get("plan")||"");
  const raw=String(f.get("limit")||"").trim();
  const limit=raw===""?null:Math.max(0,Math.floor(Number(raw)));
  try{
    await withProfile(async(c,userId)=>{await c.query("SELECT admin_set_standard_limit($1,$2,$3)",[userId,plan,limit]);return true});
  }catch(e){console.error("setStandardLimit falhou:",e);bounce("/admin/precos","Não foi possível salvar o limite.")}
  await flash("Limite de fotos de catálogo salvo.");
  redirect("/admin/precos");
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

export async function adminExtraPrices(){
  const result=await withProfile(async(c,userId)=>{
    try{return (await c.query("SELECT * FROM admin_list_extra_prices($1)",[userId])).rows}
    catch(e){console.error("adminExtraPrices falhou:",e);return null}
  });
  return result||[];
}
export async function setExtraPrice(f:FormData){
  const product=String(f.get("product")||"");
  const promoRaw=String(f.get("promo_price")||"").trim();
  const months=Math.max(0,Math.min(24,Math.floor(Number(f.get("promo_months")||0))));
  const promoCents=promoRaw===""?null:Math.round(reais(promoRaw)*100);
  try{
    await withProfile(async(c,userId)=>{
      await c.query("SELECT admin_set_extra_price($1,$2,$3,$4,$5)",[userId,product,Math.round(reais(f.get("price"))*100),promoCents,months]);
      return true;
    });
  }catch(e){console.error("setExtraPrice falhou:",e);bounce("/admin/precos","Não foi possível salvar o preço do extra.")}
  await flash("Preço do extra salvo. Vale para novas compras.");
  redirect("/admin/precos");
}

export async function adminCreditPacks(){
  const result=await withProfile(async(c,userId)=>{
    try{return (await c.query("SELECT * FROM admin_list_credit_packs($1)",[userId])).rows}
    catch(e){console.error("adminCreditPacks falhou:",e);return null}
  });
  return result||[];
}
export async function setCreditPack(f:FormData){
  let id=String(f.get("id")||"").toUpperCase().replace(/[^A-Z0-9_]/g,"").slice(0,24);
  if(!id)id="PK"+Date.now().toString(36).toUpperCase();
  const label=String(f.get("label")||"").trim().slice(0,40)||id;
  const priceCents=Math.round(reais(f.get("price"))*100);
  const credits=Math.floor(Number(f.get("credits")||0));
  const sort=Math.floor(Number(f.get("sort")||0))||0;
  const active=f.get("active")==="on";
  if(!(priceCents>0)||!(credits>0))bounce("/admin/precos","Informe um preço e uma quantidade de créditos maiores que zero.");
  try{
    await withProfile(async(c,userId)=>{await c.query("SELECT admin_upsert_credit_pack($1,$2,$3,$4,$5,$6,$7)",[userId,id,label,priceCents,credits,sort,active]);return true});
  }catch(e){console.error("setCreditPack falhou:",e);bounce("/admin/precos","Não foi possível salvar o pacote.")}
  await flash("Pacote de créditos salvo.");
  redirect("/admin/precos");
}

/* ---------- ofertas de teste (código de cadastro: preço e dias fixos no Pix) ---------- */
export async function adminListOffers(){
  const result=await withProfile(async(c,userId)=>{
    try{return (await c.query("SELECT * FROM admin_list_offers($1)",[userId])).rows}
    catch(e){console.error("adminListOffers falhou:",e);return null}
  });
  return result||[];
}
export async function adminListRedemptions(){
  const result=await withProfile(async(c,userId)=>{
    try{return (await c.query("SELECT * FROM admin_list_redemptions($1)",[userId])).rows}
    catch(e){console.error("adminListRedemptions falhou:",e);return null}
  });
  return result||[];
}
export async function saveOffer(f:FormData){
  const code=String(f.get("code")||"").trim().toLowerCase();
  const label=String(f.get("label")||"").trim().slice(0,60);
  const plan=String(f.get("plan")||"ARRUMADA");
  const priceCents=Math.round(reais(f.get("price"))*100);
  const days=Math.floor(Number(f.get("days")||7));
  const maxRaw=String(f.get("max_uses")||"").trim();
  const max=maxRaw===""?null:Math.floor(Number(maxRaw));
  const expRaw=String(f.get("expires")||"").trim();
  const expires=/^\d{4}-\d{2}-\d{2}$/.test(expRaw)?`${expRaw}T23:59:59-03:00`:null;
  const active=f.get("active")==="on";
  if(!/^[a-z0-9_-]{3,32}$/.test(code))bounce("/admin/ofertas","O código deve ter de 3 a 32 letras minúsculas, números, - ou _.");
  if(!["ARRUMADA","FASHION","SUPER_STAR"].includes(plan))bounce("/admin/ofertas","Plano inválido.");
  if(!(priceCents>=100&&priceCents<=100000))bounce("/admin/ofertas","O preço deve ficar entre R$ 1,00 e R$ 1.000,00.");
  if(!(days>=1&&days<=90))bounce("/admin/ofertas","A duração deve ficar entre 1 e 90 dias.");
  if(max!==null&&!(max>=1))bounce("/admin/ofertas","O limite de usos deve ser 1 ou mais (ou deixe em branco).");
  try{
    await withProfile(async(c,userId)=>{
      await c.query("SELECT admin_save_offer($1,$2,$3,$4,$5,$6,$7,$8,$9)",[userId,code,label,plan,priceCents,days,max,expires,active]);
      return true;
    });
  }catch(e){console.error("saveOffer falhou:",e);bounce("/admin/ofertas","Não foi possível salvar a oferta.")}
  await flash("Oferta salva.");
  redirect("/admin/ofertas");
}
export async function assignOffer(f:FormData){
  const target=String(f.get("user_id")||"");
  const code=String(f.get("code")||"").trim().toLowerCase();
  let msg="";
  try{
    msg=(await withProfile(async(c,userId)=>(await c.query("SELECT admin_assign_offer($1,$2,$3) m",[userId,target,code])).rows[0].m))||"";
  }catch(e){console.error("assignOffer falhou:",e);bounce("/admin/ofertas","Não foi possível aplicar a oferta.")}
  if(msg)bounce("/admin/ofertas",msg);
  await flash("Oferta aplicada. Ela aparece na tela de Assinatura da usuária.");
  redirect("/admin/ofertas");
}

/* ---------- modo de cadastro (por convite ou aberto) ---------- */
export async function adminSignupMode(){
  const result=await withProfile(async(c)=>{
    try{return (await c.query("SELECT get_signup_mode() m")).rows[0]?.m as string}
    catch(e){console.error("adminSignupMode falhou:",e);return null}
  });
  return result||"INVITE";
}
export async function setSignupMode(f:FormData){
  const mode=String(f.get("mode")||"")==="OPEN"?"OPEN":"INVITE";
  try{
    await withProfile(async(c,userId)=>{await c.query("SELECT admin_set_signup_mode($1,$2)",[userId,mode]);return true});
  }catch(e){console.error("setSignupMode falhou:",e);bounce("/admin/ofertas","Não foi possível alterar o modo de cadastro.")}
  await flash(mode==="OPEN"?"Cadastro aberto para todas.":"Cadastro só por convite.");
  redirect("/admin/ofertas");
}

/* ---------- arquivar contas canceladas (somem das listas, sem perder o historico) ---------- */
export async function adminListArchived(){
  const result=await withProfile(async(c,userId)=>{
    try{return (await c.query("SELECT * FROM admin_list_archived($1)",[userId])).rows.map((r:any)=>String(r.admin_list_archived))}
    catch(e){console.error("adminListArchived falhou:",e);return null}
  });
  return result||[];
}
export async function archiveAccount(f:FormData){
  const target=String(f.get("user_id")||"");
  const archive=String(f.get("archive")||"")==="1";
  let msg="";
  try{
    msg=(await withProfile(async(c,userId)=>(await c.query("SELECT admin_archive_account($1,$2,$3) m",[userId,target,archive])).rows[0].m))||"";
  }catch(e){console.error("archiveAccount falhou:",e);bounce(`/admin/usuarias/${encodeURIComponent(target)}`,"Não foi possível alterar a conta.")}
  if(msg)bounce(`/admin/usuarias/${encodeURIComponent(target)}`,msg);
  await flash(archive?"Conta arquivada: ela saiu das listas.":"Conta restaurada.");
  redirect(archive?"/admin/usuarias":`/admin/usuarias/${encodeURIComponent(target)}`);
}

/* ---------- conta da usuária em modo suporte (somente leitura; cada acesso é registrado) ---------- */
export async function adminAccountView(targetId:string){
  const r=await withProfile(async(c,userId)=>{
    try{
      await c.query("SELECT admin_log_view($1,$2)",[userId,targetId]);
      const summary=(await c.query("SELECT admin_account_summary($1,$2) s",[userId,targetId])).rows[0].s;
      const items=(await c.query("SELECT * FROM admin_account_items($1,$2,200,0)",[userId,targetId])).rows;
      const looks=(await c.query("SELECT * FROM admin_account_looks($1,$2,60)",[userId,targetId])).rows;
      const images=(await c.query("SELECT * FROM admin_account_image_log($1,$2)",[userId,targetId])).rows;
      const trips=(await c.query("SELECT * FROM admin_account_trips($1,$2)",[userId,targetId])).rows;
      return{summary,items,looks,images,trips};
    }catch(e){console.error("adminAccountView falhou:",e);return null}
  });
  return r||null;
}

/* ---------- uso e custos ---------- */
export async function adminUsage(){
  const r=await withProfile(async(c,userId)=>{
    try{
      const users=(await c.query("SELECT * FROM admin_usage_overview($1)",[userId])).rows;
      const months=(await c.query("SELECT * FROM admin_usage_months($1)",[userId])).rows;
      return{users,months};
    }catch(e){console.error("adminUsage falhou:",e);return null}
  });
  return r||{users:[],months:[]};
}

/* ---------- comunicados ---------- */
export async function adminListAnnouncements(){
  const r=await withProfile(async(c,userId)=>{
    try{return (await c.query("SELECT * FROM admin_list_announcements($1)",[userId])).rows}
    catch(e){console.error("adminListAnnouncements falhou:",e);return null}
  });
  return r||[];
}
export async function saveAnnouncement(f:FormData){
  const idRaw=String(f.get("id")||"").trim();
  const id=/^[0-9a-f-]{36}$/i.test(idRaw)?idRaw:null;
  const title=String(f.get("title")||"").trim().slice(0,80);
  const body=String(f.get("body")||"").trim().slice(0,600);
  const audience=["ALL","TRIAL","PAID"].includes(String(f.get("audience")))?String(f.get("audience")):"ALL";
  const endRaw=String(f.get("ends")||"").trim();
  const ends=/^\d{4}-\d{2}-\d{2}$/.test(endRaw)?`${endRaw}T23:59:59-03:00`:null;
  const active=f.get("active")==="on";
  if(!title)bounce("/admin/comunicados","Escreva um título para o comunicado.");
  try{
    await withProfile(async(c,userId)=>{await c.query("SELECT admin_save_announcement($1,$2,$3,$4,$5,$6,$7,$8)",[userId,id,title,body,audience,null,ends,active]);return true});
  }catch(e){console.error("saveAnnouncement falhou:",e);bounce("/admin/comunicados","Não foi possível salvar o comunicado.")}
  await flash("Comunicado salvo.");
  redirect("/admin/comunicados");
}
export async function deleteAnnouncement(f:FormData){
  const id=String(f.get("id")||"");
  if(!/^[0-9a-f-]{36}$/i.test(id))redirect("/admin/comunicados");
  try{await withProfile(async(c,userId)=>{await c.query("SELECT admin_delete_announcement($1,$2)",[userId,id]);return true})}
  catch(e){console.error("deleteAnnouncement falhou:",e);bounce("/admin/comunicados","Não foi possível apagar.")}
  await flash("Comunicado apagado.");
  redirect("/admin/comunicados");
}

/* ---------- chaves do sistema ---------- */
export async function adminImagesPaused(){
  const r=await withProfile(async(c)=>(await c.query("SELECT app_flag('images_paused') v")).rows[0].v==="1");
  return !!r;
}
export async function setImagesPaused(f:FormData){
  const v=f.get("paused")==="1"?"1":"0";
  try{await withProfile(async(c,userId)=>{await c.query("SELECT admin_set_flag($1,'images_paused',$2)",[userId,v]);return true})}
  catch(e){console.error("setImagesPaused falhou:",e);bounce("/admin/sistema","Não foi possível alterar.")}
  await flash(v==="1"?"Geração de imagens pausada para todas as usuárias.":"Geração de imagens liberada de novo.");
  redirect("/admin/sistema");
}

/* ---------- estender o teste gratuito ---------- */
export async function extendTrial(f:FormData){
  const target=String(f.get("user_id")||"");
  const days=Math.floor(Number(f.get("days")||0));
  const back=adminPath(f.get("return_to"),`/admin/usuarias/${encodeURIComponent(target)}`);
  try{await withProfile(async(c,userId)=>{await c.query("SELECT admin_extend_trial($1,$2,$3)",[userId,target,days]);return true})}
  catch(e:any){console.error("extendTrial falhou:",e);bounce(back,String(e?.message||"").includes("Só vale")?"Só vale para contas em teste gratuito (ou com o teste encerrado).":"Informe de 1 a 60 dias.")}
  await flash(`Teste estendido em ${days} dia${days===1?"":"s"}.`);
  redirect(back);
}

/* ---------- lembretes por notificação ---------- */
export async function adminPushStats(){
  const r=await withProfile(async(c,userId)=>{
    try{return (await c.query("SELECT * FROM admin_push_stats($1)",[userId])).rows[0]}
    catch(e){console.error("adminPushStats falhou:",e);return null}
  });
  return r||{devices:0,users:0,sent_7d:0};
}
/** Simula o que seria enviado agora (sem enviar nem marcar como enviado). */
export async function adminPushPreview(){
  const ok=await withProfile(async(c,userId)=>{try{await c.query("SELECT admin_push_stats($1)",[userId]);return true}catch{return false}});
  if(!ok)return[];
  const { runReminders }=await import("./push");
  return runReminders({dry:true,force:true});
}
export async function sendTestPushToMe(){
  const me=await withProfile(async(c,userId)=>{try{await c.query("SELECT admin_push_stats($1)",[userId]);return userId}catch{return null}});
  if(!me)redirect("/admin/sistema");
  const { sendTestToUser }=await import("./push");
  const n=await sendTestToUser(me);
  await flash(n>0?`Notificação de teste enviada para ${n} aparelho${n===1?"":"s"} seu${n===1?"":"s"}.`:"Você ainda não ativou os lembretes em nenhum aparelho. Ative em Perfil → Lembretes no celular.");
  redirect("/admin/sistema");
}

/* ---------- funil de conversão ---------- */
const EMPTY_FUNNEL={cadastros:0,onboarding:0,com_peca:0,com_look:0,look_aprovado:0,voltou:0,com_lembretes:0,pagou:0,ativas:0,em_teste:0,imagens:0,ai_ops:0};
export async function adminFunnel(days:number){
  const r=await withProfile(async(c,userId)=>{
    try{
      const f=(await c.query("SELECT * FROM admin_funnel($1,$2)",[userId,Math.max(0,Math.floor(days)||0)])).rows[0];
      const weeks=(await c.query("SELECT * FROM admin_funnel_weeks($1)",[userId])).rows;
      return{f,weeks};
    }catch(e){console.error("adminFunnel falhou:",e);return null}
  });
  return r||{f:EMPTY_FUNNEL,weeks:[]};
}

/* ---------- grupos: ações em lote ---------- */
const GROUP_KINDS=["TRIAL","PIX","TRIAL_PIX","CARD","ALL"];
const groupKind=(raw:FormDataEntryValue|null)=>GROUP_KINDS.includes(String(raw))?String(raw):"TRIAL";
const groupOffer=(raw:FormDataEntryValue|null)=>/^[a-z0-9_-]{0,32}$/.test(String(raw||"").toLowerCase())?String(raw||"").toLowerCase():"";
const groupBack=(kind:string,offer:string)=>`/admin/grupo?kind=${kind}${offer?`&offer=${encodeURIComponent(offer)}`:""}`;
export async function adminAudience(kind:string,offer:string){
  const r=await withProfile(async(c,userId)=>{
    try{return (await c.query("SELECT * FROM admin_audience($1,$2,$3)",[userId,GROUP_KINDS.includes(kind)?kind:"TRIAL",offer||""])).rows}
    catch(e){console.error("adminAudience falhou:",e);return null}
  });
  return r||[];
}
export async function groupExtend(f:FormData){
  const kind=groupKind(f.get("kind")),offer=groupOffer(f.get("offer")),days=Math.floor(Number(f.get("days")||0));
  const back=groupBack(kind,offer);
  if(!(days>=1&&days<=60))bounce("/admin/grupo","Informe de 1 a 60 dias.");
  let res:any=null;
  try{res=await withProfile(async(c,userId)=>(await c.query("SELECT admin_group_extend($1,$2,$3,$4) r",[userId,kind,offer,days])).rows[0].r)}
  catch(e){console.error("groupExtend falhou:",e);bounce(back,"Não foi possível estender o prazo.")}
  await flash(`Prazo estendido em ${days} dia${days===1?"":"s"}: ${res?.trial??0} em teste grátis e ${res?.pix??0} no Pix. (Cartão recorrente não é alterado.)`);
  redirect(back);
}
export async function groupGrantModule(f:FormData){
  const kind=groupKind(f.get("kind")),offer=groupOffer(f.get("offer")),back=groupBack(kind,offer);
  let n=0;
  try{n=await withProfile(async(c,userId)=>(await c.query("SELECT admin_group_grant_module($1,$2,$3) n",[userId,kind,offer])).rows[0].n)||0}
  catch(e){console.error("groupGrantModule falhou:",e);bounce(back,"Não foi possível liberar a Colorimetria.")}
  await flash(n>0?`Colorimetria liberada para ${n} usuária${n===1?"":"s"} (quem já tinha não mudou).`:"Todas deste grupo já tinham a Colorimetria.");
  redirect(back);
}
export async function groupGrantCredits(f:FormData){
  const kind=groupKind(f.get("kind")),offer=groupOffer(f.get("offer")),back=groupBack(kind,offer);
  const credits=Math.floor(Number(f.get("credits")||0)),note=String(f.get("note")||"").trim().slice(0,120);
  if(!(credits>=1&&credits<=500))bounce(back,"Informe entre 1 e 500 créditos.");
  let n=0;
  try{n=await withProfile(async(c,userId)=>(await c.query("SELECT admin_group_grant_credits($1,$2,$3,$4,$5) n",[userId,kind,offer,credits,note])).rows[0].n)||0}
  catch(e){console.error("groupGrantCredits falhou:",e);bounce(back,"Não foi possível conceder os créditos.")}
  await flash(`${credits} crédito${credits===1?"":"s"} de imagem para ${n} usuária${n===1?"":"s"}.`);
  redirect(back);
}

/* ---------- prazo do Pix, contato, painel de hoje e campanha do cartão ---------- */
export async function extendPeriod(f:FormData){
  const target=String(f.get("user_id")||""),days=Math.floor(Number(f.get("days")||0));
  const back=adminPath(f.get("return_to"),`/admin/usuarias/${encodeURIComponent(target)}`);
  try{await withProfile(async(c,userId)=>{await c.query("SELECT admin_extend_period($1,$2,$3)",[userId,target,days]);return true})}
  catch(e:any){console.error("extendPeriod falhou:",e);bounce(back,String(e?.message||"").includes("Pix")?"Só vale para assinantes que pagam no Pix.":"Informe de 1 a 60 dias.")}
  await flash(`Prazo estendido em ${days} dia${days===1?"":"s"}.`);
  redirect(back);
}
export async function adminContact(target:string){
  const r=await withProfile(async(c,userId)=>{
    try{return (await c.query("SELECT * FROM admin_contact_get($1,$2)",[userId,target])).rows[0]||null}
    catch(e){console.error("adminContact falhou:",e);return null}
  });
  return r||{whatsapp:"",referred_by_name:null};
}
export async function updateContact(f:FormData){
  const target=String(f.get("user_id")||"");
  const back=adminPath(f.get("return_to"),`/admin/usuarias/${encodeURIComponent(target)}`);
  const name=String(f.get("name")||""),email=String(f.get("email")||""),whatsapp=String(f.get("whatsapp")||"");
  let msg="";
  try{msg=await withProfile(async(c,userId)=>String((await c.query("SELECT admin_update_contact($1,$2,$3,$4,$5) m",[userId,target,name,email,whatsapp])).rows[0].m||""))||""}
  catch(e){console.error("updateContact falhou:",e);bounce(back,"Não foi possível salvar os dados.")}
  if(msg)bounce(back,msg);
  await flash("Dados da usuária salvos.");
  redirect(back);
}
export async function adminToday(){
  const r=await withProfile(async(c,userId)=>{
    try{return (await c.query("SELECT * FROM admin_today($1)",[userId])).rows}
    catch(e){console.error("adminToday falhou:",e);return null}
  });
  return r||[];
}
export async function adminCardGift(){
  const r=await withProfile(async(c)=>{try{return (await c.query("SELECT app_flag('card_gift_colorimetria') v")).rows[0].v}catch{return"0"}});
  return r==="1";
}
export async function setCardGift(f:FormData){
  const v=String(f.get("on"))==="1"?"1":"0";
  try{await withProfile(async(c,userId)=>{await c.query("SELECT admin_set_flag($1,'card_gift_colorimetria',$2)",[userId,v]);return true})}
  catch(e){console.error("setCardGift falhou:",e);bounce("/admin/beneficios","Não foi possível salvar.")}
  await flash(v==="1"?"Campanha ligada: quem assinar no cartão recorrente ganha a Colorimetria.":"Campanha desligada. Quem já ganhou continua com a Colorimetria.");
  redirect("/admin/beneficios");
}
