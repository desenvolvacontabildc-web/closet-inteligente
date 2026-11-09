"use client";
import { useState, useTransition } from "react";
import { setSkinStep } from "@/server/skin-actions";

export type ChecklistStep = { id: string; tipo: string; titulo: string; como_fazer: string; preferir: string[]; evitar: string[]; exemplos: string[]; done: boolean; note?: string };

/** Lista de etapas do período (manhã ou noite) com marcação instantânea: o toque muda na hora e salva em segundo
 * plano; se o salvamento falhar, volta ao estado anterior e avisa. */
export default function SkinChecklist({ routineId, day, steps }: { routineId: string; day: string; steps: ChecklistStep[] }) {
  const [done, setDone] = useState<Record<string, boolean>>(() => Object.fromEntries(steps.map((s) => [s.id, s.done])));
  const [error, setError] = useState("");
  const [, start] = useTransition();
  const count = steps.filter((s) => done[s.id]).length;

  const toggle = (id: string) => {
    const next = !done[id];
    setError("");
    setDone((d) => ({ ...d, [id]: next }));
    const w = window as unknown as { __quietActions?: number };
    w.__quietActions = (w.__quietActions || 0) + 1; // evita o aviso "Processando…" a cada toque
    start(async () => {
      let ok = false;
      try { ok = (await setSkinStep(routineId, id, day, next)).ok; } catch { ok = false; }
      w.__quietActions = Math.max(0, (w.__quietActions || 1) - 1);
      if (!ok) { setDone((d) => ({ ...d, [id]: !next })); setError("Não foi possível salvar. Verifique a conexão e tente de novo."); }
    });
  };

  return <div className="skin-list">
    <p className="look-meta skin-count">{count === steps.length && steps.length > 0 ? "Tudo feito por hoje" : `${count} de ${steps.length} feitas`}</p>
    {steps.map((s) => <div key={s.id} className={`skin-step${done[s.id] ? " done" : ""}`}>
      <button type="button" className="skin-check" aria-pressed={!!done[s.id]} aria-label={`${done[s.id] ? "Desmarcar" : "Marcar"}: ${s.titulo}`} onClick={() => toggle(s.id)}>
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="skin-body">
        <span className="hair-tag">{s.tipo}{s.note ? ` · ${s.note}` : ""}</span>
        <p className="skin-title">{s.titulo}</p>
        <details className="hair-how">
          <summary>Como fazer e o que usar</summary>
          {s.como_fazer && <p>{s.como_fazer}</p>}
          {s.preferir.length > 0 && <p><strong>Prefira produtos que contenham:</strong> {s.preferir.join(", ")}.</p>}
          {s.evitar.length > 0 && <p><strong>Evite:</strong> {s.evitar.join(", ")}.</p>}
          {s.exemplos.length > 0 && <p className="look-meta">Sugestões de referência (confira sempre o rótulo): {s.exemplos.join("; ")}.</p>}
        </details>
      </div>
    </div>)}
    {error && <p role="alert" className="look-meta skin-error">{error}</p>}
  </div>;
}
