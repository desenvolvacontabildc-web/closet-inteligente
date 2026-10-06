"use client";
import { useEffect, useRef, useState } from "react";

type Toast = { text: string; kind: "busy" | "ok" | "error" | "info" };

function takeFlash(): { m: string; k: string } | null {
  try {
    const raw = document.cookie.split("; ").find((c) => c.startsWith("flash="));
    if (!raw) return null;
    document.cookie = "flash=; path=/; max-age=0";
    return JSON.parse(decodeURIComponent(raw.slice("flash=".length)));
  } catch { return null; }
}

function errorFromRedirect(header: string | null): string | null {
  if (!header) return null;
  try {
    const url = new URL(header.split(";")[0], window.location.origin);
    return url.searchParams.get("error");
  } catch { return null; }
}

/** Dá retorno visual para QUALQUER Server Action (formulários de todo o app): mostra
 * "Processando..." enquanto roda e, ao terminar, o resultado -- mensagem específica da ação
 * (cookie `flash`), erro de validação (parâmetro `error` do redirect) ou um "Concluído" genérico.
 * Observa os POSTs de Server Action (header Next-Action) em vez de depender de cada botão. */
export default function FlashToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(0);

  useEffect(() => {
    const show = (t: Toast, autoHideMs?: number) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(t);
      if (autoHideMs) timer.current = setTimeout(() => setToast(null), autoHideMs);
    };

    const initial = takeFlash();
    if (initial) show({ text: initial.m, kind: initial.k === "info" ? "info" : "ok" }, 5000);
    else {
      const err = new URLSearchParams(window.location.search).get("error");
      if (err) show({ text: err, kind: "error" }, 7000);
    }

    const originalFetch = window.fetch;
    window.fetch = function patched(input: RequestInfo | URL, init?: RequestInit) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      const isAction = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase() === "POST" && headers.has("next-action");
      const promise = originalFetch.call(window, input as any, init);
      if (!isAction) return promise;
      inflight.current++;
      show({ text: "Processando…", kind: "busy" });
      promise.then((res) => {
        inflight.current--;
        if (inflight.current > 0) return;
        const flashMsg = takeFlash();
        const redirectErr = errorFromRedirect(res.headers.get("x-action-redirect"));
        if (redirectErr) show({ text: redirectErr, kind: "error" }, 7000);
        else if (flashMsg) show({ text: flashMsg.m, kind: flashMsg.k === "info" ? "info" : "ok" }, 5000);
        else if (res.ok) show({ text: "Concluído ✓", kind: "ok" }, 3000);
        else show({ text: "Não foi possível concluir. Tente de novo.", kind: "error" }, 7000);
      }, () => {
        inflight.current--;
        show({ text: "Sem conexão. Verifique sua internet e tente de novo.", kind: "error" }, 7000);
      });
      return promise;
    } as typeof fetch;
    return () => { window.fetch = originalFetch; if (timer.current) clearTimeout(timer.current); };
  }, []);

  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"} aria-live="polite" onClick={() => toast.kind !== "busy" && setToast(null)}>
      {toast.kind === "busy" && <span className="toast-spinner" aria-hidden="true" />}
      <span>{toast.text}</span>
    </div>
  );
}
