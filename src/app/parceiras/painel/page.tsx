import { withPartner, partnerLogout } from "@/server/partner-auth";
import { addPartnerItem, removePartnerItem } from "@/server/partner-items-actions";
import { PARTNER_PACKAGE_LIMIT, PARTNER_PACKAGE_LABEL } from "@/server/partner-limits";
import { redirect } from "next/navigation";

export default async function PainelParceira({ searchParams }: { searchParams: Promise<{ novo?: string; error?: string }> }) {
  const { novo, error } = await searchParams;
  const data = await withPartner(async (c, partnerId, storeName, pkg, approved) => {
    const items = (await c.query("SELECT * FROM partner_list_own_items($1)", [partnerId])).rows;
    return { storeName, pkg, approved, items };
  });
  if (!data) redirect("/parceiras");
  const { storeName, pkg, approved, items } = data;
  const limit = PARTNER_PACKAGE_LIMIT[pkg] ?? null;
  const used = items.length;

  return <main className="shell">
    <section className="hero">
      <span className="eyebrow">PAINEL DA LOJA</span>
      <h1>{storeName}</h1>
      {novo === "1" && <p role="status">Cadastro criado! {!approved && "Sua loja entra na vitrine assim que a equipe do Closet aprovar."}</p>}
      {error && <p role="alert">{error}</p>}
      {!approved && <p role="alert">Sua loja ainda não foi aprovada pela equipe do Closet Inteligente. Ela não aparece na vitrine pública até a aprovação.</p>}
      <p>Pacote atual: <strong>{PARTNER_PACKAGE_LABEL[pkg] || pkg}</strong> · {used}{limit != null ? `/${limit}` : ""} peças publicadas</p>
      <form action={partnerLogout}><button className="link">Sair</button></form>
    </section>

    <section className="card">
      <h2>Publicar nova peça</h2>
      {limit != null && used >= limit
        ? <p role="alert">Você atingiu o limite de peças do seu pacote. Fale com a equipe do Closet para fazer upgrade.</p>
        : <form action={addPartnerItem} encType="multipart/form-data" className="form">
            <label>Nome da peça<input name="name" required/></label>
            <label>Descrição<textarea name="description" rows={2}/></label>
            <label>Preço (R$)<input name="price" type="number" step="0.01" min="0" required/></label>
            <label>Desconto (%)<input name="discount" type="number" min="0" max="90" defaultValue={0}/></label>
            <label>Foto<input name="photo" type="file" accept="image/*"/></label>
            <button>Publicar</button>
          </form>}
    </section>

    <section className="cards">
      {items.map((it: any) => (
        <div className="card" key={it.id}>
          {it.object_key && <img src={`/api/vitrine/photos/${it.id}`} alt={it.name} style={{ width: "100%", borderRadius: 12 }} />}
          <h3>{it.name}</h3>
          {it.description && <p>{it.description}</p>}
          <p>R$ {(it.price_cents / 100).toFixed(2).replace(".", ",")}{it.discount_percent > 0 && ` · ${it.discount_percent}% OFF`}</p>
          <form action={removePartnerItem}>
            <input type="hidden" name="item_id" value={it.id} />
            <button className="link">Remover</button>
          </form>
        </div>
      ))}
      {items.length === 0 && <p>Nenhuma peça publicada ainda.</p>}
    </section>
  </main>;
}
