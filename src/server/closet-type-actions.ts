"use server";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { flash } from "./flash";
import { isClosetType } from "./closet-type";

/** Troca o tipo de closet da conta (Perfil). As peças já cadastradas continuam; mudam as sugestões e o estilo das imagens. */
export async function saveClosetType(f: FormData) {
  const type = String(f.get("closet_type") || "");
  const ageRaw = String(f.get("closet_age") || "").trim();
  const age = ageRaw === "" ? null : Math.floor(Number(ageRaw));
  if (!isClosetType(type)) bounce("/perfil", "Escolha um tipo de closet.");
  if (type === "INFANTIL" && age !== null && !(age >= 0 && age <= 17)) bounce("/perfil", "Informe a idade da criança (0 a 17 anos) ou deixe em branco.");
  const ok = await withProfile(async (c, userId) => { await c.query("SELECT set_closet_type($1,$2,$3)", [userId, type, type === "INFANTIL" ? age : null]); return true; });
  if (!ok) redirect("/");
  await flash("Tipo de closet atualizado.");
  redirect("/perfil");
}
