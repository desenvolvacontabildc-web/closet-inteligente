"use server";
import { redirect } from "next/navigation"; import { randomUUID } from "node:crypto"; import { Client } from "minio"; import { withProfile } from "./profile-session"; import { runVisionAnalysis } from "./vision-core";
const store=new Client({endPoint:(process.env.S3_ENDPOINT||"http://storage:9000").replace(/^https?:\/\//,'').split(':')[0],port:9000,useSSL:false,accessKey:process.env.S3_ACCESS_KEY_ID||"closet-web",secretKey:process.env.S3_SECRET_ACCESS_KEY||""});
export async function createItem(f:FormData){
  const name=String(f.get("name")||"").trim(),category=String(f.get("category")||"").trim();
  if(!name||!category)throw new Error("Nome e categoria são obrigatórios.");
  const file=f.get("photo");
  const hasPhoto=file instanceof File && file.size>0;
  if(hasPhoto&&!(file as File).type.startsWith("image/"))throw new Error("Envie um arquivo de imagem.");
  const buf=hasPhoto?Buffer.from(await (file as File).arrayBuffer()):null;
  await withProfile(async(c,userId)=>{
    const n=await c.query("SELECT count(*)::int+1 next FROM closet_items WHERE user_id=$1 AND category=$2",[userId,category]);
    const code=`${category.slice(0,3).toUpperCase()}-${String(n.rows[0].next).padStart(3,"0")}`;
    const item=await c.query(
      "INSERT INTO closet_items(tenant_id,user_id,code,name,category,color,description) VALUES(current_setting('app.tenant_id')::uuid,$1,$2,$3,$4,$5,$6) RETURNING id",
      [userId,code,name,category,String(f.get("color")||""),String(f.get("description")||"")],
    );
    const itemId=item.rows[0].id;
    if(hasPhoto&&buf){
      const key=`items/${itemId}/${randomUUID()}`;
      await store.putObject(process.env.S3_BUCKET||"closet-private",key,buf,buf.length,{"Content-Type":(file as File).type});
      const photo=await c.query(
        "INSERT INTO closet_item_photos(item_id,tenant_id,user_id,object_key,content_type) VALUES($1,current_setting('app.tenant_id')::uuid,$2,$3,$4) RETURNING id",
        [itemId,userId,key,(file as File).type],
      );
      try{await runVisionAnalysis(c,userId,photo.rows[0].id)}catch{/* primeira foto: tentamos identificar automaticamente; falha aqui não deve impedir a criação da peça */}
    }
    return true;
  });
  redirect("/closet");
}
export async function updateItem(f:FormData){const id=String(f.get("id")||"");const confidence=String(f.get("confidence")||"CONFIRMED"),status=String(f.get("status")||"ACTIVE");await withProfile(async(c,userId)=>{await c.query("UPDATE closet_items SET name=$1,category=$2,color=$3,description=$4,photo_url=$5,confidence=$6,status=$7,updated_at=now() WHERE id=$8 AND user_id=$9",[f.get("name"),f.get("category"),f.get("color"),f.get("description"),f.get("photo_url"),confidence,status,id,userId]);return true});redirect(`/closet/${id}`)}
export async function deleteItem(f:FormData){const id=String(f.get("id")||"");await withProfile(async(c,userId)=>{await c.query("DELETE FROM closet_items WHERE id=$1 AND user_id=$2",[id,userId]);return true});redirect("/closet")}
export async function suggestItem(f:FormData){const id=String(f.get("id")||"");await withProfile(async(c,userId)=>{const q=await c.query("SELECT name,category,color FROM closet_items WHERE id=$1 AND user_id=$2",[id,userId]);if(!q.rowCount)throw new Error("Peça não encontrada.");const current=q.rows[0];const text=`${current.name} ${current.category} ${current.color}`.toLowerCase();const category=current.category||(['blazer','camisa','blusa','calça','saia','vestido','sapato','bolsa'].find(x=>text.includes(x))||'');const color=current.color||(['preto','branco','azul','vinho','verde','rosa','marrom','bege'].find(x=>text.includes(x))||'');await c.query("UPDATE closet_items SET category=COALESCE(NULLIF($1,''),category),color=COALESCE(NULLIF($2,''),color),confidence='INFERRED',updated_at=now() WHERE id=$3 AND user_id=$4",[category,color,id,userId]);return true});redirect(`/closet/${id}`)}
