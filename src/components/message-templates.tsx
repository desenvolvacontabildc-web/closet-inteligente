"use client";
import { useMemo, useState } from "react";

const APP = "https://closet.desenvolvacontabil.com.br";

type Tpl = { id: string; title: string; hint: string; build: (v: { nome: string; cupom: string; dias: string }) => string };

const INSTALAR = `📲 Para ficar bem prático, coloque o Closet como app no seu celular. É rapidinho:

🍎 iPhone (use o Safari)
1. Abra o link no Safari
2. Toque no botão Compartilhar (o quadradinho com a setinha para cima)
3. Role a lista e toque em "Adicionar à Tela de Início"
4. Toque em "Adicionar". Pronto, o ícone aparece na sua tela!

🤖 Android (use o Chrome)
1. Abra o link no Chrome
2. Toque nos três pontinhos (⋮) no canto de cima
3. Toque em "Instalar app" (ou "Adicionar à tela inicial")
4. Confirme. O ícone aparece na sua tela!`;

const TEMPLATES: Tpl[] = [
  {
    id: "convite", title: "Convite para testar (apresentando a Aura)", hint: "Primeiro contato com quem ainda não conhece o app.",
    build: ({ nome, cupom }) => `Oi${nome ? `, ${nome}` : ""}! Tudo bem? 💛 Eu sou a Aura, a assistente virtual do Closet Inteligente, e estou falando com você a convite da Ilka!

O Closet Inteligente organiza o seu guarda-roupa e monta looks prontos com as peças que você já tem. Eu sou a consultora de imagem do app: conheço o seu estilo, as suas cores e ajudo a escolher o look certo para cada ocasião. ✨

Com o app você pode:
👗 Cadastrar suas peças pela foto (ele reconhece cor, tecido e modelo)
✨ Pedir looks e ver em imagem antes de vestir
🧳 Montar a mala de viagem sob medida
🎨 Descobrir a sua paleta de cores
🧴 Cuidar da rotina de skincare e do cronograma capilar

Ainda tem poucas peças? Sem problema: eu também sugiro looks com o que vale comprar. 😉

Para começar, é só entrar por este link e criar a sua conta:
👉 ${APP}/?cupom=${cupom}

${INSTALAR}

Se precisar de ajuda com qualquer passo, é só me chamar por aqui. Vou adorar te ajudar! 💛`,
  },
  {
    id: "agradecimento", title: "Sucesso do Closet + Colorimetria no plano recorrente", hint: "Versão geral, sem personalizar. Para o envio individual use a seção acima.",
    build: ({ nome }) => `Oi${nome ? `, ${nome}` : ""}! 💛

Tenho uma ótima notícia: o Closet Inteligente foi um sucesso! 🎉 Rodamos com cerca de 33 usuárias ao mesmo tempo, sem erros e sem bugs, e ele está pronto para ser liberado.

Como agradecimento a quem participou dos testes, estou liberando a Colorimetria 🎨 (a análise das suas cores ideais) de presente para todas que escolherem um plano recorrente mensal no cartão. Os planos no cartão estão com valores especiais nos 3 primeiros meses. ✨

Para escolher o seu, abra o app e toque em Assinatura:
👉 ${APP}

Sou muito grata pelo seu apoio ao projeto! 🥰`,
  },
  {
    id: "lembrete", title: "Lembrete: o teste está acabando", hint: "Para quem está nos últimos dias do teste.",
    build: ({ nome }) => `Oi${nome ? `, ${nome}` : ""}! 💛 Passando para avisar que o seu teste do Closet Inteligente está chegando ao fim.

Tudo o que você cadastrou (peças e looks) fica guardado. Para continuar usando, é só escolher um plano em Assinatura. No cartão recorrente você ainda ganha a Colorimetria de brinde e paga valor especial nos 3 primeiros meses. 🎨

👉 ${APP}

Se tiver qualquer dúvida, me chama! 🥰`,
  },
  {
    id: "instalar", title: "Como colocar o Closet como app no celular", hint: "Só o passo a passo da instalação.",
    build: ({ nome }) => `Oi${nome ? `, ${nome}` : ""}! 💛 Aqui é a Aura, do Closet Inteligente.

${INSTALAR}

Link do app: ${APP}

Qualquer dúvida é só me chamar! ✨`,
  },
];

/** Mensagens prontas para copiar ou abrir direto no WhatsApp, com o nome e o cupom já preenchidos. */
export default function MessageTemplates({ cupons }: { cupons: string[] }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cupom, setCupom] = useState(cupons[0] || "teste199");
  const [dias, setDias] = useState("10");
  const [copied, setCopied] = useState("");
  const texts = useMemo(() => Object.fromEntries(TEMPLATES.map((t) => [t.id, t.build({ nome: nome.trim(), cupom, dias })])), [nome, cupom, dias]);

  async function copy(id: string) {
    try { await navigator.clipboard.writeText(texts[id]); setCopied(id); setTimeout(() => setCopied(""), 2500); }
    catch { setCopied("erro"); }
  }
  const digits = telefone.replace(/\D/g, "");
  const wa = (id: string) => {
    const num = digits.length >= 10 ? (digits.length <= 11 ? `55${digits}` : digits) : "";
    return `https://wa.me/${num}?text=${encodeURIComponent(texts[id])}`;
  };

  return <div>
    <div className="card">
      <h2>Preencha uma vez</h2>
      <div className="form">
        <label>Nome da pessoa<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Jenifer" /></label>
        <label>WhatsApp com DDD (opcional, para abrir a conversa já com a mensagem)<input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="Ex.: 81 98888-7777" /></label>
        <label>Cupom do convite
          <select value={cupom} onChange={(e) => setCupom(e.target.value)}>{(cupons.length ? cupons : ["teste199"]).map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </label>
        <label>Dias extras (mensagem de agradecimento)<input value={dias} onChange={(e) => setDias(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" /></label>
      </div>
    </div>
    {TEMPLATES.map((t) => <section className="card" key={t.id}>
      <h2>{t.title}</h2>
      <p className="look-meta">{t.hint}</p>
      <pre className="msg-preview">{texts[t.id]}</pre>
      <div className="action-row">
        <button type="button" onClick={() => copy(t.id)}>{copied === t.id ? "Copiado!" : "Copiar mensagem"}</button>
        <a className="link" href={wa(t.id)} target="_blank" rel="noopener noreferrer">{digits.length >= 10 ? "Abrir no WhatsApp deste número" : "Abrir no WhatsApp (escolher contato)"}</a>
      </div>
      {copied === "erro" && <p className="look-meta" role="alert">Não consegui copiar sozinho. Selecione o texto e copie manualmente.</p>}
    </section>)}
  </div>;
}
