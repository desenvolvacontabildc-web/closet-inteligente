import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";

export default async function Vitrine() {
  const data = await withProfile(async (c) => {
    const partnerRows = (await c.query("SELECT * FROM storefront_list()")).rows;
    const finds = (await c.query("SELECT * FROM list_active_finds()")).rows;
    return { partnerRows, finds };
  });
  if (!data) redirect("/");
  const { partnerRows, finds } = data;

  const stores = new Map<string, { store_name: string; instagram: string; whatsapp: string; items: any[] }>();
  for (const r of partnerRows) {
    if (!stores.has(r.partner_id)) stores.set(r.partner_id, { store_name: r.store_name, instagram: r.instagram, whatsapp: r.whatsapp, items: [] });
    stores.get(r.partner_id)!.items.push(r);
  }

  return <main className="shell">
    <a href="/home">← Voltar</a>
    <section className="hero">
      <span className="eyebrow">VITRINE DE PARCEIRAS</span>
      <h1>Compre com desconto nas nossas lojas parceiras.</h1>
      <p>Peças selecionadas pelas lojas parceiras do Closet Inteligente, com desconto exclusivo. Fale direto com a loja pelo WhatsApp ou conheça o Instagram.</p>
    </section>
    {stores.size === 0 && <p>Nenhuma loja parceira publicou peças ainda.</p>}
    {[...stores.entries()].map(([id, store]) => (
      <section key={id} className="card">
        <h2>{store.store_name}</h2>
        <p className="links">
          {store.instagram && <a href={`https://instagram.com/${store.instagram}`} target="_blank" rel="noopener noreferrer">Instagram @{store.instagram}</a>}
          {store.whatsapp && <a href={`https://wa.me/${store.whatsapp}`} target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>}
        </p>
        <div className="cards">
          {store.items.map((it) => (
            <div className="card secondary" key={it.item_id}>
              {it.object_key && <img src={`/api/vitrine/photos/${it.item_id}`} alt={it.item_name} style={{ width: "100%", borderRadius: 12 }} />}
              <h3>{it.item_name}</h3>
              {it.description && <p>{it.description}</p>}
              <p>
                {it.discount_percent > 0
                  ? <>R$ {(it.price_cents * (1 - it.discount_percent / 100) / 100).toFixed(2)} <s>R$ {(it.price_cents / 100).toFixed(2)}</s> · {it.discount_percent}% OFF</>
                  : <>R$ {(it.price_cents / 100).toFixed(2)}</>}
              </p>
            </div>
          ))}
        </div>
      </section>
    ))}

    <section className="hero">
      <span className="eyebrow">ACHADINHOS</span>
      <h1>Dica de amiga.</h1>
      <p>Peças encontradas em outras lojas (Shopee, Shein e afins) e recomendadas por aqui — clique e compre direto na loja de origem.</p>
    </section>
    {finds.length === 0 && <p>Nenhum achadinho publicado ainda.</p>}
    <div className="cards">
      {finds.map((f: any) => (
        <a className="card secondary find-card" href={f.external_url} target="_blank" rel="noopener noreferrer" key={f.id}>
          {f.object_key && <img src={`/api/achadinhos/photos/${f.id}`} alt={f.title} style={{ width: "100%", borderRadius: 12 }} />}
          <h3>{f.title}</h3>
          {f.description && <p>{f.description}</p>}
          {f.price_cents != null && <p>R$ {(f.price_cents / 100).toFixed(2)}</p>}
          <button>Comprar na loja</button>
        </a>
      ))}
    </div>
  </main>;
}
