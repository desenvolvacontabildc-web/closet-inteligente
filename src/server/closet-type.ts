import "server-only";
import type { PoolClient } from "pg";
import { getPool } from "./db";

/** Tipo de closet da conta: define para quem os looks são montados (mulher, homem ou criança). */
export type ClosetType = "FEMININO" | "MASCULINO" | "INFANTIL";
export const CLOSET_TYPES: { value: ClosetType; label: string; desc: string }[] = [
  { value: "FEMININO", label: "Closet feminino", desc: "Looks, cores e cuidados pensados para mulheres." },
  { value: "MASCULINO", label: "Closet masculino", desc: "Looks e sugestões com roupas e estilos masculinos." },
  { value: "INFANTIL", label: "Closet infantil", desc: "Looks para criança: conforto, praticidade e a idade certa. Quem usa o app é o responsável." },
];
export const isClosetType = (v: unknown): v is ClosetType => v === "FEMININO" || v === "MASCULINO" || v === "INFANTIL";

type Kind = { type: ClosetType; age: number | null };
const norm = (row: any): Kind => ({ type: isClosetType(row?.closet_type) ? row.closet_type : "FEMININO", age: row?.closet_age == null ? null : Number(row.closet_age) });

/** Dentro de uma transação já aberta. */
export async function closetKindC(c: PoolClient, userId: string): Promise<Kind> {
  return norm((await c.query("SELECT * FROM closet_profile($1)", [userId])).rows[0]);
}
/** Sem sessão aberta (usa a função do banco que não depende do usuário logado). */
export async function closetKind(userId: string): Promise<Kind> {
  try { return norm((await getPool().query("SELECT * FROM closet_profile($1)", [userId])).rows[0]); } catch { return { type: "FEMININO", age: null }; }
}

/** Trecho que entra nas instruções da IA de texto (vazio no closet feminino, que é o comportamento de sempre). */
export function closetNote(k: Kind): string {
  if (k.type === "MASCULINO") return " ESTE É UM CLOSET MASCULINO: todas as peças, looks e sugestões são para um homem. Use só estilos e peças masculinos (nunca sugira peças femininas) e fale no masculino.";
  if (k.type === "INFANTIL") return ` ESTE É UM CLOSET INFANTIL${k.age != null ? ` (criança de ${k.age} ano${k.age === 1 ? "" : "s"})` : ""}: os looks são para uma criança e quem usa o app é o responsável. Priorize conforto, praticidade, liberdade para brincar e segurança, com peças adequadas à idade; nada de modelagem, decote, salto ou estilo adulto.`;
  return "";
}
/** Trecho para o prompt de imagem: quem aparece na ilustração. */
export function closetImageNote(k: Kind): string {
  if (k.type === "MASCULINO") return "A pessoa retratada é um HOMEM (corpo, caimento e estilo masculinos); ignore qualquer referência feminina no texto a seguir. ";
  if (k.type === "INFANTIL") return `A figura retratada é UMA CRIANÇA${k.age != null ? ` de cerca de ${k.age} anos` : ""}, estilizada e genérica (sem identidade real e sem rosto detalhado), com proporções infantis e pose simples e adequada. É ilustração, nunca fotografia; ignore qualquer referência feminina ou adulta no texto a seguir. `;
  return "";
}

/** Verdadeiro quando a conta é de closet infantil (Colorimetria e Cuide-se não se aplicam a crianças). */
export async function kidCloset(): Promise<boolean> {
  const { withProfile } = await import("./profile-session");
  const r = await withProfile(async (c, userId) => (await closetKindC(c, userId)).type === "INFANTIL", { allowSuspended: true });
  return !!r;
}
