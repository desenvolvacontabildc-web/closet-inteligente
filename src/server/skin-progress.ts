import "server-only";
import type { PoolClient } from "pg";
import { dayStr, hourNow, weekdayOf, addDays, stepAppliesOn, type SkinPlan, type SkinStep } from "./skin-options";

export type SkinReminder = {
  routineId: string;
  steps: { period: "AM" | "PM"; total: number; done: number; next: SkinStep } | null;
  review: boolean;
};

/** Lembrete do Skincare para a Home: de manhã (antes das 15h) mostra a rotina da manhã; depois, a da noite.
 * Só aparece se ainda houver etapa pendente ou se já passou da data de reavaliar a pele. Sem rotina ativa: null. */
export async function skinReminder(c: PoolClient): Promise<SkinReminder | null> {
  const rt = (await c.query("SELECT id,plan,review_at FROM skin_routines WHERE status='ACTIVE' LIMIT 1")).rows[0];
  if (!rt) return null;
  const plan = rt.plan as SkinPlan;
  const today = dayStr(), wd = weekdayOf(today);
  const period: "AM" | "PM" = hourNow() < 15 ? "AM" : "PM";
  const list = (period === "AM" ? plan.manha : plan.noite).filter((s) => stepAppliesOn(s, wd));
  const done = new Set<string>((await c.query("SELECT step_id FROM skin_logs WHERE routine_id=$1 AND day=$2::date", [rt.id, today])).rows.map((r: any) => r.step_id));
  const pending = list.filter((s) => !done.has(s.id));
  return {
    routineId: rt.id,
    steps: pending.length ? { period, total: list.length, done: list.length - pending.length, next: pending[0] } : null,
    review: Date.now() > new Date(rt.review_at).getTime(),
  };
}

export type DayStat = { day: string; planned: number; done: number; before: boolean };

/** Resumo dos últimos 7 dias (do mais antigo para hoje) e sequência de dias com a rotina em dia (75% ou mais). */
export function skinStats(plan: SkinPlan, startedAt: Date, logs: { day: string; step_id: string }[]): { week: DayStat[]; streak: number } {
  const today = dayStr();
  const started = dayStr(startedAt);
  const byDay = new Map<string, Set<string>>();
  for (const l of logs) { if (!byDay.has(l.day)) byDay.set(l.day, new Set()); byDay.get(l.day)!.add(l.step_id); }
  const stat = (day: string): DayStat => {
    const wd = weekdayOf(day);
    const ids = [...plan.manha, ...plan.noite].filter((s) => stepAppliesOn(s, wd)).map((s) => s.id);
    const done = ids.filter((id) => byDay.get(day)?.has(id)).length;
    return { day, planned: ids.length, done, before: day < started };
  };
  const week: DayStat[] = [];
  for (let i = 6; i >= 0; i--) week.push(stat(addDays(today, -i)));
  // Sequência: conta para trás a partir de hoje; se hoje ainda não está em dia, começa por ontem (o dia ainda não acabou).
  let streak = 0;
  let d = today;
  const ok = (s: DayStat) => !s.before && s.planned > 0 && s.done / s.planned >= 0.75;
  if (!ok(stat(d))) d = addDays(d, -1);
  for (let i = 0; i < 90; i++) {
    const s = stat(d);
    if (!ok(s)) break;
    streak++;
    d = addDays(d, -1);
  }
  return { week, streak };
}
