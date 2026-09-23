import { adminListTrends, createTrend, setTrendActive } from "@/server/trend-actions";

export default async function AdminTendencias() {
  const trends = await adminListTrends();
  if (!trends) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;

  return <main className="shell narrow">
    <a href="/home">← Voltar</a>
    <h1>Radar de Tendências</h1>
    <p>Poste uma dica de estilo — aparece pra todas as clientes na tela de Tendências.</p>
    <form action={createTrend} encType="multipart/form-data" className="form">
      <h2>Nova dica</h2>
      <label>Título<input name="title" placeholder="Ex.: Marrom chocolate em alta" required/></label>
      <label>Texto<textarea name="body" placeholder="Como usar essa tendência com o que a cliente já tem"/></label>
      <label>Foto (opcional)<input type="file" name="photo" accept="image/*"/></label>
      <button>Publicar dica</button>
    </form>
    {trends.map((t: any) => (
      <section className="card" key={t.id}>
        {t.object_key && <img src={`/api/tendencias/photos/${t.id}`} alt={t.title} style={{ width: "100%", borderRadius: 12, marginBottom: 8 }}/>}
        <h3>{t.title} {!t.active && "· oculta"}</h3>
        {t.body && <p>{t.body}</p>}
        <p className="look-meta">{new Date(t.created_at).toLocaleDateString("pt-BR")}</p>
        <form action={setTrendActive}>
          <input type="hidden" name="id" value={t.id}/>
          <input type="hidden" name="active" value={t.active ? "off" : "on"}/>
          <button className="link">{t.active ? "Ocultar" : "Reativar"}</button>
        </form>
      </section>
    ))}
  </main>;
}
