"use client";
import { useEffect, useState } from "react";
import { savePushSubscription, removePushSubscription } from "@/server/push-actions";

type S = "carregando" | "instalar" | "sem-suporte" | "bloqueado" | "desligado" | "ligado";

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Liga ou desliga os lembretes no celular. `banner` aparece na tela inicial só enquanto estiver desligado. */
export default function PushToggle({ variant = "card" }: { variant?: "card" | "banner" }) {
  const [s, setS] = useState<S>("carregando");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem("push_dismissed") === "1") setHidden(true); } catch { /* sem armazenamento */ }
    (async () => {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setS(ios && !standalone ? "instalar" : "sem-suporte"); return; }
      if (Notification.permission === "denied") { setS("bloqueado"); return; }
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        setS(sub && Notification.permission === "granted" ? "ligado" : "desligado");
      } catch { setS("desligado"); }
    })();
  }, []);

  async function enable() {
    setBusy(true); setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setS(perm === "denied" ? "bloqueado" : "desligado"); setMsg("Sem a sua permissão não dá para avisar. Você pode liberar nas configurações do navegador."); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const key = (await (await fetch("/api/push/key")).json()).key as string;
      if (!key) { setMsg("As notificações ainda não estão disponíveis. Tente mais tarde."); return; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      const j = sub.toJSON() as any;
      const ok = await savePushSubscription({ endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } });
      if (!ok) { setMsg("Não consegui ativar agora. Tente de novo."); return; }
      setS("ligado"); setMsg("Pronto! Você vai receber os lembretes neste aparelho.");
    } catch (e) { console.error(e); setMsg("Não foi possível ativar neste aparelho."); }
    finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setMsg("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
      setS("desligado"); setMsg("Lembretes desligados neste aparelho.");
    } catch { setMsg("Não foi possível desligar agora."); }
    finally { setBusy(false); }
  }
  const dismiss = () => { try { localStorage.setItem("push_dismissed", "1"); } catch { /* ok */ } setHidden(true); };

  if (variant === "banner") {
    if (s !== "desligado" || hidden) return null;
    return <div className="announce" role="status">
      <div><strong>Ative os lembretes no celular</strong><p>Avisos da sua rotina de skincare, do cabelo e do seu plano, sem precisar abrir o app.</p></div>
      <div className="push-actions"><button type="button" onClick={enable} disabled={busy}>{busy ? "Ativando..." : "Ativar"}</button><button type="button" className="link" onClick={dismiss}>Agora não</button></div>
    </div>;
  }
  return <div className="card">
    <h2>Lembretes no celular</h2>
    <p className="look-meta">Receba avisos da sua rotina de skincare, do cronograma capilar, do fim do teste grátis e do vencimento do Pix, direto no aparelho.</p>
    {s === "carregando" && <p className="look-meta">Verificando...</p>}
    {s === "instalar" && <p className="look-meta">No iPhone, primeiro adicione o Closet à tela de início (toque em Compartilhar e depois em "Adicionar à Tela de Início") e abra o app por lá. Aí este botão aparece.</p>}
    {s === "sem-suporte" && <p className="look-meta">Este navegador não permite notificações. Experimente pelo Chrome (Android ou computador) ou instale o app.</p>}
    {s === "bloqueado" && <p className="look-meta">As notificações estão bloqueadas neste navegador. Libere nas configurações do site para ativar.</p>}
    {s === "desligado" && <button type="button" onClick={enable} disabled={busy}>{busy ? "Ativando..." : "Ativar lembretes neste aparelho"}</button>}
    {s === "ligado" && <><p><strong>Lembretes ativados neste aparelho.</strong></p><button type="button" className="link" onClick={disable} disabled={busy}>Desligar neste aparelho</button></>}
    {msg && <p className="look-meta" role="status">{msg}</p>}
  </div>;
}
