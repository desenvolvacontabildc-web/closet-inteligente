import "server-only";
import type { PoolClient } from "pg";

// Teste gratuito: looks salvos são ilimitados (como em todos os planos); só a operação de
// IA (raciocínio) tem cota diária.
export const TRIAL_DAILY_AI_LIMIT = 40;

// Planos pagos (nomes voltados à moda). Preço e limites de IA/imagem vivem em plan_config
// (editável pelo admin) -- só os nomes/rank ficam fixos aqui.
export type Plan = "ARRUMADA" | "FASHION" | "SUPER_STAR";
export const PLAN_LABEL: Record<Plan, string> = { ARRUMADA: "Arrumada", FASHION: "Fashion", SUPER_STAR: "Super Star" };
const PLAN_RANK: Record<Plan, number> = { ARRUMADA: 0, FASHION: 1, SUPER_STAR: 2 };

export async function mySubscription(c: PoolClient, userId: string) {
  const sub = (await c.query("SELECT * FROM my_subscription($1)", [userId])).rows[0];
  return {
    status: (sub?.status || "ACTIVE") as string, plan: (sub?.plan || "ARRUMADA") as Plan, trial_ends_at: sub?.trial_ends_at || null,
    current_period_end: (sub?.current_period_end || null) as Date | null, overdue_since: (sub?.overdue_since || null) as Date | null,
    payment_method: (sub?.payment_method || null) as string | null, provider: (sub?.provider || null) as string | null,
  };
}

async function planConfig(c: PoolClient, plan: Plan): Promise<{ ai_ops_monthly_limit: number | null; image_gen_monthly_limit: number | null }> {
  const r = await c.query("SELECT ai_ops_monthly_limit, image_gen_monthly_limit FROM get_plan_config($1)", [plan]);
  return r.rows[0] || { ai_ops_monthly_limit: null, image_gen_monthly_limit: null };
}

/** Ilka é dona/administradora e não deve ter limite de uso. */
async function isUnlimitedAdmin(c: PoolClient, userId: string): Promise<boolean> {
  const r = await c.query("SELECT is_admin FROM app_users WHERE id=$1", [userId]);
  return !!r.rows[0]?.is_admin;
}

/** Teste gratuito para dar gostinho do produto; fora do teste, exige o plano mínimo. */
export function hasPlanAtLeast(sub: { status: string; plan: Plan }, minPlan: Plan): boolean {
  if (sub.status === "TRIAL") return PLAN_RANK.FASHION >= PLAN_RANK[minPlan];
  return PLAN_RANK[sub.plan] >= PLAN_RANK[minPlan];
}

/** Colorimetria é módulo avulso (liberação única, não mensal) -- não depende do plano atual.
 * A administradora tem tudo liberado, independente de módulo concedido. */
export async function hasColorimetria(c: PoolClient, userId: string): Promise<boolean> {
  if (await isUnlimitedAdmin(c, userId)) return true;
  const r = await c.query("SELECT status FROM my_module_status($1,'COLORIMETRIA')", [userId]);
  return ["LIBERADA", "EM_ANALISE", "CONCLUIDA"].includes(r.rows[0]?.status);
}

/** Apenas leitura (não incrementa) — para exibir "restam X operações de IA" na interface. */
export async function aiUsageRemaining(c: PoolClient, userId: string): Promise<number | null> {
  if (await isUnlimitedAdmin(c, userId)) return null;
  const sub = await mySubscription(c, userId);
  if (sub.status === "TRIAL") {
    const used = await c.query("SELECT COALESCE(count,0) n FROM ai_usage WHERE user_id=$1 AND day=current_date", [userId]);
    return Math.max(0, TRIAL_DAILY_AI_LIMIT - Number(used.rows[0]?.n || 0));
  }
  const cfg = await planConfig(c, sub.plan);
  if (cfg.ai_ops_monthly_limit === null) return null;
  const used = await c.query("SELECT COALESCE(SUM(count),0) n FROM ai_usage WHERE user_id=$1 AND day >= date_trunc('month', current_date)::date", [userId]);
  return Math.max(0, cfg.ai_ops_monthly_limit - Number(used.rows[0].n));
}

async function bonusImageCredits(c: PoolClient, userId: string): Promise<number> {
  const r = await c.query("SELECT bonus_image_credits FROM profiles WHERE user_id=$1", [userId]);
  return Number(r.rows[0]?.bonus_image_credits || 0);
}

/** Apenas leitura -- para exibir "restam X gerações de imagem" na interface. Soma o que resta
 * do limite mensal do plano com os créditos bônus (cadastro, marcos de uso, indicação), que
 * não expiram por mês. */
export async function imageGenerationsRemaining(c: PoolClient, userId: string): Promise<number | null> {
  if (await isUnlimitedAdmin(c, userId)) return null;
  const sub = await mySubscription(c, userId);
  const plan: Plan = sub.status === "TRIAL" ? "FASHION" : sub.plan;
  const cfg = await planConfig(c, plan);
  const bonus = await bonusImageCredits(c, userId);
  if (cfg.image_gen_monthly_limit === null) return null;
  const used = Number((await c.query("SELECT count_my_images_this_month($1) n", [userId])).rows[0].n);
  return Math.max(0, cfg.image_gen_monthly_limit - used) + bonus;
}

/** Geração de imagem é seu próprio contador, separado do uso geral de IA (raciocínio/texto).
 * Quando o limite mensal do plano já foi usado, cai pros créditos bônus (cadastro, marcos de
 * uso, indicação) antes de bloquear -- por isso devolve de onde vai sair o crédito, pra
 * `consumeImageAllowance` descontar do lugar certo só quando a geração realmente funcionar. */
export async function checkImageAllowance(c: PoolClient, userId: string): Promise<{ ok: boolean; message?: string; source?: "PLAN" | "BONUS" }> {
  if (await isUnlimitedAdmin(c, userId)) return { ok: true, source: "PLAN" };
  const sub = await mySubscription(c, userId);
  const plan: Plan = sub.status === "TRIAL" ? "FASHION" : sub.plan;
  const cfg = await planConfig(c, plan);
  if (cfg.image_gen_monthly_limit === null) return { ok: true, source: "PLAN" };
  const used = Number((await c.query("SELECT count_my_images_this_month($1) n", [userId])).rows[0].n);
  if (used < cfg.image_gen_monthly_limit) return { ok: true, source: "PLAN" };
  const bonus = await bonusImageCredits(c, userId);
  if (bonus > 0) return { ok: true, source: "BONUS" };
  return { ok: false, message: `Seu plano ${PLAN_LABEL[plan]} permite ${cfg.image_gen_monthly_limit} gerações de imagem por mês. Esse limite já foi atingido — fale com a administradora para comprar mais créditos ou mudar de plano.` };
}

/** Chamar só depois que a geração de imagem funcionou de verdade -- o contador do plano já se
 * ajusta sozinho (conta o log), aqui só precisa descontar 1 crédito bônus quando foi ele que
 * cobriu essa geração. */
export async function consumeImageAllowance(c: PoolClient, userId: string, source?: "PLAN" | "BONUS"): Promise<void> {
  if (source !== "BONUS") return;
  await c.query("UPDATE profiles SET bonus_image_credits = bonus_image_credits - 1 WHERE user_id=$1 AND bonus_image_credits > 0", [userId]);
}

/** Chamado ao abrir a Home -- credita marcos de tempo de uso (1/3/6/12 meses) uma única vez
 * cada, e devolve o que foi concedido agora mesmo (pra mostrar o aviso de "parabéns"). */
export async function checkAndGrantMilestones(c: PoolClient, userId: string): Promise<{ reason: string; credits: number }[]> {
  const r = await c.query("SELECT * FROM check_and_grant_milestones($1)", [userId]);
  return r.rows;
}
export const MILESTONE_LABEL: Record<string, string> = {
  MILESTONE_1M: "1 mês", MILESTONE_3M: "3 meses", MILESTONE_6M: "6 meses", MILESTONE_1Y: "1 ano",
};

/** Incrementa o uso de IA (operações de raciocínio: montar look, avaliar, analisar peça etc.)
 * e diz se ainda está dentro do orçamento do período (dia no teste, mês nos planos pagos). */
export async function bumpAndCheckAiUsage(c: PoolClient, userId: string): Promise<{ ok: boolean; message?: string }> {
  if (await isUnlimitedAdmin(c, userId)) return { ok: true };
  const sub = await mySubscription(c, userId);
  const dayCount = (await c.query(
    "INSERT INTO ai_usage(user_id,tenant_id,day,count) VALUES($1,current_setting('app.tenant_id')::uuid,current_date,1) ON CONFLICT (user_id,day) DO UPDATE SET count=ai_usage.count+1 RETURNING count",
    [userId],
  )).rows[0].count;
  if (sub.status === "TRIAL") {
    if (dayCount > TRIAL_DAILY_AI_LIMIT) return { ok: false, message: `Limite diário de ${TRIAL_DAILY_AI_LIMIT} operações de IA do teste gratuito atingido. Tente novamente amanhã.` };
    return { ok: true };
  }
  const cfg = await planConfig(c, sub.plan);
  if (cfg.ai_ops_monthly_limit === null) return { ok: true };
  const monthly = await c.query("SELECT COALESCE(SUM(count),0) n FROM ai_usage WHERE user_id=$1 AND day >= date_trunc('month', current_date)::date", [userId]);
  if (Number(monthly.rows[0].n) > cfg.ai_ops_monthly_limit) return { ok: false, message: `Seu plano ${PLAN_LABEL[sub.plan]} permite ${cfg.ai_ops_monthly_limit} operações de IA por mês. Esse limite já foi atingido este mês — fale com a administradora para comprar mais créditos ou mudar de plano.` };
  return { ok: true };
}
