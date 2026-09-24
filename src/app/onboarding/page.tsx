import { redirect } from "next/navigation"; import { withProfile } from "@/server/profile-session";
import { saveOnboarding } from "@/server/auth-actions";
import { ACCENT_PALETTE } from "@/server/accent";
export default async function Onboarding({searchParams}:{searchParams:Promise<{error?:string}>}){const {error}=await searchParams;const done=await withProfile(async(c,id)=>(await c.query("SELECT onboarding_completed FROM profiles WHERE user_id=$1",[id])).rows[0]?.onboarding_completed);if(done===null||done===undefined)redirect("/");if(done)redirect("/home");return <main className="shell narrow"><span className="eyebrow">SEU COMEÇO</span><h1>Vamos conhecer você.</h1><p>Responda com calma. Essas escolhas personalizam a experiência inicial.</p>{error&&<p role="alert" className="trial-banner">{error}</p>}<form action={saveOnboarding} className="form" encType="multipart/form-data"><label>Sua foto (opcional)<input type="file" name="avatar" accept="image/*"/></label><fieldset><legend>Avatar de estilo (opcional)</legend><label>Foto de corpo inteiro, de frente<input type="file" name="body_photo" accept="image/*"/></label><label className="checkbox"><input type="checkbox" name="body_photo_consent"/> Autorizo o uso desta foto pela IA só para criar um avatar ilustrado (sem rosto real) com minhas proporções, pra eu ver como os looks ficam em mim.</label></fieldset><label>Como você quer se sentir ao se vestir?<textarea name="feeling" required /></label><label>Como você não quer parecer?<textarea name="avoid" required /></label><label>Sua rotina principal<select name="routine" defaultValue=""><option value="" disabled>Escolha</option><option>Escritório e clientes</option><option>Rotina variada</option><option>Casa e lazer</option></select></label><label>Seu estilo hoje<select name="style" defaultValue=""><option value="" disabled>Escolha</option><option>Clássico elegante</option><option>Moderno feminino</option><option>Casual sofisticado</option></select></label><label>Cor de destaque que você prefere
        <div className="swatches">
          {Object.entries(ACCENT_PALETTE).map(([label,hex])=>(
            <label key={label} className="swatch">
              <input type="radio" name="accent" value={label} defaultChecked={label==="Caramelo"}/>
              <span style={{background:hex}}/>
              {label}
            </label>
          ))}
        </div>
      </label><label>Como prefere receber opiniões?<select name="tone" defaultValue="acolhedor"><option value="direto">Direto</option><option value="acolhedor">Acolhedor</option><option value="detalhado">Detalhado</option></select></label><button>Preparar meu Closet</button></form></main>}

