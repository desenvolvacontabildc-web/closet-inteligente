import { redirect } from "next/navigation";
import Link from "next/link";
import { withProfile } from "@/server/profile-session";
import { logout } from "@/server/auth-actions";
import { uploadAvatar } from "@/server/avatar-actions";
import { mySubscription, PLAN_LABEL } from "@/server/limits";

export default async function Perfil() {
  const data = await withProfile(async (c, userId) => {
    const p = (await c.query("SELECT display_name, avatar_object_key FROM profiles WHERE user_id=$1", [userId])).rows[0];
    const u = (await c.query("SELECT email, is_admin FROM app_users WHERE id=$1", [userId])).rows[0];
    const sub = await mySubscription(c, userId);
    return { displayName: p?.display_name || "", hasAvatar: !!p?.avatar_object_key, email: u.email, isAdmin: u.is_admin, sub };
  });
  if (!data) redirect("/");
  const { displayName, hasAvatar, email, isAdmin, sub } = data;

  return <main className="shell narrow">
    <span className="eyebrow">PERFIL</span>
    <div className="avatar-row">
      {hasAvatar
        ? <img className="avatar" src="/api/perfil/foto" alt={displayName || "Foto de perfil"}/>
        : <span className="avatar avatar-placeholder">👤</span>}
      <div>
        <h1>{displayName || "Você"}</h1>
        <p>{email}</p>
      </div>
    </div>
    <form action={uploadAvatar} encType="multipart/form-data" className="form">
      <input type="hidden" name="redirect_to" value="/perfil"/>
      <label>{hasAvatar ? "Trocar foto" : "Adicionar foto"}<input type="file" name="avatar" accept="image/*" required/></label>
      <button>Salvar foto</button>
    </form>
    <div className="card">
      <h2>Sua assinatura</h2>
      <p>{sub.status === "TRIAL" ? "Teste gratuito" : `Plano ${PLAN_LABEL[sub.plan]}`} · status {sub.status}</p>
    </div>
    <nav className="nav-links">
      <Link href="/mala">Mala de Viagem</Link>
      <Link href="/capsula">Closet Cápsula</Link>
      <Link href="/colorimetria">Colorimetria</Link>
      <Link href="/tendencias">Radar de Tendências</Link>
      {isAdmin && <Link href="/admin">Administração de contas</Link>}
      {isAdmin && <Link href="/admin/parceiras">Administração de parceiras</Link>}
      {isAdmin && <Link href="/admin/tendencias">Administração de tendências</Link>}
      {isAdmin && <Link href="/admin/achadinhos">Administração de achadinhos</Link>}
    </nav>
    <form action={logout}><button className="link">Sair da conta</button></form>
  </main>;
}
