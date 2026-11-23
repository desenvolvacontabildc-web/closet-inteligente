import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { generateJokerSuggestions } from "@/server/joker-actions";
import { dayStr } from "@/server/skin-options";
import SubmitButton from "@/components/submit-button";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
type Piece = { name: string; category: string; color: string; why: string; goes_with: string[]; tip: string };

export default async function Coringas({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const today = dayStr();
  const month = `${today.slice(0, 8)}01`;
  const mIdx = Number(today.slice(5, 7)) - 1;
  const nextMonth = MESES[(mIdx + 1) % 12];
  const data = await withProfile(async (c) => {
    const list = (await c.query("SELECT month::text AS month, intro, pieces FROM joker_suggestions ORDER BY month DESC LIMIT 4")).rows as { month: string; intro: string; pieces: Piece[] }[];
    const n = Number((await c.query("SELECT count(*) n FROM closet_items WHERE status='ACTIVE'")).rows[0].n);
    return { list, n };
  });
  if (!data) redirect("/");
  const current = data.list.find((l) => l.month.slice(0, 10) === month) || null;
  const older = data.list.filter((l) => l !== current);

  return <main className="shell narrow">
    <Link href="/home">← Início</Link>
    <span className="eyebrow">COMPRAS CORINGA</span>
    <h1>O que comprar para o seu closet</h1>
    <p className="look-meta">Uma vez por mês eu indico poucas peças que combinam com o que você já tem, do seu estilo, da estação e da moda atual. Compra consciente: só o que realmente vai render looks.</p>
    {sp.error && <p role="alert" className="trial-banner">{sp.error}</p>}

    {current ? <section>
      <div className="section-head"><h2>Sugestões de {MESES[Number(current.month.slice(5, 7)) - 1]}</h2></div>
      {current.intro && <p className="look-meta">{current.intro}</p>}
      {current.pieces.map((p, i) => <article className="card joker-card" key={i}>
        <h3>{p.name}</h3>
        <div className="joker-tags"><span>{p.category}</span>{p.color && <span>{p.color}</span>}</div>
        {p.why && <p>{p.why}</p>}
        {p.goes_with.length > 0 && <p className="look-meta"><strong>Combina com o que você já tem:</strong> {p.goes_with.join(", ")}.</p>}
        {p.tip && <p className="look-meta">{p.tip}</p>}
      </article>)}
      <p className="look-meta">As próximas sugestões ficam prontas em {nextMonth}. Quer ver o que fica bem em looks completos agora? <Link href="/looks/comprar">Montar looks com peças novas</Link></p>
    </section> : <section className="card start-card">
      <h2>As sugestões de {MESES[mIdx]}</h2>
      {data.n < 3
        ? <><p className="look-meta">Cadastre pelo menos 3 peças para eu saber o que combina com o seu closet.</p><div className="action-row"><Link href="/closet/rapido"><button type="button">Cadastrar peças</button></Link></div></>
        : <form action={generateJokerSuggestions}>
          <p className="look-meta">Eu olho as suas {data.n} peças, o seu estilo, a estação e a moda de agora e indico de 3 a 5 coringas. Fica pronto em instantes e usa 1 operação de IA.</p>
          <SubmitButton pendingText="Montando as suas sugestões... (até 30s)">Ver as sugestões de {MESES[mIdx]}</SubmitButton>
        </form>}
    </section>}

    {older.length > 0 && <details className="more">
      <summary>Meses anteriores</summary>
      {older.map((l) => <div key={l.month}>
        <h3>{MESES[Number(l.month.slice(5, 7)) - 1]}</h3>
        <ul>{l.pieces.map((p, i) => <li key={i}>{p.name}{p.color ? ` (${p.color})` : ""}</li>)}</ul>
      </div>)}
    </details>}
  </main>;
}
