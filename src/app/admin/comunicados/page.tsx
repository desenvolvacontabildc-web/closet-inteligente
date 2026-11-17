import { adminListAccounts, adminListAnnouncements, saveAnnouncement, deleteAnnouncement } from "@/server/admin-actions";
import SubmitButton from "@/components/submit-button";
import ConfirmButton from "@/components/confirm-button";

const AUD: Record<string, string> = { ALL: "Todas as usuárias", TRIAL: "Só quem está no teste grátis", PAID: "Só assinantes" };

function Fields({ n }: { n?: any }) {
  return <>
    {n && <input type="hidden" name="id" value={n.id} />}
    <label>Título (aparece em destaque, até 80 letras)<input name="title" defaultValue={n?.title || ""} maxLength={80} required placeholder="Ex.: Novidade: Bazar no ar!" /></label>
    <label>Mensagem (opcional, até 600 letras)<textarea name="body" rows={3} maxLength={600} defaultValue={n?.body || ""} placeholder="Explique em poucas linhas." /></label>
    <div className="two-fields">
      <label>Quem vê
        <select name="audience" defaultValue={n?.audience || "ALL"}>{Object.entries(AUD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </label>
      <label>Mostrar até (opcional)<input name="ends" type="date" defaultValue={n?.ends_at ? new Date(n.ends_at).toISOString().slice(0, 10) : ""} /></label>
    </div>
    <label className="checkbox"><input type="checkbox" name="active" defaultChecked={n ? n.active : true} /> Ativo (aparece na tela inicial do app)</label>
  </>;
}

export default async function Comunicados({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  const list = await adminListAnnouncements();
  return <main className="shell narrow">
    <h1>Comunicados</h1>
    <p className="look-meta">Avisos que aparecem no topo da tela inicial do app, com um botão "Entendi" para cada usuária dispensar. Use para novidades, avisos de manutenção ou lembretes.</p>
    {error && <p role="alert" className="trial-banner">{error}</p>}

    <section className="card">
      <h2>Novo comunicado</h2>
      <form action={saveAnnouncement} className="form"><Fields /><SubmitButton pendingText="Publicando...">Publicar comunicado</SubmitButton></form>
    </section>

    <section className="card">
      <h2>Comunicados criados</h2>
      {list.length === 0 && <p className="look-meta">Nenhum ainda.</p>}
      {list.map((n: any) => <details key={n.id} className="more offer-row">
        <summary><strong>{n.title}</strong> <small>· {AUD[n.audience]} · {n.active ? "ativo" : "desativado"} · {Number(n.dismissed)} dispensaram</small></summary>
        <form action={saveAnnouncement} className="form"><Fields n={n} /><SubmitButton pendingText="Salvando...">Salvar alterações</SubmitButton></form>
        <form action={deleteAnnouncement}><input type="hidden" name="id" value={n.id} /><ConfirmButton className="danger-link" message="Apagar este comunicado?" pendingText="Apagando...">Apagar comunicado</ConfirmButton></form>
      </details>)}
    </section>
  </main>;
}
