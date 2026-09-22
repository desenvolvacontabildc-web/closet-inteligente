import { partnerRegister, partnerLogin } from "@/server/partner-auth";
export default async function Parceiras({searchParams}:{searchParams:Promise<{error?:string}>}){
  const error=(await searchParams).error;
  return <main className="shell">
    <section className="hero"><span className="eyebrow">CLOSET INTELIGENTE · PARCEIRAS</span><h1>Sua loja na vitrine do Closet.</h1><p>Cadastre sua loja, publique peças com desconto exclusivo pras clientes do Closet Inteligente, e receba contato direto pelo WhatsApp ou Instagram.</p></section>
    {error&&error!=="credentials"&&<p role="alert" className="trial-banner">{error}</p>}
    <div className="cards">
      <form action={partnerRegister} className="card">
        <h2>Cadastrar minha loja</h2>
        <label>Nome da loja<input name="store_name" required/></label>
        <label>E-mail<input name="email" type="email" required/></label>
        <label>Senha<input name="password" type="password" minLength={6} required/></label>
        <label>Instagram (usuário, sem @)<input name="instagram" placeholder="minhaloja"/></label>
        <label>WhatsApp (com DDD, só números)<input name="whatsapp" placeholder="5581999999999"/></label>
        <label>Pacote
          <select name="package" defaultValue="BASICA">
            <option value="BASICA">Vitrine Básica — até 10 peças</option>
            <option value="PLUS">Vitrine Plus — até 30 peças</option>
            <option value="PREMIUM">Vitrine Premium — peças ilimitadas</option>
          </select>
        </label>
        <button>Criar minha vitrine</button>
      </form>
      <form action={partnerLogin} className="card secondary">
        <h2>Já sou parceira</h2>
        {error==="credentials"&&<p role="alert">E-mail ou senha inválidos.</p>}
        <label>E-mail<input name="email" type="email" required/></label>
        <label>Senha<input name="password" type="password" required/></label>
        <button>Entrar</button>
      </form>
    </div>
  </main>;
}
