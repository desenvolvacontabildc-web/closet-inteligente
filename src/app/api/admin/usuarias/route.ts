import { NextResponse } from "next/server";
import { withProfile } from "@/server/profile-session";

const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const STATUS: Record<string, string> = { TRIAL: "Em teste", ACTIVE: "Ativa", PAST_DUE: "Em atraso", SUSPENDED: "Suspensa", TRIAL_EXPIRED: "Teste encerrado", BLOCKED: "Bloqueada", CANCELED: "Cancelada" };
const PLAN: Record<string, string> = { ARRUMADA: "Arrumada", FASHION: "Fashion", SUPER_STAR: "Super Star" };

/** Lista de usuárias em CSV (planilha). Só para a administradora. */
export async function GET() {
  const rows = await withProfile(async (c, userId) => {
    try { return (await c.query("SELECT * FROM admin_list_accounts($1)", [userId])).rows as any[]; } catch { return null; }
  });
  if (!rows) return new NextResponse("Acesso negado", { status: 403 });
  const head = ["Nome", "E-mail", "Cadastro", "Situação", "Plano", "Mensalidade (R$)", "Último acesso", "Peças", "Looks"];
  const lines = rows.filter((a) => !a.is_admin).map((a) => [
    a.display_name, a.email, new Date(a.created_at).toLocaleDateString("pt-BR"), STATUS[a.sub_status] || a.sub_status, PLAN[a.plan] || a.plan,
    (Number(a.monthly_fee_cents || 0) / 100).toFixed(2).replace(".", ","), a.last_login_at ? new Date(a.last_login_at).toLocaleDateString("pt-BR") : "", a.closet_count, a.looks_count,
  ].map(esc).join(";"));
  const csv = "﻿" + [head.join(";"), ...lines].join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="usuarias-closet.csv"', "Cache-Control": "no-store" } });
}
