import type { ReactNode } from "react";

export type QOpt = { value: string; label: string };

/** Opções do questionário como "chips" (radio ou checkbox). Componente de servidor, sem estado. */
export function Chips({ name, options, value, multiple }: { name: string; options: QOpt[]; value?: string | string[]; multiple?: boolean }) {
  const sel = new Set(Array.isArray(value) ? value : value ? [value] : []);
  return <div className="chip-group">
    {options.map((o) => <label key={o.value} className="chip">
      <input type={multiple ? "checkbox" : "radio"} name={name} value={o.value} defaultChecked={sel.has(o.value)} />
      <span>{o.label}</span>
    </label>)}
  </div>;
}

export function Question({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <div className="hair-q">
    <p className="hair-q-title">{title}</p>
    {hint && <p className="look-meta">{hint}</p>}
    {children}
  </div>;
}
