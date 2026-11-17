import Link from "next/link";
import { adminListAccounts, adminAccountView } from "@/server/admin-actions";
import { STATUS_LABEL, PLAN_LABEL } from "../../../labels";

const ITEM_STATUS: Record<string, string> = { ACTIVE: "Ativa", DISCARDED: "Descartada", DONATED: "Doada", SOLD: "Vendida", ARCHIVED: "Arquivada" };
const LOOK_STATUS: Record<string, string> = { PENDING: "Para decidir", SUGGESTED: "Para decidir", APPROVED: "Aprovado", READY: "Aprovado", USED: "Usado", WORN: "Usado", REJECTED: "Descartado", DISCARDED: "Descartado" };
const KIND: Record<string, string> = { LOOK: "Imagem de look", CATALOG: "Foto de catálogo" };
const dt = (d: any) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const sum = (o: Record<string, number> | undefined) => Object.values(o || {}).reduce((s, n) => s + Number(n), 0);

export default async function ContaUsuaria({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { accounts } = await adminListAccounts();
  if (!accounts) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  const a = accounts.find((x: any) => x.user_id === id);
  if (!a) return <main className="shell narrow"><h1>Usuária não encontrada</h1><Link href="/admin/usuarias">← Usuárias</Link></main>;
  const v = await adminAccountView(id);
  if (!v) return <main className="shell narrow"><h1>Não foi possível abrir</h1><Link href={`/admin/usuarias/${id}`}>← Ficha</Link></main>;
  const { summary: s, items, looks, images, trips } = v;

  return <main className="shell">
    <Link href={`/admin/usuarias/${id}`}>← Ficha de {a.display_name || a.email}</Link>
    <h1>Conta de {a.display_name || "(sem nome)"}</h1>
    <p className="look-meta">{a.email} · <span className={`chip chip-${a.sub_status}`}>{STATUS_LABEL[a.sub_status] || a.sub_status}</span> · {a.sub_status === "TRIAL" ? "Teste gratuito" : `Plano ${PLAN_LABEL[a.plan] || a.plan}`}</p>
    <div className="card support-note" role="note">
      <strong>Modo suporte, somente leitura.</strong> Você vê as peças, os looks e as imagens que a usuária gerou para poder ajudar. Este acesso fica registrado no histórico dela. Fotos de perfil, de corpo e as respostas da Colorimetria não aparecem aqui.
    </div>

    <section className="card">
      <h2>Resumo</h2>
      <div className="adm-stats">
        <div><strong>{sum(s.items_by_status)}</strong><small>peça{sum(s.items_by_status) === 1 ? "" : "s"} · {s.items_with_catalog_photo} com foto de catálogo</small></div>
        <div><strong>{sum(s.looks_by_status)}</strong><small>look{sum(s.looks_by_status) === 1 ? "" : "s"} · {s.looks_with_image} com imagem</small></div>
        <div><strong>{s.images_month_look + s.images_month_catalog}</strong><small>imagens este mês ({s.images_month_look} de look, {s.images_month_catalog} de catálogo)</small></div>
        <div><strong>{s.ai_ops_month}</strong><small>pedidos de IA este mês ({s.ai_ops_total} no total)</small></div>
        <div><strong>{s.trips}</strong><small>mala{s.trips === 1 ? "" : "s"} de viagem</small></div>
        <div><strong>{s.bazar_posts}</strong><small>anúncio{s.bazar_posts === 1 ? "" : "s"} no Bazar</small></div>
      </div>
      <p className="look-meta">
        Perfil inicial {s.onboarding_completed ? "preenchido" : "não concluído"} · Colorimetria {s.has_style_profile ? "feita" : "não feita"} · {s.skin_routines} rotina{s.skin_routines === 1 ? "" : "s"} de skincare · {s.hair_cycles} cronograma{s.hair_cycles === 1 ? "" : "s"} capilar{s.hair_cycles === 1 ? "" : "es"} · {a.last_login_at ? `último acesso em ${new Date(a.last_login_at).toLocaleString("pt-BR")}` : "nunca entrou"}
      </p>
    </section>

    <section>
      <div className="section-head"><h2>Peças do closet</h2><span className="look-meta">{items.length === 200 ? "As 200 mais recentes" : `${items.length} no total`}</span></div>
      {items.length === 0 ? <p className="look-meta">Nenhuma peça cadastrada.</p> : <div className="adm-grid">
        {items.map((it: any) => <figure key={it.id} className={`adm-item${it.status !== "ACTIVE" ? " off" : ""}`}>
          {it.photo_id ? <img src={`/api/admin/foto/${it.photo_id}?w=360`} alt={it.name} loading="lazy" /> : <span className="adm-ph">✦</span>}
          <figcaption><strong>{it.name}</strong><small>{it.category}{it.color ? ` · ${it.color}` : ""}</small>
            <small>{ITEM_STATUS[it.status] || it.status}{it.has_catalog ? " · catálogo" : ""} · {new Date(it.created_at).toLocaleDateString("pt-BR")}</small></figcaption>
        </figure>)}
      </div>}
    </section>

    <section>
      <div className="section-head"><h2>Looks</h2><span className="look-meta">{looks.length === 60 ? "Os 60 mais recentes" : `${looks.length} no total`}</span></div>
      {looks.length === 0 ? <p className="look-meta">Nenhum look ainda.</p> : <div className="adm-looks">
        {looks.map((l: any) => <article key={l.id} className="adm-look">
          {l.has_image ? <img src={`/api/admin/look/${l.id}?w=480`} alt={l.name || "Look"} loading="lazy" /> : <span className="adm-ph">sem imagem</span>}
          <div>
            <strong>{l.name || "Look"}</strong>
            <small>{l.occasion || "Sem ocasião"} · {LOOK_STATUS[l.status] || l.status}{l.worn_at ? " · usado" : ""} · {new Date(l.created_at).toLocaleDateString("pt-BR")}</small>
            <small>{(l.pieces || []).join(" + ") || "sem peças"}</small>
          </div>
        </article>)}
      </div>}
    </section>

    <section className="card">
      <h2>Imagens geradas</h2>
      <p className="look-meta">As 60 últimas. Total desde o cadastro: {s.images_total}.</p>
      {images.length === 0 ? <p className="look-meta">Nenhuma imagem gerada ainda.</p> : <ul className="adm-log">
        {images.map((g: any, i: number) => <li key={i}><span>{dt(g.created_at)}</span><span>{KIND[g.kind] || g.kind}</span></li>)}
      </ul>}
    </section>

    {trips.length > 0 && <section className="card">
      <h2>Malas de viagem</h2>
      <ul className="adm-log">{trips.map((t: any) => <li key={t.id}><span>{t.destino || "(sem destino)"}{t.dias ? ` · ${t.dias} dia${t.dias === 1 ? "" : "s"}` : ""}</span><span>{t.status === "CONCLUIDA" ? "Pronta" : "Em planejamento"} · {new Date(t.created_at).toLocaleDateString("pt-BR")}</span></li>)}</ul>
    </section>}
  </main>;
}
