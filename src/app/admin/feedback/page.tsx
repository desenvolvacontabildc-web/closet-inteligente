import Link from "next/link";
import { adminListAccounts } from "@/server/admin-actions";
import { adminFeedback } from "@/server/feedback-actions";
import { FEEDBACK_QUESTIONS } from "@/server/feedback-options";

const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1).replace(".", ",") : "–");

export default async function AdminFeedback() {
  const { accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  const rows = await adminFeedback();
  const answers = rows.map((r: any) => r.answers || {});
  const nps = answers.map((a: any) => a.nps).filter((n: any) => typeof n === "number") as number[];
  const promoters = nps.filter((n) => n >= 9).length, detractors = nps.filter((n) => n <= 6).length;
  const npsScore = nps.length ? Math.round(((promoters - detractors) / nps.length) * 100) : null;
  const clients = accounts.filter((a: any) => !a.is_admin);

  return <main className="shell">
    <h1>Feedback das testadoras</h1>
    <p className="look-meta">{rows.length} resposta{rows.length === 1 ? "" : "s"} de {clients.length} contas. As testadoras respondem em <strong>/feedback</strong> (há um aviso na tela inicial até responderem). A mensagem com o link está em <Link href="/admin/mensagens">Mensagens</Link>.</p>

    {rows.length === 0 ? <p className="card">Ninguém respondeu ainda.</p> : <>
      <section className="card">
        <h2>Resumo</h2>
        <div className="adm-stats">
          {FEEDBACK_QUESTIONS.filter((q) => q.kind === "scale").map((q) => <div key={q.id}><strong>{avg(answers.map((a: any) => a[q.id]).filter((n: any) => typeof n === "number"))}</strong><small>{q.label} (média de 1 a 5)</small></div>)}
          <div><strong>{npsScore === null ? "–" : npsScore}</strong><small>NPS (de -100 a 100). Nota média {avg(nps)}</small></div>
        </div>
        {FEEDBACK_QUESTIONS.filter((q) => q.kind === "choice" || q.kind === "multi").map((q: any) => {
          const count = new Map<string, number>();
          for (const a of answers) for (const v of ([] as string[]).concat(a[q.id] ?? [])) count.set(v, (count.get(v) || 0) + 1);
          return <div key={q.id}><h3>{q.label}</h3><ul>{q.options.map((o: string) => <li key={o}>{o}: <strong>{count.get(o) || 0}</strong></li>)}</ul></div>;
        })}
      </section>

      <section className="card">
        <h2>O que cada uma escreveu</h2>
        {rows.map((r: any) => <details key={r.user_id} className="more">
          <summary><strong>{r.name}</strong> <small>· nota {r.answers?.nps ?? "–"} · {new Date(r.created_at).toLocaleDateString("pt-BR")}</small></summary>
          {FEEDBACK_QUESTIONS.filter((q) => r.answers?.[q.id] !== undefined).map((q) => <p key={q.id}><small>{q.label}</small><br />{Array.isArray(r.answers[q.id]) ? r.answers[q.id].join(", ") : String(r.answers[q.id])}</p>)}
        </details>)}
      </section>
    </>}
  </main>;
}
