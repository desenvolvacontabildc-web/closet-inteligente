import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { createTrip, deleteTrip } from "@/server/trip-actions";

export default async function Mala() {
  const data = await withProfile(async (c) => {
    const trips = (await c.query("SELECT id,destino,data_ida,data_volta,status,created_at FROM trip_plans ORDER BY created_at DESC")).rows;
    return { trips };
  });
  if (!data) redirect("/");
  const { trips } = data;
  const planejamento = trips.filter((t: any) => t.status === "PLANEJAMENTO");
  const concluidas = trips.filter((t: any) => t.status === "CONCLUIDA");

  return <main className="shell">
    <div className="top"><span className="eyebrow">MALA INTELIGENTE</span><Link href="/home">Voltar</Link></div>
    <h1>Vamos montar sua mala usando o que você já tem no closet.</h1>
    <form action={createTrip}><button>Criar nova mala</button></form>

    {planejamento.length > 0 && <section className="card">
      <h2>Malas em planejamento</h2>
      <ul>
        {planejamento.map((t: any) => (
          <li key={t.id}><Link href={`/mala/${t.id}?step=1`}>{t.destino || "Sem destino ainda"}</Link>
            <form action={deleteTrip} style={{ display: "inline" }}><input type="hidden" name="trip_id" value={t.id} /><button className="link">Excluir</button></form>
          </li>
        ))}
      </ul>
    </section>}

    {concluidas.length > 0 && <section className="card">
      <h2>Malas concluídas / histórico de viagens</h2>
      <ul>
        {concluidas.map((t: any) => (
          <li key={t.id}><Link href={`/mala/${t.id}`}>{t.destino}</Link> {t.data_ida && <span className="look-meta">{new Date(t.data_ida).toLocaleDateString("pt-BR")}</span>}
            <form action={deleteTrip} style={{ display: "inline" }}><input type="hidden" name="trip_id" value={t.id} /><button className="link">Excluir</button></form>
          </li>
        ))}
      </ul>
    </section>}

    {trips.length === 0 && <p className="look-meta">Você ainda não criou nenhuma mala.</p>}
  </main>;
}
