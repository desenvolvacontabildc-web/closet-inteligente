import { withProfile } from "@/server/profile-session";
import { switchCloset } from "@/server/family-actions";

/** Faixa "Closet: Maria · João" no topo da tela inicial, só para contas com mais de um closet. */
export default async function ClosetSwitcher() {
  let data: { me: string; fam: any[] } | null = null;
  try { data = await withProfile(async (c, userId) => ({ me: userId, fam: (await c.query("SELECT user_id, name, is_main FROM my_family($1)", [userId])).rows }), { allowSuspended: true }); } catch { data = null; }
  if (!data || data.fam.length < 2) return null;
  return <nav className="closet-chips" aria-label="Seus closets">
    <span className="closet-chips-label">Closet</span>
    {data.fam.map((m) => m.user_id === data!.me
      ? <span key={m.user_id} className="closet-chip on" aria-current="true">{m.name || "Principal"}</span>
      : <form key={m.user_id} action={switchCloset}><input type="hidden" name="closet_id" value={m.user_id} /><button type="submit" className="closet-chip">{m.name || "Principal"}</button></form>)}
  </nav>;
}
