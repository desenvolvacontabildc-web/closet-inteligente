import Link from "next/link";
import { adminListAccounts } from "@/server/admin-actions";
import { STATUS_LABEL, PLAN_LABEL } from "../labels";

const FILTERS = [
  { key: "todas", label: "Todas" },
  { key: "atencao", label: "Precisam de atenção" },
  { key: "teste", label: "Em teste" },
  { key: "ativas", label: "Ativas" },
  { key: "suspensas", label: "Suspensas/bloqueadas" },
];
const matches = (a: any, f: string) =>
  f === "atencao" ? ["PAST_DUE", "SUSPENDED", "TRIAL_EXPIRED"].includes(a.sub_status)
  : f === "teste" ? a.sub_status === "TRIAL"
  : f === "ativas" ? a.sub_status === "ACTIVE"
  : f === "suspensas" ? ["SUSPENDED", "BLOCKED", "CANCELED"].includes(a.sub_status)
  : true;

export default async function Usuarias({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const { f: fRaw, q: qRaw } = await searchParams;
  const f = FILTERS.some((x) => x.key === fRaw) ? fRaw! : "todas";
  const q = String(qRaw || "").trim().toLowerCase();
  const { accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;

  const list = accounts.filter((a: any) => matches(a, f) && (!q || `${a.display_name || ""} ${a.email}`.toLowerCase().includes(q)));
  const count = (key: string) => accounts.filter((a: any) => matches(a, key)).length;

  return <main className="shell narrow">
    <h1>Usuárias</h1>
    <form method="get" className="form">
      <input type="hidden" name="f" value={f} />
      <input name="q" placeholder="Buscar por nome ou e-mail" defaultValue={qRaw || ""} />
      <button>Buscar</button>
    </form>
    <nav className="action-row">
      {FILTERS.map((x) => <Link key={x.key} href={`/admin/usuarias?f=${x.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={f === x.key ? "active" : ""}>{x.label} ({count(x.key)})</Link>)}
    </nav>
    {list.length === 0 ? <p className="look-meta">Nenhuma usuária nesse filtro.</p> : list.map((a: any) => {
      const dueDays = a.current_period_end ? Math.ceil((new Date(a.current_period_end).getTime() - Date.now()) / 86400000) : null;
      return <Link key={a.user_id} href={`/admin/usuarias/${a.user_id}`} className="user-row">
        <span>
          <strong>{a.display_name || "(sem nome)"}</strong>{a.is_admin && " · administradora"}
          <small>{a.email}</small>
          <small>
            {a.last_login_at ? `Último acesso ${new Date(a.last_login_at).toLocaleDateString("pt-BR")}` : "Nunca fez login"} · {a.closet_count} peça{a.closet_count === 1 ? "" : "s"} · {a.looks_count} look{a.looks_count === 1 ? "" : "s"}
          </small>
          {a.provider === "MERCADOPAGO" && dueDays !== null && <small>{a.payment_method === "CARD" ? "Cartão recorrente" : "Pix"} · {dueDays >= 0 ? `renova em ${dueDays} dia${dueDays === 1 ? "" : "s"}` : `vencido há ${-dueDays} dia${dueDays === -1 ? "" : "s"}`}</small>}
        </span>
        <span style={{ textAlign: "right" }}>
          <span className={`chip chip-${a.sub_status}`}>{STATUS_LABEL[a.sub_status] || a.sub_status}</span>
          <small>{a.sub_status === "TRIAL" ? "Teste gratuito" : PLAN_LABEL[a.plan] || a.plan}</small>
        </span>
      </Link>;
    })}
  </main>;
}
