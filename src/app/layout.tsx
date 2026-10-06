import type { Metadata } from "next";
import type { ReactNode } from "react";
import { withProfile } from "@/server/profile-session";
import { resolveAccent } from "@/server/accent";
import BottomNav from "./bottom-nav";
import FlashToast from "@/components/flash-toast";

export const metadata: Metadata = { title: "Closet Inteligente", themeColor: "#a9714c" };

const GRACE_DAYS = 5;
let lastBillingMaintenance = 0; // roda no máximo a cada 10 min por processo (o bloqueio em si é calculado no banco, sem depender disto)

function billingNotice(sub: { status: string; payment_method: string | null; current_period_end: Date | null; overdue_since: Date | null; trial_ends_at: Date | null } | null): string | null {
  if (!sub) return null;
  const days = (d: Date | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null);
  if (sub.status === "PAST_DUE") {
    const from = sub.overdue_since || (sub.payment_method === "PIX" ? sub.current_period_end : null);
    const left = from ? GRACE_DAYS - Math.floor((Date.now() - new Date(from).getTime()) / 86400000) : null;
    return left !== null && left > 0 ? `Seu pagamento está em atraso. Regularize em até ${left} dia${left === 1 ? "" : "s"} para não ter o acesso suspenso.` : "Seu pagamento está em atraso. Regularize hoje para não ter o acesso suspenso.";
  }
  if (sub.status === "ACTIVE" && sub.payment_method === "PIX") {
    const d = days(sub.current_period_end);
    if (d !== null && d >= 0 && d <= 5) return d === 0 ? "Seu Pix vence hoje. Renove para manter o acesso." : `Seu Pix vence em ${d} dia${d === 1 ? "" : "s"}. Renove para manter o acesso.`;
  }
  if (sub.status === "TRIAL") {
    const d = days(sub.trial_ends_at);
    if (d !== null && d >= 0 && d <= 2) return d === 0 ? "Seu teste gratuito termina hoje. Escolha um plano para continuar." : `Seu teste gratuito termina em ${d} dia${d === 1 ? "" : "s"}. Escolha um plano para continuar.`;
  }
  return null;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  let ctx: { experience_tokens: any; isAdmin: boolean; unread: number; status: string; notice: string | null } | null = null;
  try {
    ctx = await withProfile(async (c, userId) => {
      const q = await c.query("SELECT experience_tokens FROM profiles WHERE user_id=$1 AND onboarding_completed", [userId]);
      if (!q.rows[0]) return null;
      const isAdmin = !!(await c.query("SELECT is_admin FROM app_users WHERE id=$1", [userId])).rows[0]?.is_admin;
      if (Date.now() - lastBillingMaintenance > 10 * 60 * 1000) {
        lastBillingMaintenance = Date.now();
        try { await c.query("SELECT run_billing_maintenance()"); } catch (e) { console.error("run_billing_maintenance falhou:", e); }
      }
      const unread = isAdmin ? Number((await c.query("SELECT admin_unread_notifications($1) n", [userId])).rows[0]?.n || 0) : 0;
      const sub = (await c.query("SELECT * FROM my_subscription($1)", [userId])).rows[0] || null;
      return { experience_tokens: q.rows[0].experience_tokens, isAdmin, unread, status: String(sub?.status || "ACTIVE"), notice: billingNotice(sub) };
    }, { allowSuspended: true });
  } catch { /* nunca deixar um erro aqui derrubar o layout inteiro do site */ }
  const accent = resolveAccent(ctx?.experience_tokens?.accent);
  const locked = ctx?.status === "SUSPENDED" || ctx?.status === "TRIAL_EXPIRED";
  return (
    <html lang="pt-BR">
      <body style={{ "--accent": accent } as React.CSSProperties}>
        {ctx?.notice && !locked && <a className="billing-banner" href="/assinatura">{ctx.notice}</a>}
        {children}
        {ctx && !locked && <BottomNav isAdmin={ctx.isAdmin} adminBadge={ctx.unread} />}
        <FlashToast />
      </body>
    </html>
  );
}
import "./globals.css";
