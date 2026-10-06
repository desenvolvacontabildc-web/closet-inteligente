import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { aiUsageRemaining } from "@/server/limits";
import { analyzeLookPhoto } from "@/server/look-analysis-actions";
import SubmitButton from "@/components/submit-button";

export default async function AnalisarLook({ searchParams }: { searchParams: Promise<{ error?: string; f_occasion?: string }> }) {
  const { error, f_occasion } = await searchParams;
  const data = await withProfile(async (c, userId) => ({ aiRemaining: await aiUsageRemaining(c, userId) }));
  if (!data) redirect("/");
  const { aiRemaining } = data;

  return <main className="shell narrow">
    <div className="top"><span className="eyebrow">ANALISAR LOOK</span><Link href="/looks">← Meus looks</Link></div>
    <h1>Analisar esse look</h1>
    <p className="look-meta">Tire (ou escolha) uma foto sua usando o look. A consultora de imagem do app dá uma opinião sincera sobre caimento, proporção e cores, sugere o que mudar e diz quando usar. Se gostar do resultado, você salva como look pronto para repetir em outras ocasiões.</p>
    {error && <p role="alert" className="trial-banner">{error}</p>}
    <form action={analyzeLookPhoto} encType="multipart/form-data" className="form">
      <label>Foto do look (de corpo inteiro ou meio corpo, com boa luz)
        <input type="file" name="photo" accept="image/*" required />
      </label>
      <label>Para qual ocasião é? (opcional)
        <input name="occasion" placeholder="Ex.: reunião de trabalho, jantar, casamento de dia" defaultValue={f_occasion || ""} />
      </label>
      <SubmitButton disabled={aiRemaining === 0} pendingText="Analisando seu look... (pode levar até 30s)">📸 Analisar meu look</SubmitButton>
      <p className="look-meta">
        {aiRemaining === 0 ? "⚠️ Seu limite de operações de IA acabou. Fale com a administradora para mudar de plano."
          : aiRemaining === null ? "Usa 1 operação de IA (ilimitadas no seu plano)." : `Usa 1 das suas ${aiRemaining} operações de IA restantes.`}
        {" "}Sua foto fica guardada só na sua conta e você pode descartá-la a qualquer momento.
      </p>
    </form>
  </main>;
}
