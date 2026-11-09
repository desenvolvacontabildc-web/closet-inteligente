import "server-only";
import type { PoolClient } from "pg";
import type { HairPlan, HairStep } from "./hair-options";

export type HairReminder =
  | { state: "DUE"; cycleId: string; step: HairStep & { week: number }; late: boolean; week: number; weeks: number; done: number; total: number }
  | { state: "ONTRACK"; cycleId: string; week: number; weeks: number; done: number; total: number; nextStart: Date }
  | { state: "FINISHED"; done: number; total: number };

/** Lembrete do Cronograma Capilar para a Home: qual é a próxima etapa a fazer. Considera atrasos (etapas
 * de semanas anteriores ainda não marcadas vêm primeiro). Sem ciclo ativo, devolve null (nada a lembrar). */
export async function hairReminder(c: PoolClient): Promise<HairReminder | null> {
  const cy = (await c.query("SELECT id,plan,weeks,started_at,ends_at FROM hair_cycles WHERE status='ACTIVE' LIMIT 1")).rows[0];
  if (!cy) return null;
  const logs = new Set<string>((await c.query("SELECT step_id FROM hair_cycle_logs WHERE cycle_id=$1", [cy.id])).rows.map((r: any) => r.step_id));
  const plan = cy.plan as HairPlan;
  const all = (plan.semanas || []).flatMap((w) => (w.etapas || []).map((e) => ({ ...e, week: w.numero })));
  const done = all.filter((e) => logs.has(e.id)).length, total = all.length;
  const now = Date.now(), started = new Date(cy.started_at).getTime();
  if (!total || done >= total || now > new Date(cy.ends_at).getTime()) return { state: "FINISHED", done, total };
  const week = Math.min(cy.weeks, Math.max(1, Math.floor((now - started) / (7 * 86400000)) + 1));
  const next = all.find((e) => e.week <= week && !logs.has(e.id));
  if (next) return { state: "DUE", cycleId: cy.id, step: next, late: next.week < week, week, weeks: cy.weeks, done, total };
  return { state: "ONTRACK", cycleId: cy.id, week, weeks: cy.weeks, done, total, nextStart: new Date(started + week * 7 * 86400000) };
}
