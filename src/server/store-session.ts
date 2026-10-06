import "server-only";
import { redirect } from "next/navigation";
import type { PoolClient } from "pg";
import { withProfile } from "./profile-session";

/** Contexto da loja parceira de uma usuária logada: a loja é um perfil da MESMA conta (mesmo
 * login), então a identidade vem só da sessão da usuária -- nunca de um id vindo do cliente.
 * Sem loja -> manda pra tela de abrir loja. A área da loja continua acessível mesmo se o plano
 * de usuária estiver vencido (a loja tem a própria mensalidade). Devolve null sem sessão. */
export async function withStore<T>(work: (c: PoolClient, userId: string, partnerId: string) => Promise<T>): Promise<T | null> {
  return withProfile(async (c, userId) => {
    const partnerId = (await c.query("SELECT my_partner_id($1) id", [userId])).rows[0]?.id as string | null;
    if (!partnerId) redirect("/parceiras");
    return work(c, userId, partnerId);
  }, { allowSuspended: true });
}
