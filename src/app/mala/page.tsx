import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { createTrip, deleteTrip } from "@/server/trip-actions";
import SubmitButton from "@/components/submit-button";
import ConfirmButton from "@/components/confirm-button";

export default async function Mala({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const data = await withProfile(async (c) => {
    const trips = (await c.query(`SELECT t.id,t.destino,t.data_ida,t.data_volta,t.dias,t.status,t.created_at,
        (SELECT count(*)::int FROM looks l WHERE l.trip_id=t.id) AS looks_count,
        (SELECT count(*)::int FROM trip_items ti WHERE ti.trip_id=t.id) AS items_count
      FROM trip_plans t ORDER BY t.created_at DESC`)).rows;
    return { trips };
  });
  if (!data) redirect("/");
  const { trips } = data;
  const planejamento = trips.filter((t: any) => t.status === "PLANEJAMENTO");
  const concluidas = trips.filter((t: any) => t.status === "CONCLUIDA");

  const row = (t: any, href: string, meta: string) => (
    <div className="trip-row" key={t.id}>
      <Link href={href} className="trip-row-main">
        <strong>{t.destino || "Viagem sem destino"}</strong>
        <small>{meta}</small>
      </Link>
      <form action={deleteTrip}>
        <input type="hidden" name="trip_id" value={t.id} />
        <ConfirmButton className="link" message={`Excluir a mala "${t.destino || "sem destino"}"? Os looks dela serão apagados (as peças continuam no closet).`}>Excluir</ConfirmButton>
      </form>
    </div>
  );

  return <main className="shell narrow">
    <div className="top"><span className="eyebrow">MALA INTELIGENTE</span><Link href="/home">Voltar</Link></div>
    <h1>Monte sua mala com o que já tem no closet.</h1>
    <p className="look-meta">Você conta como é a viagem (dias, motivo e cada compromisso, de dia ou à noite) e a IA monta um look para cada ocasião usando só peças reais. Depois você ajusta, troca e descarta o que quiser.</p>
    {error && <p role="alert" className="trial-banner">{error}</p>}
    <form action={createTrip}><SubmitButton pendingText="Criando...">＋ Criar nova mala</SubmitButton></form>

    {planejamento.length > 0 && <section className="card">
      <h2>Em planejamento</h2>
      {planejamento.map((t: any) => row(t, `/mala/${t.id}?step=1`, "Continue de onde parou"))}
    </section>}

    {concluidas.length > 0 && <section className="card">
      <h2>Malas prontas</h2>
      {concluidas.map((t: any) => row(t, `/mala/${t.id}`, `${t.dias ? `${t.dias} dia${t.dias === 1 ? "" : "s"} · ` : ""}${t.items_count} peças · ${t.looks_count} looks${t.data_ida ? ` · ${new Date(t.data_ida).toLocaleDateString("pt-BR")}` : ""}`))}
    </section>}

    {trips.length === 0 && <p className="empty-note">Você ainda não criou nenhuma mala.</p>}
  </main>;
}
