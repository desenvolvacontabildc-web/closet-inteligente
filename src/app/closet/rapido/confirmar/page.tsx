import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { confirmOutfitScan, discardOutfitScan } from "@/server/closet-quick";
import SubmitButton from "@/components/submit-button";

type P = { name: string; category: string; color: string; description: string };

export default async function ConfirmarPecas({ searchParams }: { searchParams: Promise<{ id?: string; error?: string }> }) {
  const { id, error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id || "")) redirect("/closet/rapido");
  const scan = await withProfile(async (c) => (await c.query("SELECT pieces FROM outfit_scans WHERE id=$1", [id])).rows[0] as { pieces: P[] } | undefined);
  if (scan === null) redirect("/");
  if (!scan) redirect("/closet/rapido?error=" + encodeURIComponent("Essa foto já foi cadastrada ou expirou. Envie de novo."));
  return <main className="shell narrow">
    <Link href="/closet/rapido">← Cadastro rápido</Link>
    <h1>Confirme as peças</h1>
    <p className="look-meta">A IA encontrou {scan.pieces.length} peça{scan.pieces.length === 1 ? "" : "s"} na foto. Desmarque o que não quiser e ajuste os nomes.</p>
    {error && <p role="alert" className="trial-banner">{error}</p>}
    <img className="scan-photo" src={`/api/closet/scan/${id}?w=480`} alt="Sua foto" />
    <form action={confirmOutfitScan} className="form">
      <input type="hidden" name="id" value={id} />
      {scan.pieces.map((p, i) => <fieldset className="scan-piece" key={i}>
        <label className="checkbox"><input type="checkbox" name={`keep_${i}`} defaultChecked /> Cadastrar esta peça</label>
        <label>Nome<input name={`name_${i}`} defaultValue={p.name} maxLength={90} /></label>
        <div className="two-fields">
          <label>Categoria<input name={`category_${i}`} defaultValue={p.category} maxLength={40} /></label>
          <label>Cor<input name={`color_${i}`} defaultValue={p.color} maxLength={40} /></label>
        </div>
        {p.description && <p className="look-meta">{p.description}</p>}
      </fieldset>)}
      <SubmitButton pendingText="Cadastrando as peças...">Cadastrar as peças marcadas</SubmitButton>
    </form>
    <form action={discardOutfitScan}><input type="hidden" name="id" value={id} /><button type="submit" className="link">Descartar esta foto</button></form>
  </main>;
}
