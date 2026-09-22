import { NextResponse } from "next/server";
import { Client } from "minio";
import { withProfile } from "@/server/profile-session";
const storage=new Client({endPoint:(process.env.S3_ENDPOINT||"http://storage:9000").replace(/^https?:\/\//,"").split(":")[0],port:9000,useSSL:false,accessKey:process.env.S3_ACCESS_KEY_ID||"closet-web",secretKey:process.env.S3_SECRET_ACCESS_KEY||""});
async function readStream(stream:NodeJS.ReadableStream){const chunks:Buffer[]=[];for await(const chunk of stream as AsyncIterable<Buffer>)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks)}
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const result=await withProfile(async c=>{
    const q=await c.query("SELECT photo_object_key,photo_content_type FROM looks WHERE id=$1",[id]);
    if(!q.rowCount||!q.rows[0].photo_object_key)return null;
    return {key:q.rows[0].photo_object_key,contentType:q.rows[0].photo_content_type||"image/jpeg"};
  });
  if(!result)return new NextResponse("Não encontrado",{status:404});
  const body=await readStream(await storage.getObject(process.env.S3_BUCKET||"closet-private",result.key));
  return new NextResponse(new Uint8Array(body),{headers:{"Content-Type":result.contentType,"Cache-Control":"private, max-age=300"}});
}
