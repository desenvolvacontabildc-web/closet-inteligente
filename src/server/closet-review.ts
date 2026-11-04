import "server-only";
import type { PoolClient } from "pg";

export type ReviewCandidate = {
  id: string; name: string; category: string; color: string | null; photo_id: string | null;
  created_at: string; looks_count: number; worn_count: number; last_worn_at: string | null;
};

/** Peças ativas que merecem uma revisão: cadastradas há mais de 30 dias, sem uso (look marcado como
 * "usei") nos últimos 90 dias e que a cliente não pediu para manter recentemente. A ordem põe primeiro
 * as esquecidas (em nenhum look), depois as que nunca foram usadas e, por fim, as usadas há mais tempo. */
export async function reviewCandidates(c: PoolClient, limit: number): Promise<ReviewCandidate[]> {
  const r = await c.query(
    `SELECT ci.id, ci.name, ci.category, ci.color, ci.created_at,
       (SELECT p.id FROM closet_item_photos p WHERE p.item_id = ci.id ORDER BY p.created_at DESC LIMIT 1) AS photo_id,
       (SELECT count(*)::int FROM look_items li JOIN looks l ON l.id = li.look_id WHERE li.item_id = ci.id AND l.kind <> 'ANALYSIS' AND l.status <> 'REJECTED') AS looks_count,
       (SELECT count(*)::int FROM look_items li JOIN looks l ON l.id = li.look_id WHERE li.item_id = ci.id AND l.status = 'WORN') AS worn_count,
       (SELECT max(l.worn_at) FROM look_items li JOIN looks l ON l.id = li.look_id WHERE li.item_id = ci.id AND l.status = 'WORN') AS last_worn_at
     FROM closet_items ci
     WHERE ci.status = 'ACTIVE'
       AND ci.created_at < now() - interval '30 days'
       AND (ci.keep_until IS NULL OR ci.keep_until < now())
       AND NOT EXISTS (SELECT 1 FROM look_items li JOIN looks l ON l.id = li.look_id WHERE li.item_id = ci.id AND l.status = 'WORN' AND l.worn_at > now() - interval '90 days')
     ORDER BY (SELECT count(*) FROM look_items li JOIN looks l ON l.id = li.look_id WHERE li.item_id = ci.id AND l.kind <> 'ANALYSIS' AND l.status <> 'REJECTED') = 0 DESC,
              (SELECT count(*) FROM look_items li JOIN looks l ON l.id = li.look_id WHERE li.item_id = ci.id AND l.status = 'WORN') = 0 DESC,
              COALESCE((SELECT max(l.worn_at) FROM look_items li JOIN looks l ON l.id = li.look_id WHERE li.item_id = ci.id AND l.status = 'WORN'), ci.created_at) ASC
     LIMIT $1`,
    [limit],
  );
  return r.rows;
}

/** Por que a peça apareceu na revisão, em linguagem simples. */
export function reviewReason(r: ReviewCandidate): string {
  if (r.looks_count === 0) return "Nunca entrou em nenhum look.";
  if (r.worn_count === 0) return `Está em ${r.looks_count} look${r.looks_count === 1 ? "" : "s"}, mas você nunca marcou nenhum como usado.`;
  const days = r.last_worn_at ? Math.floor((Date.now() - new Date(r.last_worn_at).getTime()) / 86400000) : null;
  return days !== null ? `Você usou pela última vez há ${days} dias.` : "Faz tempo que não aparece nos seus looks usados.";
}
