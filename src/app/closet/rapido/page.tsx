import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { aiUsageRemaining } from "@/server/limits";
import { closetKindC } from "@/server/closet-type";
import { quickAddPieces, scanOutfit } from "@/server/closet-quick";
import PhotoPicker from "@/components/photo-picker";
import SubmitButton from "@/components/submit-button";

export default async function CadastroRapido({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const d = await withProfile(async (c, userId) => ({ ai: await aiUsageRemaining(c, userId), kid: (await closetKindC(c, userId)).type === "INFANTIL" }));
  if (!d) redirect("/");
  return <main className="shell narrow">
    <Link href="/closet">← Meu closet</Link>
    <h1>Cadastro rápido por foto</h1>
    <p className="look-meta">Sem digitar nada: a IA reconhece o nome, a categoria, a cor e a ficha de cada peça, e depois gera a foto de catálogo.</p>
    {error && <p role="alert" className="trial-banner">{error}</p>}
    {d.ai === 0 && <p role="alert" className="trial-banner">Seu limite de IA deste mês acabou. Veja os planos em Perfil → Assinatura.</p>}

    <div className="card">
      <h2>Várias peças de uma vez</h2>
      <p className="look-meta">Escolha até 8 fotos, uma peça por foto (a peça vestida, no cabide ou sobre a cama). Cada foto vira uma peça.</p>
      <form action={quickAddPieces} encType="multipart/form-data" className="form">
        <PhotoPicker name="photos" multiple max={8} label="Fotos das peças" hint="Dica: de frente, com boa luz e a peça inteira aparecendo." />
        <SubmitButton disabled={d.ai === 0} pendingText="Adicionando e reconhecendo as peças... (cerca de 5 segundos por foto)">Adicionar ao closet</SubmitButton>
      </form>
    </div>

    {!d.kid && <div className="card">
      <h2>Foto vestida: a IA separa as peças</h2>
      <p className="look-meta">Tire uma foto sua no espelho, de corpo inteiro, usando um look. A IA lista as peças e você confirma antes de cadastrar.</p>
      <form action={scanOutfit} encType="multipart/form-data" className="form">
        <PhotoPicker name="photo" label="Foto de corpo inteiro" hint="Corpo inteiro, boa luz, sem filtro. A foto vira a foto de cada peça e depois a IA gera a foto de catálogo." />
        <SubmitButton disabled={d.ai === 0} pendingText="A IA está olhando a foto... (até 30s)">Reconhecer as peças</SubmitButton>
      </form>
    </div>}
    <p className="look-meta">Prefere digitar? <Link href="/closet">Adicionar uma peça manualmente</Link>.</p>
  </main>;
}
