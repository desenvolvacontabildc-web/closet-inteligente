import { register, login } from "@/server/auth-actions";
const LOGIN_ERRORS = ["credentials", "blocked", "trial_expired"];
export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string; ref?: string }> }) {
  const { error, ref } = await searchParams;
  const registerError = error && !LOGIN_ERRORS.includes(error) ? error : null;
  return <main className="shell landing">
    <header className="brand-bar"><span className="brand-mark" aria-hidden="true">CI</span><span className="brand-name">Closet Inteligente</span></header>
    <section className="hero">
      <span className="eyebrow">Seu estilo, organizado</span>
      <h1>Um closet que conhece você.</h1>
      <hr className="hero-rule" />
      <p>Comece com seu perfil e receba uma experiência feita para o seu jeito.</p>
      <p>Não é só um closet: é um estilo que evolui com você -- looks pensados pro seu dia, sugestões que melhoram com o uso, e recompensas por continuar ativa (créditos de bônus no cadastro, em marcos de uso e quando você indica uma amiga).</p>
    </section>
    <div className="cards">
      <form action={register} className="card" id="criar-conta">
        <h2>Criar conta</h2>
        {registerError && <p role="alert">{registerError}</p>}
        <label>Seu nome<input name="name" required /></label>
        <label>E-mail<input name="email" type="email" required /></label>
        <label>Senha<input name="password" type="password" minLength={6} required /></label>
        <label>Código de indicação (opcional)<input name="referral_code" defaultValue={ref || ""} placeholder="Se uma amiga te indicou, cole aqui" /></label>
        <label className="checkbox"><input type="checkbox" name="terms" required /> Li e aceito os <a href="/termos" target="_blank">Termos de Uso</a> e a <a href="/privacidade" target="_blank">Política de Privacidade</a>.</label>
        <button>Criar meu Closet</button>
      </form>
      <form action={login} className="card secondary">
        <h2>Já tenho conta</h2>
        {error === "credentials" && <p role="alert">E-mail ou senha inválidos.</p>}
        {error === "blocked" && <p role="alert">Acesso bloqueado. Fale com a equipe do Closet.</p>}
        <label>E-mail<input name="email" type="email" required /></label>
        <label>Senha<input name="password" type="password" required /></label>
        <button>Entrar</button>
      </form>
    </div>
    <footer className="landing-foot"><span>© Closet Inteligente</span><a href="/termos">Termos de Uso</a><a href="/privacidade">Privacidade</a></footer>
  </main>;
}
