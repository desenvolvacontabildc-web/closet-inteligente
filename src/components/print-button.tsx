"use client";

/** Abre a impressão do navegador (dá para "Salvar como PDF" e levar a visão geral da mala). */
export default function PrintButton({ children, className }: { children: React.ReactNode; className?: string }) {
  return <button type="button" className={className} onClick={() => window.print()}>{children}</button>;
}
