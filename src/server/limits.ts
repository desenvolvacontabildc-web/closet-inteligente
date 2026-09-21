import "server-only";
import type { PoolClient } from "pg";

// Teste gratuito: limites diários fixos (7 dias).
export const TRIAL_DAILY_LOOK_LIMIT = 2;
export const TRIAL_DAILY_AI_LIMIT = 15;

// Planos pagos: limites mensais por plano. null = sem limite.
export const PLAN_MONTHLY_AI_LIMIT: Record<string, number | null> = { ESSENCIAL: 60, ICON: null };
export const PLAN_MONTHLY_LOOK_LIMIT: Record<string, number | null> = { ESSENCIAL: 30, ICON: null };

export async function mySubscription(c: PoolClient, userId: string) {
  const sub = (await c.query("SELECT * FROM my_subscription($1)", [userId])).rows[0];
  return { status: sub?.status || "ACTIVE", plan: sub?.plan || "ESSENCIAL", trial_ends_at: sub?.trial_ends_at || null };
}

async function countLooksThisPeriod(c: PoolClient, monthly: boolean): Promise<number> {
  const cnt = monthly
    ? await c.query("SELECT count(*) n FROM looks WHERE created_at >= date_trunc('month', now())")
    : await c.query("SELECT count(*) n FROM looks WHERE created_at::date = current_date");
  return Number(cnt.rows[0].n);
}

/** Verifica se ainda há cota para criar mais um look. Não faz nenhuma escrita. */
export async function checkLookAllowance(c: PoolClient, userId: string): Promise<{ ok: boolean; remaining: number | null; message?: string }> {
  const sub = await mySubscription(c, userId);
  if (sub.status === "TRIAL") {
    const used = await countLooksThisPeriod(c, false);
    const remaining = Math.max(0, TRIAL_DAILY_LOOK_LIMIT - used);
    if (remaining === 0) return { ok: false, remaining: 0, message: `No teste gratuito, o limite é de ${TRIAL_DAILY_LOOK_LIMIT} looks por dia. Assine para continuar.` };
    return { ok: true, remaining };
  }
  const limit = PLAN_MONTHLY_LOOK_LIMIT[sub.plan] ?? null;
  if (limit === null) return { ok: true, remaining: null };
  const used = await countLooksThisPeriod(c, true);
  const remaining = Math.max(0, limit - used);
  if (remaining === 0) return { ok: false, remaining: 0, message: `Seu plano ${sub.plan} permite ${limit} looks por mês. Esse limite já foi atingido — considere o plano Icon (ilimitado).` };
  return { ok: true, remaining };
}

/** Apenas leitura (não incrementa) — para exibir "restam X" na interface. */
export async function aiUsageRemaining(c: PoolClient, userId: string): Promise<number | null> {
  const sub = await mySubscription(c, userId);
  if (sub.status === "TRIAL") {
    const used = await c.query("SELECT COALESCE(count,0) n FROM ai_usage WHERE user_id=$1 AND day=current_date", [userId]);
    return Math.max(0, TRIAL_DAILY_AI_LIMIT - Number(used.rows[0]?.n || 0));
  }
  const limit = PLAN_MONTHLY_AI_LIMIT[sub.plan] ?? null;
  if (limit === null) return null;
  const used = await c.query("SELECT COALESCE(SUM(count),0) n FROM ai_usage WHERE user_id=$1 AND day >= date_trunc('month', current_date)::date", [userId]);
  return Math.max(0, limit - Number(used.rows[0].n));
}

/** Incrementa o uso de IA do dia e diz se ainda está dentro do orçamento do período (dia no teste, mês nos planos pagos). */
export async function bumpAndCheckAiUsage(c: PoolClient, userId: string): Promise<{ ok: boolean; message?: string }> {
  const sub = await mySubscription(c, userId);
  const dayCount = (await c.query(
    "INSERT INTO ai_usage(user_id,tenant_id,day,count) VALUES($1,current_setting('app.tenant_id')::uuid,current_date,1) ON CONFLICT (user_id,day) DO UPDATE SET count=ai_usage.count+1 RETURNING count",
    [userId],
  )).rows[0].count;
  if (sub.status === "TRIAL") {
    if (dayCount > TRIAL_DAILY_AI_LIMIT) return { ok: false, message: `Limite diário de ${TRIAL_DAILY_AI_LIMIT} usos de IA do teste gratuito atingido. Tente novamente amanhã.` };
    return { ok: true };
  }
  const limit = PLAN_MONTHLY_AI_LIMIT[sub.plan] ?? null;
  if (limit === null) return { ok: true };
  const monthly = await c.query("SELECT COALESCE(SUM(count),0) n FROM ai_usage WHERE user_id=$1 AND day >= date_trunc('month', current_date)::date", [userId]);
  if (Number(monthly.rows[0].n) > limit) return { ok: false, message: `Seu plano ${sub.plan} permite ${limit} usos de IA por mês. Esse limite já foi atingido este mês — considere o plano Icon (ilimitado).` };
  return { ok: true };
}
