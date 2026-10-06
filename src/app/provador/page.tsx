import Link from "next/link";
import { redirect } from "next/navigation";
import { withStore } from "@/server/store-session";
import { generateProvadorLook, deleteProvadorLook } from "@/server/provador-actions";
import { PARTNER_PACKAGE_IMAGE_LIMIT, PROVADOR_MODEL_LABEL } from "@/server/partner-limits";
import SubmitButton from "@/components/submit-button";
import StoreNav from "@/components/store-nav";

export default async function Provador({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const data = await withStore(async (c, userId, partnerId) => {
    const me = (await c.query("SELECT * FROM partner_me($1)", [partnerId])).rows[0];
    const items = (await c.query("SELECT * FROM partner_list_own_items($1)", [partnerId])).rows.filter((i: any) => i.active && i.object_key);
    const looks = (await c.query("SELECT * FROM partner_list_provador_looks($1)", [partnerId])).rows;
    const used = Number((await c.query("SELECT partner_provador_count_month($1) n", [partnerId])).rows[0]?.n || 0);
    const hasBodyPhoto = !!(await c.query("SELECT body_photo_object_key FROM profiles WHERE user_id=$1", [userId])).rows[0]?.body_photo_object_key;
    return { me, items, looks, used, hasBodyPhoto };
  });
  if (!data) redirect("/");
  const { me, items, looks, used, hasBodyPhoto } = data;
  const limit = PARTNER_PACKAGE_IMAGE_LIMIT[me.package] ?? 0;
  const remaining = Math.max(0, limit - used);
  const canGenerate = me.live && remaining > 0 && items.length > 0;

  return <main className="shell">
    <StoreNav active="provador" />
    <section className="hero">
      <span className="eyebrow">PROVADOR</span>
      <h1>Veja suas peças vestidas.</h1>
      <p>Escolha até 4 peças da sua loja e como quer vê-las: na <strong>sua foto</strong>, numa <strong>modelo aleatória</strong> ou num <strong>manequim de vitrine</strong>. A imagem fica guardada aqui para você baixar e usar nas suas redes.</p>
    </section>
    {error && <p role="alert" className="trial-banner">{error}</p>}
    {!me.live && <div className="card alert-card"><h2>Provador bloqueado</h2><p>O Provador é liberado quando a loja está aprovada e com o pacote ativo. <Link href="/minha-vitrine">Ver status da loja</Link></p></div>}

    <form action={generateProvadorLook} className="card form">
      <h2>Montar uma imagem</h2>
      <p className="look-meta">Você ainda pode gerar {remaining} imagem(ns) este mês (pacote permite {limit}).</p>
      <fieldset>
        <legend>1. Como quer ver as peças?</legend>
        {Object.entries(PROVADOR_MODEL_LABEL).map(([value, label], idx) => (
          <label key={value} className="checkbox">
            <input type="radio" name="model_kind" value={value} defaultChecked={idx === 1} /> {label}
            {value === "MINHA_FOTO" && !hasBodyPhoto && <small> (precisa enviar uma foto de corpo inteiro em <Link href="/perfil">Perfil → Meu avatar de estilo</Link>)</small>}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>2. Escolha de 1 a 4 peças (só aparecem peças ativas com foto)</legend>
        {items.length === 0
          ? <p className="look-meta">Você ainda não tem peças com foto. Cadastre em <Link href="/minha-vitrine">Minha vitrine</Link>.</p>
          : <div className="item-picker">
              {items.map((it: any) => (
                <label key={it.id}>
                  <input type="checkbox" name="items" value={it.id} />
                  <img src={`/api/minha-vitrine/foto/${it.id}`} alt={it.name} />
                  <span>{it.name}</span>
                </label>
              ))}
            </div>}
      </fieldset>
      <SubmitButton disabled={!canGenerate} pendingText="Gerando imagem... (pode levar até 2 minutos)">🪞 Gerar no provador</SubmitButton>
      <p className="look-meta">A IA tenta manter cor, tecido e corte de cada peça como nas suas fotos, mas confira o resultado antes de divulgar. Nunca é gerada a imagem de uma pessoa real sem a foto dela.</p>
    </form>

    <section>
      <h2>Minhas imagens</h2>
      {looks.length === 0 && <p className="look-meta">Nenhuma imagem gerada ainda.</p>}
      <div className="cards">
        {looks.map((l: any) => (
          <div className="card" key={l.id}>
            <img src={`/api/provador/${l.id}`} alt={`Provador: ${l.item_names}`} style={{ width: "100%", borderRadius: 12 }} />
            <p><strong>{l.item_names}</strong></p>
            <p className="look-meta">{PROVADOR_MODEL_LABEL[l.model_kind] || l.model_kind} · {new Date(l.created_at).toLocaleDateString("pt-BR")}</p>
            <div className="action-row">
              <a href={`/api/provador/${l.id}`} download={`provador-${l.id.slice(0, 8)}.png`}><button type="button">Baixar</button></a>
              <form action={deleteProvadorLook}><input type="hidden" name="look_id" value={l.id} /><SubmitButton className="link" pendingText="Removendo...">Remover</SubmitButton></form>
            </div>
          </div>
        ))}
      </div>
    </section>
  </main>;
}
