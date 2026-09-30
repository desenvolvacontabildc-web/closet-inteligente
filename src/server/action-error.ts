import "server-only";
import { redirect } from "next/navigation";

/** Em produção o Next.js apaga a mensagem de erros lançados em Server Actions (só manda
 * um "digest" opaco ao cliente, por segurança). Isso deixava toda validação de formulário
 * silenciosa para a usuária. Em vez de `throw new Error(msg)`, use `bounce(path, msg)`:
 * ele usa o mecanismo de redirect (que preserva a mensagem na URL), igual ao fluxo de login. */
/** `fields`, quando informado, devolve os valores já digitados na URL (prefixo `f_`), pra
 * a tela de origem pré-preencher o formulário e a cliente não precisar redigitar tudo
 * depois de um erro (nunca inclua a foto -- arquivos não sobrevivem ao redirect). */
export function bounce(path: string, message: string, fields?: Record<string, string>): never {
  const params = new URLSearchParams({ error: message });
  if (fields) for (const [k, v] of Object.entries(fields)) if (v) params.set(`f_${k}`, v);
  redirect(`${path}?${params.toString()}`);
}
