/** Esqueleto mostrado na hora em qualquer navegação, enquanto a próxima tela é montada no servidor. */
export default function Loading() {
  return <main className="shell" aria-busy="true" aria-label="Carregando">
    <div className="skeleton sk-eyebrow" />
    <div className="skeleton sk-title" />
    <div className="skeleton sk-card" />
    <div className="skeleton sk-card sk-short" />
  </main>;
}
