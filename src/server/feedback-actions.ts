"use server";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { flash } from "./flash";
import { FEEDBACK_QUESTIONS } from "./feedback-options";

const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export async function myFeedback() {
  const r = await withProfile(async (c) => (await c.query("SELECT answers FROM feedback_responses LIMIT 1")).rows[0]?.answers || null, { allowSuspended: true });
  return (r || null) as Record<string, any> | null;
}

export async function saveFeedback(f: FormData) {
  const answers: Record<string, string | number | string[]> = {};
  for (const q of FEEDBACK_QUESTIONS) {
    if (q.kind === "scale") { const n = Number(f.get(q.id)); if (n >= 1 && n <= 5) answers[q.id] = n; }
    else if (q.kind === "nps") { const raw = f.get(q.id); if (raw !== null && raw !== "") { const n = Number(raw); if (n >= 0 && n <= 10) answers[q.id] = n; } }
    else if (q.kind === "choice") { const v = String(f.get(q.id) || ""); if (q.options.includes(v)) answers[q.id] = v; }
    else if (q.kind === "multi") { const vs = f.getAll(q.id).map(String).filter((v) => q.options.includes(v)); if (vs.length) answers[q.id] = vs; }
    else { const t = clip(f.get(q.id), 800); if (t) answers[q.id] = t; }
  }
  if (answers.facil === undefined || answers.looks === undefined || answers.nps === undefined) bounce("/feedback", "Responda ao menos as notas de facilidade, dos looks e a recomendação (0 a 10).");
  const ok = await withProfile(async (c, userId) => {
    await c.query(
      `INSERT INTO feedback_responses(tenant_id,user_id,answers) VALUES (current_setting('app.tenant_id')::uuid,$1,$2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET answers = excluded.answers, updated_at = now()`, [userId, JSON.stringify(answers)]);
    return true;
  }, { allowSuspended: true });
  if (!ok) redirect("/");
  await flash("Obrigada! Sua opinião vai ajudar a deixar o Closet ainda melhor.");
  redirect("/feedback?ok=1");
}

export async function adminFeedback() {
  const r = await withProfile(async (c, userId) => {
    try { return (await c.query("SELECT * FROM admin_feedback_list($1)", [userId])).rows; }
    catch (e) { console.error("adminFeedback falhou:", e); return null; }
  });
  return r || [];
}
