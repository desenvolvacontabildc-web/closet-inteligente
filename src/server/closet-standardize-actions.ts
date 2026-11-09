"use server";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { flash } from "./flash";
import { runStandardizeBatch, isStandardizing, standardizeItem, standardAllowance } from "./closet-standardize";

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

/** Botão na tela da peça: gera (ou refaz) a foto de catálogo daquela peça, dentro da cota mensal do plano. */
export async function standardizeOneItem(f: FormData) {
  const id = String(f.get("item_id") || "");
  const back = `/closet/${id}`;
  if (!/^[0-9a-f-]{36}$/i.test(id)) bounce("/closet", "Peça inválida.");
  const ctx = await withProfile(async (c, userId) => {
    const tenantId = (await c.query("SELECT current_setting('app.tenant_id') t")).rows[0].t as string;
    const has = (await c.query("SELECT 1 FROM closet_item_photos WHERE item_id=$1 LIMIT 1", [id])).rowCount;
    const allowance = await standardAllowance(c, userId);
    return { userId, tenantId, has: !!has, allowance };
  });
  if (!ctx) redirect("/");
  if (!ctx.has) bounce(back, "Envie uma foto da peça primeiro.");
  if (!ctx.allowance.ok) bounce(back, `Você já usou as ${ctx.allowance.limit} fotos de catálogo do seu plano neste mês e não tem créditos. Compre créditos em Assinatura → Extras, ou espere o próximo mês.`);
  const r = await standardizeItem({ userId: ctx.userId, tenantId: ctx.tenantId }, id);
  if (!r.ok) bounce(back, "Não consegui gerar a foto de catálogo agora. Tente de novo em instantes.");
  await flash("Foto de catálogo pronta.");
  redirect(back);
}
