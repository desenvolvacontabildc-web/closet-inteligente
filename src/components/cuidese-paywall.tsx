import Link from "next/link";
import { brl } from "@/server/extras";

/** Mostrado no lugar do Skincare e do Cronograma Capilar para quem não tem o Cuide-se (add-on do plano Arrumada). */
export default function CuidesePaywall({ title, priceCents, until }: { title: string; priceCents: number; until?: Date | null }) {
  return <main className="shell narrow">
    <Link href="/cuidese">← Cuide-se</Link>
    <span className="eyebrow">CUIDE-SE</span>
    <h1>{title}</h1>
    <section className="card hair-finish">
      <h2>O Cuide-se é um extra</h2>
      <p>
        {until ? `Seu acesso ao Cuide-se terminou em ${until.toLocaleDateString("pt-BR")}. ` : ""}
        Skincare e Cronograma Capilar fazem parte dos planos Fashion e Super Star. No plano Arrumada, você libera os dois por <strong>{brl(priceCents)} por mês</strong>.
      </p>
      <p className="look-meta">Seus dados e o histórico ficam guardados e voltam assim que o acesso for liberado.</p>
      <Link href="/assinatura/extras#cuidese" className="button-link">Ver como liberar o Cuide-se</Link>
    </section>
  </main>;
}
