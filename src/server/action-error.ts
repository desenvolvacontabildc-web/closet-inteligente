import "server-only";
import { redirect } from "next/navigation";

/** Em produção o Next.js apaga a mensagem de erros lançados em Server Actions (só manda
 * um "digest" opaco ao cliente, por segurança). Isso deixava toda validação de formulário
 * silenciosa para a usuária. Em vez de `throw new Error(msg)`, use `bounce(path, msg)`:
 * ele usa o mecanismo de redirect (que preserva a mensagem na URL), igual ao fluxo de login. */
export function bounce(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
