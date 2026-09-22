"use server";
import { randomBytes, createHash, scrypt as sc } from "node:crypto";
import { promisify } from "node:util";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
const scrypt=promisify(sc);
async function makeHash(p:string){const salt=randomBytes(16),key=await scrypt(p,salt,64) as Buffer;return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`}
export async function adminListAccounts(){
  const result=await withProfile(async(c,userId)=>{
    try{const q=await c.query("SELECT * FROM admin_list_accounts($1)",[userId]);return{actorId:userId,accounts:q.rows}}
    catch(e){console.error("adminListAccounts falhou:",e);return{actorId:userId,accounts:null}}
  });
  if(!result)redirect("/");
  return result;
}
export async function setSubscription(f:FormData){
  const target=String(f.get("user_id")||""),status=String(f.get("status")||"ACTIVE"),plan=String(f.get("plan")||"ARRUMADA");
  const feeReais=Number(String(f.get("fee")||"0").replace(",","."))||0;
  const discountReais=Number(String(f.get("discount")||"0").replace(",","."))||0;
  const notes=String(f.get("notes")||"").trim();
  await withProfile(async(c,userId)=>{
    await c.query("SELECT admin_set_subscription($1,$2,$3,$4,$5,$6,$7)",
      [userId,target,status,Math.round(feeReais*100),Math.round(discountReais*100),notes,plan]);
    return true;
  });
  redirect("/admin");
}
export async function resetPassword(f:FormData){
  const target=String(f.get("user_id")||"");
  const temp=randomBytes(9).toString("base64url");
  const hash=await makeHash(temp);
  await withProfile(async(c,userId)=>{
    await c.query("SELECT admin_reset_password($1,$2,$3)",[userId,target,hash]);
    return true;
  });
  redirect(`/admin?temp=${encodeURIComponent(temp)}&for=${encodeURIComponent(target)}`);
}
