import { withProfile } from "@/server/profile-session";
import { dismissAnnouncement } from "@/server/announcement-actions";

/** Comunicados da administradora no topo da tela inicial. Nunca derruba a página se algo falhar. */
export default async function AnnouncementsBanner() {
  let rows: { id: string; title: string; body: string }[] = [];
  try { rows = (await withProfile(async (c, userId) => (await c.query("SELECT * FROM my_announcements($1)", [userId])).rows, { allowSuspended: true })) || []; } catch { rows = []; }
  if (rows.length === 0) return null;
  return <>{rows.map((n) => (
    <div className="announce" key={n.id} role="status">
      <div><strong>{n.title}</strong>{n.body && <p>{n.body}</p>}</div>
      <form action={dismissAnnouncement}><input type="hidden" name="id" value={n.id} /><button type="submit" className="link">Entendi</button></form>
    </div>
  ))}</>;
}
