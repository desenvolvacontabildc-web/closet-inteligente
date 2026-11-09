"use client";
import { useEffect, useRef } from "react";

/** Formulário longo (questionário) que guarda o rascunho no próprio navegador. Se o envio falhar por qualquer motivo
 * (queda de internet, app atualizado com a tela aberta, erro do servidor) o React limpa os campos; aqui eles voltam
 * sozinhos. O rascunho é apagado pela tela de resultado (<ClearDraft/>) quando o envio dá certo. */
export function DraftForm({ storageKey, action, className, children }: {
  storageKey: string; action: (formData: FormData) => void | Promise<void>; className?: string; children: React.ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    const read = (): Record<string, string[]> | null => {
      try { return JSON.parse(localStorage.getItem(storageKey) || "null"); } catch { return null; }
    };
    const apply = (saved: Record<string, string[]>) => {
      for (const el of Array.from(form.elements) as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[]) {
        const name = el.name;
        if (!name || name.startsWith("$")) continue;
        if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) el.checked = (saved[name] || []).includes(el.value);
        else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "submit")) continue;
          el.value = (saved[name] || [""])[0];
        }
      }
    };
    const save = () => {
      const out: Record<string, string[]> = {};
      new FormData(form).forEach((v, k) => { if (typeof v === "string" && !k.startsWith("$")) (out[k] = out[k] || []).push(v); });
      try { localStorage.setItem(storageKey, JSON.stringify(out)); } catch { /* sem armazenamento: segue sem rascunho */ }
    };
    const onReset = () => { setTimeout(() => { const s = read(); if (s) apply(s); }, 0); };
    const saved = read();
    if (saved) apply(saved);
    form.addEventListener("input", save);
    form.addEventListener("change", save);
    form.addEventListener("reset", onReset);
    return () => { form.removeEventListener("input", save); form.removeEventListener("change", save); form.removeEventListener("reset", onReset); };
  }, [storageKey]);
  return <form ref={ref} action={action} className={className}>{children}</form>;
}

/** Apaga o rascunho: renderizado na tela de resultado, que só aparece depois de um envio bem-sucedido. */
export function ClearDraft({ storageKey }: { storageKey: string }) {
  useEffect(() => { try { localStorage.removeItem(storageKey); } catch { /* ignora */ } }, [storageKey]);
  return null;
}
