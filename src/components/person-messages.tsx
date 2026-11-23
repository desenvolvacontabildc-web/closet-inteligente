"use client";
import { useMemo, useState } from "react";

const APP = "https://closet.desenvolvacontabil.com.br";

export type Tester = {
  user_id: string; name: string; email: string; whatsapp: string; last_login_at: string | null; sub_status: string;
  pieces: number; looks: number; images: number; ai_ops: number; feedback_done: boolean;
};
type Segment = "USOU" | "POUCO" | "NAO_USOU";

export function segmentOf(t: Tester): Segment {
  if (t.pieces >= 3 || t.looks >= 2 || t.images >= 1) return "USOU";
  if (t.pieces >= 1 || t.looks >= 1 || t.ai_ops >= 1) return "POUCO";
  return "NAO_USOU";
}
const SEG_LABEL: Record<Segment, string> = { USOU: "Usou de verdade", POUCO: "Usou pouco", NAO_USOU: "Não chegou a usar" };

const first = (name: string, email: string) => {
  const f = (name || email.split("@")[0]).trim().split(/\s+/)[0].toLowerCase();
  return f.charAt(0).toUpperCase() + f.slice(1);
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Passo 1: convite para responder ao questionário (antes de anunciar o sucesso). */
function step1(t: Tester, seg: Segment): string {
  const nome = first(t.name, t.email);
  if (seg === "USOU") {
    const feitos = [t.pieces > 0 ? plural(t.pieces, "peça cadastrada", "peças cadastradas") : "", t.looks > 0 ? plural(t.looks, "look montado", "looks montados") : ""].filter(Boolean).join(" e ");
    return `Oi, ${nome}! 💛 Aqui é a Ilka.

Obrigada por ter testado o Closet Inteligente! ${feitos ? `Vi que você já tem ${feitos}, e ` : ""}a sua opinião é muito valiosa para mim.

Pode me ajudar com um questionário rápido (2 minutinhos)? As suas respostas vão decidir o que eu melhoro primeiro:
👉 ${APP}/feedback

Em breve tenho uma novidade boa para te contar! 🥰`;
  }
  if (seg === "POUCO") {
    return `Oi, ${nome}! 💛 Aqui é a Ilka.

Vi que você entrou no Closet Inteligente e começou a explorar, mas ainda usou pouquinho. Queria muito entender o que te travou: faltou tempo, ficou confuso, ou não era bem o que você esperava?

Se puder responder a este questionário rápido (2 minutos), me ajuda demais:
👉 ${APP}/feedback

E se preferir, me conta por aqui mesmo, sem problema! Se tiver alguma dificuldade, eu te ajudo a começar. 🥰`;
  }
  return `Oi, ${nome}! 💛 Aqui é a Ilka.

Vi que você criou a sua conta no Closet Inteligente, mas ainda não conseguiu usar. Aconteceu algum problema? Foi a senha, a instalação no celular, ou só faltou tempo?

Me conta por aqui que eu resolvo com você agora. Seu feedback, mesmo sendo "não consegui usar", é muito importante para eu melhorar o app. 🥰

O endereço é ${APP}. Se ajudar, eu também te mando o passo a passo para colocar o app na tela do celular!`;
}

/** Passo 2: anúncio do sucesso com a Colorimetria de agradecimento no plano recorrente mensal. */
function step2(t: Tester, seg: Segment): string {
  const nome = first(t.name, t.email);
  const sucesso = `o Closet Inteligente foi um sucesso! 🎉 Rodamos com cerca de 33 usuárias ao mesmo tempo, sem erros e sem bugs, e ele está pronto para ser liberado.`;
  if (seg === "NAO_USOU") {
    return `Oi, ${nome}! 💛

Tenho uma ótima notícia: ${sucesso}

Como você ainda não teve tempo de explorar, o seu acesso está estendido por mais 10 dias para você conhecer com calma. ✨

E tem mais: a Colorimetria 🎨 (a análise das suas cores ideais) é presente para quem escolher um plano recorrente mensal no cartão, e os planos no cartão estão com valores especiais nos 3 primeiros meses.

Para ver os planos, abra o app e toque em Assinatura:
👉 ${APP}

Se precisar de ajuda para começar, é só me chamar. Sou muito grata pelo apoio ao projeto! 🥰`;
  }
  return `Oi, ${nome}! 💛

Tenho uma ótima notícia: ${sucesso}

Como agradecimento a quem participou dos testes, estou liberando a Colorimetria 🎨 (a análise das suas cores ideais) de presente para todas que escolherem um plano recorrente mensal no cartão. Os planos no cartão estão com valores especiais nos 3 primeiros meses. ✨

Para escolher o seu, abra o app e toque em Assinatura:
👉 ${APP}

Sou muito grata pelo seu apoio ao projeto! 🥰`;
}

/** Mensagens individuais: cada pessoa recebe o texto certo para o jeito que usou o app. */
export default function PersonMessages({ testers }: { testers: Tester[] }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [filter, setFilter] = useState<"TODAS" | Segment>("TODAS");
  const [copied, setCopied] = useState("");
  const rows = useMemo(() => testers.map((t) => ({ t, seg: segmentOf(t) })), [testers]);
  const shown = rows.filter((r) => filter === "TODAS" || r.seg === filter);
  const count = (s: Segment) => rows.filter((r) => r.seg === s).length;
  const textOf = (r: { t: Tester; seg: Segment }) => (step === 1 ? step1(r.t, r.seg) : step2(r.t, r.seg));
  const wa = (r: { t: Tester; seg: Segment }) => {
    const d = r.t.whatsapp.replace(/\D/g, "");
    return `https://wa.me/${d.length >= 10 ? (d.length <= 11 ? `55${d}` : d) : ""}?text=${encodeURIComponent(textOf(r))}`;
  };
  async function copy(r: { t: Tester; seg: Segment }) {
    try { await navigator.clipboard.writeText(textOf(r)); setCopied(r.t.user_id); setTimeout(() => setCopied(""), 2500); } catch { setCopied(""); }
  }

  return <div>
    <div className="card">
      <h2>Envio personalizado para cada testadora</h2>
      <p className="look-meta">Cada uma recebe um texto ajustado ao que fez no app. Envie primeiro o <strong>passo 1 (questionário)</strong>; depois que responderem, o <strong>passo 2 (sucesso e Colorimetria)</strong>.</p>
      <div className="action-row">
        <button type="button" className={step === 1 ? "active" : ""} onClick={() => setStep(1)}>Passo 1: questionário</button>
        <button type="button" className={step === 2 ? "active" : ""} onClick={() => setStep(2)}>Passo 2: sucesso + Colorimetria</button>
      </div>
      <div className="action-row">
        {(["TODAS", "USOU", "POUCO", "NAO_USOU"] as const).map((s) => <button key={s} type="button" className={filter === s ? "active link" : "link"} onClick={() => setFilter(s)}>
          {s === "TODAS" ? `Todas (${rows.length})` : `${SEG_LABEL[s]} (${count(s)})`}
        </button>)}
      </div>
    </div>
    {shown.map((r) => <section className="card" key={r.t.user_id}>
      <h3>{r.t.name || r.t.email} <small>· {SEG_LABEL[r.seg]}</small></h3>
      <p className="look-meta">{plural(r.t.pieces, "peça", "peças")} · {plural(r.t.looks, "look", "looks")} · {plural(r.t.images, "imagem", "imagens")} · {r.t.last_login_at ? `último acesso ${new Date(r.t.last_login_at).toLocaleDateString("pt-BR")}` : "nunca fez login"}{r.t.feedback_done ? " · já respondeu o questionário" : ""}</p>
      <pre className="msg-preview">{textOf(r)}</pre>
      <div className="action-row">
        <button type="button" onClick={() => copy(r)}>{copied === r.t.user_id ? "Copiado!" : "Copiar mensagem"}</button>
        <a className="link" href={wa(r)} target="_blank" rel="noopener noreferrer">{r.t.whatsapp ? "Abrir no WhatsApp dela" : "Abrir no WhatsApp (sem número cadastrado)"}</a>
      </div>
    </section>)}
  </div>;
}
