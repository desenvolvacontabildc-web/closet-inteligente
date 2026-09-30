"use server";
import { redirect } from "next/navigation"; import { randomUUID } from "node:crypto"; import { Client } from "minio"; import { withProfile } from "./profile-session"; import { callVisionAI, writeVisionResult } from "./vision-core"; import { bumpAndCheckAiUsage } from "./limits"; import { bounce } from "./action-error";
const store=new Client({endPoint:(process.env.S3_ENDPOINT||"http://storage:9000").replace(/^https?:\/\//,'').split(':')[0],port:9000,useSSL:false,accessKey:process.env.S3_ACCESS_KEY_ID||"closet-web",secretKey:process.env.S3_SECRET_ACCESS_KEY||""});
export async function photoUrl(key:string){return store.presignedGetObject(process.env.S3_BUCKET||"closet-private",key,900)}
/** Upload roda numa transação curta; a análise automática (só na primeira foto) roda DEPOIS,
 * sem conexão de banco presa durante a chamada à OpenAI. */
export async function uploadPhoto(f:FormData){
  const id=String(f.get("item_id")||""),file=f.get("photo");
  if(!(file instanceof File)||!file.type.startsWith("image/"))bounce(`/closet/${id}`,"Envie uma imagem.");
  const buf=Buffer.from(await file.arrayBuffer()),key=`items/${id}/${randomUUID()}`;
  const prepared=await withProfile(async(c,userId)=>{
    const item=await c.query("SELECT 1 FROM closet_items WHERE id=$1 AND user_id=$2",[id,userId]);
    if(!item.rowCount)bounce("/closet","Peça não encontrada.");
    const existing=await c.query("SELECT count(*) n FROM closet_item_photos WHERE item_id=$1",[id]);
    try{await store.putObject(process.env.S3_BUCKET||"closet-private",key,buf,buf.length,{"Content-Type":file.type})}
    catch(e){console.error("uploadPhoto putObject falhou:",e);bounce(`/closet/${id}`,"Não foi possível enviar a foto agora. Tente de novo em instantes.")}
    await c.query("INSERT INTO closet_item_photos(item_id,tenant_id,user_id,object_key,content_type) VALUES($1,current_setting('app.tenant_id')::uuid,$2,$3,$4)",[id,userId,key,file.type]);
    let dataUrl:string|null=null;
    if(Number(existing.rows[0].n)===0){
      if(!process.env.OPENAI_API_KEY){
        console.error("uploadPhoto: OPENAI_API_KEY ausente, pulando análise automática.");
      }else{
        const budget=await bumpAndCheckAiUsage(c,userId);
        if(!budget.ok)console.error("uploadPhoto: orçamento de IA esgotado, pulando análise automática:",budget.message);
        else dataUrl=`data:${file.type};base64,${buf.toString("base64")}`;
      }
    }
    return {dataUrl};
  });
  if(prepared?.dataUrl){
    const result=await callVisionAI(prepared.dataUrl);
    if(result.ok)await withProfile(async(c,userId)=>{await writeVisionResult(c,userId,id,result.parsed);return true});
    else console.error("uploadPhoto: análise automática falhou:",result.message);
  }
  redirect(`/closet/${id}`);
}
export async function confirmPhoto(f:FormData){const id=String(f.get("photo_id")||""),item=String(f.get("item_id")||"");await withProfile(async(c,userId)=>{await c.query("UPDATE closet_item_photos SET confidence='CONFIRMED' WHERE id=$1 AND item_id=$2 AND user_id=$3",[id,item,userId]);return true});redirect(`/closet/${item}`)}
export async function deletePhoto(f:FormData){const id=String(f.get("photo_id")||""),item=String(f.get("item_id")||"");await withProfile(async(c,userId)=>{const q=await c.query("DELETE FROM closet_item_photos WHERE id=$1 AND item_id=$2 AND user_id=$3 RETURNING object_key",[id,item,userId]);if(q.rowCount){try{await store.removeObject(process.env.S3_BUCKET||"closet-private",q.rows[0].object_key)}catch(e){console.error("deletePhoto removeObject falhou:",e);bounce(`/closet/${item}`,"Não foi possível excluir a foto agora. Tente de novo em instantes.")}}return true});redirect(`/closet/${item}`)}
