import Link from "next/link";
import { redirect } from "next/navigation";
import { myFeedback, saveFeedback } from "@/server/feedback-actions";
import { FEEDBACK_QUESTIONS } from "@/server/feedback-options";
import { withProfile } from "@/server/profile-session";
import SubmitButton from "@/components/submit-button";

export default async function Feedback({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const me = await withProfile(async (_c, id) => id, { allowSuspended: true });
  if (!me) redirect("/");
  const prev = await myFeedback();
  const get = (id: string) => prev?.[id];

  if (sp.ok === "1") return <main className="shell narrow">
    <span className="eyebrow">OBRIGADA</span>
    <h1>Resposta recebida 💛</h1>
    <p>Sua opinião vai direto para quem está construindo o Closet Inteligente e ajuda a decidir o que melhorar primeiro.</p>
    <Link href="/home"><button type="button">Voltar ao início</button></Link>
  </main>;

  return <main className="shell narrow">
    <Link href="/home">← Início</Link>
    <span className="eyebrow">SUA OPINIÃO IMPORTA</span>
    <h1>Como foi a sua experiência?</h1>
    <p className="look-meta">São 2 minutos. As três primeiras perguntas e a nota de 0 a 10 são as mais importantes; o resto você responde se quiser. {prev ? "Você já respondeu antes: pode atualizar as respostas." : ""}</p>
    {sp.error && <p role="alert" className="trial-banner">{sp.error}</p>}
    <form action={saveFeedback} className="form">
      {FEEDBACK_QUESTIONS.map((q) => <fieldset key={q.id} className="card">
        <legend>{q.label}</legend>
        {q.kind === "scale" && <><div className="scale">{[1, 2, 3, 4, 5].map((n) => <label key={n}><input type="radio" name={q.id} value={n} defaultChecked={get(q.id) === n} />{n}</label>)}</div><p className="look-meta">1 = {q.low} · 5 = {q.high}</p></>}
        {q.kind === "nps" && <div className="scale">{Array.from({ length: 11 }, (_, n) => <label key={n}><input type="radio" name={q.id} value={n} defaultChecked={get(q.id) === n} />{n}</label>)}</div>}
        {q.kind === "choice" && <div className="stack">{q.options.map((o) => <label key={o} className="checkbox"><input type="radio" name={q.id} value={o} defaultChecked={get(q.id) === o} />{o}</label>)}</div>}
        {q.kind === "multi" && <div className="stack">{q.options.map((o) => <label key={o} className="checkbox"><input type="checkbox" name={q.id} value={o} defaultChecked={Array.isArray(get(q.id)) && get(q.id).includes(o)} />{o}</label>)}</div>}
        {q.kind === "text" && <textarea name={q.id} rows={3} maxLength={800} placeholder={q.placeholder} defaultValue={String(get(q.id) || "")} />}
      </fieldset>)}
      <SubmitButton pendingText="Enviando...">Enviar minha opinião</SubmitButton>
    </form>
  </main>;
}
