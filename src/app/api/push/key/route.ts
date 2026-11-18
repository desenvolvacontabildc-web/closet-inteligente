import { NextResponse } from "next/server";

/** Chave pública das notificações (não é segredo): o navegador precisa dela para se inscrever. */
export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY || "";
  return NextResponse.json({ key }, { headers: { "Cache-Control": "no-store" } });
}
