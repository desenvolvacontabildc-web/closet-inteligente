import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";

export default async function Tendencias() {
  const trends = await withProfile(async (c) => (await c.query("SELECT * FROM list_active_trends(30)")).rows);
  if (!trends) redirect("/");

  return <main className="shell">
    <a href="/home">← Voltar</a>
    <span className="eyebrow">RADAR DE TENDÊNCIAS</span>
    <h1>O que está em alta.</h1>
    <p>Dicas de estilo selecionadas por stylists e profissionais da moda, pensadas pra você usar o que já tem no closet.</p>
    {trends.length === 0 && <p>Nenhuma dica publicada ainda. Volte em breve!</p>}
    <div className="grid">
      {trends.map((t: any) => (
        <div className="look-card" key={t.id}>
          {t.object_key
            ? <img src={`/api/tendencias/photos/${t.id}`} alt={t.title}/>
            : <span className="look-thumb-placeholder">✨<small>Tendência</small></span>}
          <h3>{t.title}</h3>
          {t.body && <p className="look-pieces">{t.body}</p>}
          <p className="look-meta">{new Date(t.created_at).toLocaleDateString("pt-BR")}</p>
        </div>
      ))}
    </div>
  </main>;
}
