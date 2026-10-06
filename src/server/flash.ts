import "server-only";
import { cookies } from "next/headers";

/** Mensagem de sucesso/aviso mostrada como toast logo depois da Server Action terminar.
 * Fica num cookie de vida curta (lido e apagado pelo <FlashToast/> no navegador).
 * Erros de validação continuam usando `bounce()` (mensagem na URL) -- o toast também as exibe. */
export async function flash(message: string, kind: "ok" | "info" = "ok"): Promise<void> {
  (await cookies()).set("flash", encodeURIComponent(JSON.stringify({ m: message, k: kind })), { path: "/", maxAge: 60, httpOnly: false, sameSite: "lax" });
}
