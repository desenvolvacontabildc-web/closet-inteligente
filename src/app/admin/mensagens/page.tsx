import { adminListAccounts, adminListOffers, adminTesters } from "@/server/admin-actions";
import PersonMessages from "@/components/person-messages";
import MessageTemplates from "@/components/message-templates";

export default async function Mensagens() {
  const { accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  const offers = await adminListOffers();
  const testers = await adminTesters();
  const cupons = offers.filter((o: any) => o.active).map((o: any) => String(o.code));
  return <main className="shell narrow">
    <h1>Mensagens prontas</h1>
    <p className="look-meta">Convites e avisos para copiar e colar no WhatsApp, já com o nome, o cupom e o passo a passo para instalar o app. Quando você informa o número, o botão abre a conversa com a mensagem pronta (é só tocar em enviar).</p>
    <PersonMessages testers={testers.map((t: any) => ({ ...t, last_login_at: t.last_login_at ? new Date(t.last_login_at).toISOString() : null }))} />
    <h2>Outras mensagens</h2>
    <MessageTemplates cupons={cupons} />
  </main>;
}
