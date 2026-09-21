import { NextResponse } from "next/server";
import { Client } from "minio";
import { getPool } from "@/server/db";
const storage=new Client({endPoint:(process.env.S3_ENDPOINT||"http://storage:9000").replace(/^https?:\/\//,"").split(":")[0],port:9000,useSSL:false,accessKey:process.env.S3_ACCESS_KEY_ID||"closet-web",secretKey:process.env.S3_SECRET_ACCESS_KEY||""});
async function readStream(stream:NodeJS.ReadableStream){const chunks:Buffer[]=[];for await(const chunk of stream as AsyncIterable<Buffer>)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks)}
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const c=await getPool().connect();
  let row;
  try{row=(await c.query("SELECT * FROM storefront_item_photo($1)",[id])).rows[0]}finally{c.release()}
  if(!row||!row.object_key)return new NextResponse("Não encontrado",{status:404});
  const body=await readStream(await storage.getObject(process.env.S3_BUCKET||"closet-private",row.object_key));
  return new NextResponse(new Uint8Array(body),{headers:{"Content-Type":row.content_type||"image/jpeg","Cache-Control":"public, max-age=3600"}});
}
