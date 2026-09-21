import { adminListPartners, setPartner } from "@/server/admin-partner-actions";
import { PARTNER_PACKAGE_LABEL } from "@/server/partner-limits";

export default async function AdminParceiras() {
  const { partners } = await adminListPartners();
  if (!partners) return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  return <main className="shell narrow">
    <a href="/home">← Voltar</a>
    <h1>Administração de parceiras</h1>
    {partners.length === 0 && <p>Nenhuma loja parceira cadastrada ainda.</p>}
    {partners.map((p: any) => (
      <section key={p.id} className="card">
        <h2>{p.store_name} {p.approved ? "· aprovada" : "· pendente"}</h2>
        <p>{p.email} · desde {new Date(p.created_at).toLocaleDateString("pt-BR")} · {p.item_count} peça(s) publicada(s)</p>
        <form action={setPartner} className="form">
          <input type="hidden" name="partner_id" value={p.id} />
          <label>Pacote
            <select name="package" defaultValue={p.package}>
              <option value="BASICA">{PARTNER_PACKAGE_LABEL.BASICA}</option>
              <option value="PLUS">{PARTNER_PACKAGE_LABEL.PLUS}</option>
              <option value="PREMIUM">{PARTNER_PACKAGE_LABEL.PREMIUM}</option>
            </select>
          </label>
          <label className="checkbox"><input type="checkbox" name="approved" defaultChecked={p.approved} /> Aprovada (aparece na vitrine)</label>
          <button>Salvar</button>
        </form>
      </section>
    ))}
  </main>;
}
