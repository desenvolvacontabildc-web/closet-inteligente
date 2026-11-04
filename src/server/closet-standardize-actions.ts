"use server";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { flash } from "./flash";
import { runStandardizeBatch, isStandardizing } from "./closet-standardize";

/** Só a administradora dispara o lote (gasta muitas gerações de imagem de uma vez). Roda em segundo plano:
 * a tela mostra o andamento e dá para sair da página. */
export async function startStandardize(f: FormData) {
  const limit = Math.floor(Number(f.get("limit") || 0)) || undefined;
  const ctx = await withProfile(async (c, userId) => {
    const admin = (await c.query("SELECT is_admin FROM app_users WHERE id=$1", [userId])).rows[0]?.is_admin;
    if (!admin) return { ok: false as const };
    const tenantId = (await c.query("SELECT current_setting('app.tenant_id') t")).rows[0].t as string;
    return { ok: true as const, userId, tenantId };
  });
  if (!ctx) redirect("/");
  if (!ctx.ok) bounce("/closet", "Só a administradora pode padronizar as fotos em lote.");
  if (isStandardizing(ctx.userId)) bounce("/closet", "A padronização já está em andamento. Aguarde terminar.");
  void runStandardizeBatch({ userId: ctx.userId, tenantId: ctx.tenantId }, limit);
  await flash(limit ? `Padronizando ${limit} peça${limit === 1 ? "" : "s"} em segundo plano. Atualize a página para ver o andamento.` : "Padronização iniciada em segundo plano. Pode levar alguns minutos; atualize a página para ver o andamento.", "info");
  redirect("/closet");
}
