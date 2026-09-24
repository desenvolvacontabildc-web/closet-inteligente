import Link from "next/link";
const EM_PREPARACAO = [
  { title: "Meu Cabelo", desc: "Consultoria de cor e corte, com simulação visual." },
  { title: "Cronograma Capilar", desc: "Hidratação, nutrição e reconstrução, com checklist." },
  { title: "Skincare", desc: "Rotina de manhã e noite, acompanhada de perto." },
  { title: "Minha Maquiagem", desc: "Sugestões de maquiagem por ocasião." },
  { title: "Meus Produtos", desc: "Catálogo dos produtos de beleza que você já tem." },
  { title: "Agenda de Autocuidado", desc: "Todas as suas rotinas de cuidado num só lugar." },
];
export default function CuideSe() {
  return <main className="shell narrow">
    <Link href="/perfil">← Perfil</Link>
    <h1>Cuide-se</h1>
    <p>Sua consultora não cuida só do closet — aqui reunimos as experiências de imagem pessoal e autocuidado.</p>
    <Link href="/colorimetria" className="card secondary find-card">
      <h2>Colorimetria pessoal</h2>
      <p>Descubra seu subtom e a paleta de cores que mais te favorece.</p>
    </Link>
    {EM_PREPARACAO.map(m => (
      <div className="card" key={m.title} style={{ opacity: 0.6 }}>
        <h2>{m.title} <small>· em preparação</small></h2>
        <p>{m.desc}</p>
      </div>
    ))}
  </main>;
}
