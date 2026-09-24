import { adminListFinds, createFind, setFindActive, updateFind } from "@/server/find-actions";

export default async function AdminAchadinhos() {
  const finds = await adminListFinds();
  if (!finds) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;

  return <main className="shell narrow">
    <a href="/home">← Voltar</a>
    <h1>Achadinhos</h1>
    <p>Cole o link de um produto da Shopee, Shein ou outra loja — aparece pras clientes na Vitrine, com botão pra comprar direto no seu link.</p>
    <form action={createFind} encType="multipart/form-data" className="form">
      <h2>Novo achadinho</h2>
      <label>Título<input name="title" placeholder="Ex.: Blazer alfaiataria bege" required/></label>
      <label>Descrição (opcional)<textarea name="description" rows={2}/></label>
      <label>Preço (R$, opcional)<input name="price" placeholder="Ex.: 89,90"/></label>
      <label>Link do produto (Shopee, Shein, etc.)<input name="external_url" type="url" placeholder="https://..." required/></label>
      <label>Foto (opcional)<input type="file" name="photo" accept="image/*"/></label>
      <button>Publicar achadinho</button>
    </form>
    {finds.map((f: any) => (
      <section className="card" key={f.id}>
        {f.object_key && <img src={`/api/achadinhos/photos/${f.id}`} alt={f.title} style={{ width: "100%", borderRadius: 12, marginBottom: 8 }}/>}
        <h3>{f.title} {!f.active && "· oculto"}</h3>
        <form action={updateFind} encType="multipart/form-data" className="form">
          <input type="hidden" name="id" value={f.id}/>
          <label>Título<input name="title" defaultValue={f.title} required/></label>
          <label>Descrição<textarea name="description" rows={2} defaultValue={f.description}/></label>
          <label>Preço (R$)<input name="price" defaultValue={f.price_cents != null ? (f.price_cents / 100).toFixed(2).replace(".", ",") : ""} placeholder="Ex.: 89,90"/></label>
          <label>Link do produto<input name="external_url" type="url" defaultValue={f.external_url} required/></label>
          <label>{f.object_key ? "Trocar foto" : "Adicionar foto"}<input type="file" name="photo" accept="image/*"/></label>
          <button>Salvar alterações</button>
        </form>
        <form action={setFindActive}>
          <input type="hidden" name="id" value={f.id}/>
          <input type="hidden" name="active" value={f.active ? "off" : "on"}/>
          <button className="link">{f.active ? "Ocultar" : "Reativar"}</button>
        </form>
      </section>
    ))}
  </main>;
}
