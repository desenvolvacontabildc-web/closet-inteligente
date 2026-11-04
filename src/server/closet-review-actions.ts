"use server";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { flash } from "./flash";

const BACK = "/closet/revisao";

const DECISIONS: Record<string, { sql: string; message: string; kind: "ok" | "info" }> = {
  KEEP: {
    sql: "UPDATE closet_items SET keep_until = now() + interval '90 days', last_reviewed_at = now() WHERE id = $1 AND status = 'ACTIVE'",
    message: "Combinado: ela fica no closet e eu só pergunto de novo daqui a 3 meses.",
    kind: "ok",
  },
  DONATE: {
    sql: "UPDATE closet_items SET status = 'DONATED', last_reviewed_at = now() WHERE id = $1 AND status = 'ACTIVE'",
    message: "Marcada como doada. Ela sai das sugestões de look (dá para reativar na tela da peça).",
    kind: "info",
  },
  DISCARD: {
    sql: "UPDATE closet_items SET status = 'DISCARDED', last_reviewed_at = now() WHERE id = $1 AND status = 'ACTIVE'",
    message: "Marcada como descartada. Ela sai das sugestões de look (dá para reativar na tela da peça).",
    kind: "info",
  },
};

/** Resposta da usuária na revisão: manter (pergunta de novo em 3 meses), doar ou descartar. Doar/descartar
 * só muda o status da peça (não apaga nada), então dá para desfazer. */
export async function reviewItem(f: FormData) {
  const id = String(f.get("item_id") || "");
  const decision = DECISIONS[String(f.get("decision") || "")];
  if (!/^[0-9a-f-]{36}$/i.test(id) || !decision) bounce(BACK, "Peça ou decisão inválida.");
  const ok = await withProfile(async (c) => {
    const r = await c.query(decision.sql, [id]);
    return (r.rowCount ?? 0) > 0;
  });
  if (ok === null) redirect("/");
  if (!ok) bounce(BACK, "Essa peça não está mais ativa no closet.");
  await flash(decision.message, decision.kind);
  redirect(BACK);
}

/** "Agora não": esconde o lembrete da Home por 30 dias. */
export async function snoozeClosetReview(f: FormData) {
  const returnPath = String(f.get("return_path") || "/home") === "/closet" ? "/closet" : "/home";
  await withProfile(async (c, userId) => {
    await c.query("UPDATE profiles SET closet_review_snooze_until = now() + interval '30 days' WHERE user_id = $1", [userId]);
    return true;
  });
  await flash("Combinado: lembro você da revisão do closet daqui a 30 dias.", "info");
  redirect(returnPath);
}
