"use client";
import { useFormStatus } from "react-dom";

/** Botão de ação destrutiva: pede confirmação antes de enviar o formulário (cancelar não faz nada)
 * e mostra o estado de carregamento enquanto a ação roda. */
export default function ConfirmButton({ children, message, className, pendingText = "Excluindo..." }: { children: React.ReactNode; message: string; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {pending ? pendingText : children}
    </button>
  );
}
