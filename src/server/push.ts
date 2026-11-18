import "server-only";
import { setVapidDetails, sendNotification } from "web-push";
import type { PoolClient } from "pg";
import { getPool } from "./db";
import { skinReminder } from "./skin-progress";
import { hairReminder } from "./hair-progress";
import { dayStr, hourNow } from "./skin-options";

/** Notificações no celular (Web Push) e lembretes automáticos. O laço roda dentro do próprio servidor do app. */
let configured = false;
function configure(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  setVapidDetails(process.env.APP_URL || "https://closet.desenvolvacontabil.com.br", pub, priv);
  configured = true;
  return true;
}
export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export type Reminder = { kind: string; title: string; body: string; url: string };
type Target = { user_id: string; endpoint: string; p256dh: string; auth: string };

async function sendOne(t: Target, r: { title: string; body: string; url: string }): Promise<void> {
  try {
    await sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, JSON.stringify({ title: r.title, body: r.body, url: r.url }), { TTL: 60 * 60 * 12 });
  } catch (e: any) {
    if (e?.statusCode === 404 || e?.statusCode === 410) await getPool().query("SELECT delete_push_endpoint($1)", [t.endpoint]);
    else console.error("push: falha ao enviar:", e?.statusCode || e?.message);
  }
}

async function inUserTx<T>(userId: string, tenantId: string, work: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.user_id',$1,true),set_config('app.tenant_id',$2,true)", [userId, tenantId]);
    const r = await work(c);
    await c.query("COMMIT");
    return r;
  } catch (e) { try { await c.query("ROLLBACK"); } catch { /* conexão descartada */ } throw e; }
  finally { c.release(); }
}

/** Lembretes que fazem sentido para esta usuária agora. `hour` é a hora local (Recife); com `force` ignora a hora (simulação). */
export async function remindersFor(userId: string, hour: number, force = false): Promise<Reminder[]> {
  const pool = getPool();
  const tenant = (await pool.query("SELECT tenant_id FROM tenant_memberships WHERE user_id=$1 LIMIT 1", [userId])).rows[0]?.tenant_id as string | undefined;
  const sub = (await pool.query("SELECT * FROM my_subscription($1)", [userId])).rows[0];
  const out: Reminder[] = [];
  const now = Date.now();

  if ((force || hour === 10) && sub) {
    const ends = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : null;
    if (sub.status === "TRIAL" && ends && ends > now && ends - now <= 40 * 3600000) {
      const today = ends - now <= 24 * 3600000;
      out.push({ kind: "TRIAL_ENDING", title: today ? "Seu teste grátis termina hoje" : "Seu teste grátis termina amanhã", body: "Escolha um plano para continuar usando o seu closet. Tudo o que você cadastrou fica guardado.", url: "/assinatura" });
    }
    if (sub.status === "TRIAL_EXPIRED" && ends && now - ends <= 48 * 3600000) {
      out.push({ kind: "TRIAL_ENDED", title: "Seu teste grátis terminou", body: "Escolha um plano para voltar a usar o Closet. Suas peças e looks continuam guardados.", url: "/assinatura" });
    }
    if (sub.payment_method === "PIX" && sub.current_period_end && ["ACTIVE", "PAST_DUE"].includes(String(sub.status))) {
      const days = Math.ceil((new Date(sub.current_period_end).getTime() - now) / 86400000);
      if (days >= 0 && days <= 3) out.push({ kind: "PIX_DUE", title: days === 0 ? "Seu Pix vence hoje" : `Seu Pix vence em ${days} dia${days === 1 ? "" : "s"}`, body: "Renove para manter o acesso ao seu closet. É só abrir a tela Assinatura.", url: "/assinatura" });
      if (days < 0 && days >= -5) out.push({ kind: "PIX_OVERDUE", title: "Seu Pix venceu", body: `Regularize em até ${5 + days} dia${5 + days === 1 ? "" : "s"} para não ter o acesso suspenso.`, url: "/assinatura" });
    }
  }

  if ((force || hour === 20) && (force || new Date(`${dayStr()}T12:00:00Z`).getUTCDay() === 0) && tenant) {
    const w = await inUserTx(userId, tenant, async (c) => (await c.query(`SELECT (SELECT count(*) FROM looks WHERE status='WORN' AND worn_at>now()-interval '7 days')::int usados,
      (SELECT count(*) FROM closet_items WHERE status='ACTIVE')::int pecas`)).rows[0] as { usados: number; pecas: number });
    if (w.pecas > 0) out.push({ kind: "WEEKLY", title: w.usados > 0 ? `Sua semana: ${w.usados} look${w.usados === 1 ? "" : "s"} usado${w.usados === 1 ? "" : "s"}` : "Que tal planejar a semana?", body: w.usados > 0 ? "Veja o resumo da semana e deixe os looks de amanhã prontos." : "Monte os looks dos próximos dias em poucos minutos.", url: "/home" });
  }
  const wantSkinAm = force || hour === 9, wantSkinPm = force || hour === 20, wantHair = force || hour === 9;
  if (tenant && (wantSkinAm || wantSkinPm || wantHair)) {
    await inUserTx(userId, tenant, async (c) => {
      if (wantSkinAm || wantSkinPm) {
        const sk = await skinReminder(c);
        if (sk?.steps) {
          const am = sk.steps.period === "AM";
          if ((am && wantSkinAm) || (!am && wantSkinPm)) out.push({ kind: am ? "SKIN_AM" : "SKIN_PM", title: am ? "Hora da sua rotina de skincare" : "Rotina de skincare da noite", body: `${sk.steps.next.titulo}. ${sk.steps.done} de ${sk.steps.total} etapas feitas hoje.`, url: "/cuidese/skincare" });
        }
      }
      if (wantHair) {
        const h = await hairReminder(c);
        if (h?.state === "DUE") out.push({ kind: "HAIR_DUE", title: h.late ? "Etapa do cabelo atrasada" : "Hoje é dia de cuidar do cabelo", body: `${h.step.titulo} (semana ${h.week} de ${h.weeks}).`, url: "/cuidese/cronograma" });
      }
    });
  }
  return out;
}

/** Roda os lembretes. `dry` só simula (não envia nem marca como enviado); `force` ignora a hora do dia. */
export async function runReminders(opts: { dry?: boolean; force?: boolean } = {}): Promise<{ userId: string; kind: string; title: string; devices: number }[]> {
  const hour = hourNow();
  if (!opts.force && ![9, 10, 20].includes(hour)) return [];
  if (!opts.dry && !configure()) return [];
  const pool = getPool();
  const targets = (await pool.query("SELECT * FROM push_targets()")).rows as Target[];
  const byUser = new Map<string, Target[]>();
  for (const t of targets) byUser.set(t.user_id, [...(byUser.get(t.user_id) || []), t]);
  const sent: { userId: string; kind: string; title: string; devices: number }[] = [];
  for (const [userId, devs] of byUser) {
    let list: Reminder[] = [];
    try { list = await remindersFor(userId, hour, opts.force); } catch (e) { console.error("push: lembretes de uma usuária falharam:", e); continue; }
    for (const r of list) {
      if (!opts.dry) {
        const isNew = (await pool.query("SELECT push_mark($1,$2,$3::date) n", [userId, r.kind, dayStr()])).rows[0]?.n === true;
        if (!isNew) continue;
        await Promise.all(devs.map((d) => sendOne(d, r)));
      }
      sent.push({ userId, kind: r.kind, title: r.title, devices: devs.length });
    }
  }
  return sent;
}

/** Notificação de teste para as inscrições de uma usuária (botão da administradora). */
export async function sendTestToUser(userId: string): Promise<number> {
  if (!configure()) return 0;
  const targets = ((await getPool().query("SELECT * FROM push_targets()")).rows as Target[]).filter((t) => t.user_id === userId);
  await Promise.all(targets.map((t) => sendOne(t, { title: "Teste do Closet Inteligente", body: "Se você está vendo isto, as notificações estão funcionando.", url: "/home" })));
  return targets.length;
}

let started = false;
export function startReminderLoop(): void {
  if (started || process.env.NODE_ENV !== "production" || !pushConfigured()) return;
  started = true;
  setInterval(() => { runReminders().catch((e) => console.error("lembretes falharam:", e)); }, 5 * 60 * 1000);
  console.log("lembretes: laço iniciado (a cada 5 minutos, nos horários 9h, 10h e 20h de Recife)");
}
