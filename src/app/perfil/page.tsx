import { redirect } from "next/navigation";
import Link from "next/link";
import { withProfile } from "@/server/profile-session";
import { logout } from "@/server/auth-actions";
import { uploadAvatar, setBodyAvatarReference, setDefaultVisualStyle, setCity } from "@/server/avatar-actions";
import { mySubscription, PLAN_LABEL } from "@/server/limits";
import SubmitButton from "@/components/submit-button";

const STYLE_LABEL: Record<string, string> = { REALISTA: "Fotografia realista", AVATAR: "Meu avatar", ILUSTRACAO: "Ilustração" };

export default async function Perfil({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const {error} = await searchParams;
  const data = await withProfile(async (c, userId) => {
    const p = (await c.query("SELECT display_name, avatar_object_key, avatar_illustration_object_key, default_visual_style, city FROM profiles WHERE user_id=$1", [userId])).rows[0];
    const u = (await c.query("SELECT email, is_admin FROM app_users WHERE id=$1", [userId])).rows[0];
    const sub = await mySubscription(c, userId);
    return {
      displayName: p?.display_name || "", hasAvatar: !!p?.avatar_object_key,
      hasStyleAvatar: !!p?.avatar_illustration_object_key, defaultVisualStyle: p?.default_visual_style || "ILUSTRACAO",
      city: p?.city || "", email: u.email, isAdmin: u.is_admin, sub,
    };
  });
  if (!data) redirect("/");
  const { displayName, hasAvatar, hasStyleAvatar, defaultVisualStyle, city, email, isAdmin, sub } = data;

  return <main className="shell narrow">
    <span className="eyebrow">PERFIL</span>
    {error && <p role="alert" className="trial-banner">{error}</p>}
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
      <h2>Meu avatar de estilo</h2>
      <p className="look-meta">Um avatar ilustrado com as proporções do seu corpo, usado como referência nas imagens de look geradas. É diferente da sua foto de perfil (acima) e nunca a substitui.</p>
      {hasStyleAvatar
        ? <img className="avatar" style={{width:120,height:120}} src="/api/perfil/avatar-ilustracao" alt="Seu avatar de estilo"/>
        : <p className="look-meta">Você ainda não criou um avatar.</p>}
      <form action={setBodyAvatarReference} encType="multipart/form-data" className="form">
        <label>Foto de corpo inteiro, de frente (usada só como referência, nunca exibida nem compartilhada)
          <input type="file" name="body_photo" accept="image/*" required/>
        </label>
        <label className="checkbox"><input type="checkbox" name="body_photo_consent"/> Autorizo o uso desta foto só como referência para gerar meu avatar.</label>
        <SubmitButton pendingText="Gerando avatar... (até 30s)">{hasStyleAvatar ? "Atualizar meu avatar" : "Criar meu avatar"}</SubmitButton>
      </form>
    </div>

    <div className="card">
      <h2>Meu estilo padrão de visualização</h2>
      <p className="look-meta">Como você prefere ver as imagens de look geradas. Pode trocar a qualquer momento na hora de gerar cada imagem.</p>
      <form action={setDefaultVisualStyle} className="form">
        <select name="default_visual_style" defaultValue={defaultVisualStyle}>
          {Object.entries(STYLE_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
        <button>Salvar preferência</button>
      </form>
    </div>

    <div className="card">
      <h2>Sua cidade</h2>
      <p className="look-meta">Usamos pra puxar o clima na hora de sugerir looks (peça mais leve se estiver quente, casaco se estiver frio).</p>
      <form action={setCity} className="form">
        <input name="city" placeholder="Ex.: Recife, PE" defaultValue={city}/>
        <button>Salvar cidade</button>
      </form>
    </div>

    <div className="card">
      <h2>Sua assinatura</h2>
      <p>{sub.status === "TRIAL" ? "Teste gratuito" : `Plano ${PLAN_LABEL[sub.plan]}`} · status {sub.status}</p>
    </div>
    <nav className="nav-links">
      <Link href="/mala">Mala de Viagem</Link>
      <Link href="/capsula">Closet Cápsula</Link>
      <Link href="/cuidese">Cuide-se</Link>
      <Link href="/tendencias">Radar de Tendências</Link>
      {isAdmin && <Link href="/admin">Administração de contas</Link>}
      {isAdmin && <Link href="/admin/parceiras">Administração de parceiras</Link>}
      {isAdmin && <Link href="/admin/tendencias">Administração de tendências</Link>}
      {isAdmin && <Link href="/admin/achadinhos">Administração de achadinhos</Link>}
    </nav>
    <form action={logout}><button className="link">Sair da conta</button></form>
  </main>;
}
