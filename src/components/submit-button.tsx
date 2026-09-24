"use client";
import { useFormStatus } from "react-dom";

/** Botão de formulário com estado de carregamento -- pra operações lentas (IA, imagem)
 * não parecerem travadas quando na verdade só estão demorando (10-40s é normal). */
export default function SubmitButton({ children, pendingText, className, disabled }: { children: React.ReactNode; pendingText: string; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={disabled || pending}>
      {pending ? pendingText : children}
    </button>
  );
}
