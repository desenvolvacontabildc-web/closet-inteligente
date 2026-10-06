import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { openPartnerStore } from "@/server/partner-items-actions";
import { PARTNER_PACKAGE_LABEL } from "@/server/partner-limits";
import SubmitButton from "@/components/submit-button";

export default async function Parceiras({ searchParams }: { searchParams: Promise<{ error?: string; f_store_name?: string; f_instagram?: string; f_whatsapp?: string }> }) {
  const { error, f_store_name, f_instagram, f_whatsapp } = await searchParams;
  const session = await withProfile(async (c, userId) => ({ partnerId: (await c.query("SELECT my_partner_id($1) id", [userId])).rows[0]?.id as string | null }), { allowSuspended: true });
  if (session?.partnerId) redirect("/minha-vitrine");

  return <main className="shell narrow">
    <section className="hero">
      <span className="eyebrow">CLOSET INTELIGENTE · LOJAS PARCEIRAS</span>
      <h1>Sua loja na vitrine do Closet.</h1>
      <p>Publique suas peças com valores e desconto exclusivo para as clientes do Closet Inteligente, receba contato direto pelo WhatsApp e Instagram, acompanhe quantas clientes viram suas peças e use o <strong>Provador</strong> para gerar imagens das suas peças em uma modelo ou na sua própria foto.</p>
    </section>
    {error && <p role="alert" className="trial-banner">{error}</p>}

    {!session
      ? <div className="card">
          <h2>Primeiro, entre na sua conta</h2>
          <p>A loja é um perfil da sua conta no Closet: você continua usando o app normalmente (closet, looks, vitrine) e ganha os menus da loja. Entre ou crie sua conta e volte aqui para abrir a loja.</p>
          <Link href="/"><button>Entrar ou criar conta</button></Link>
        </div>
      : <form action={openPartnerStore} className="card form">
          <h2>Abrir minha loja</h2>
          <label>Nome da loja<input name="store_name" required maxLength={80} defaultValue={f_store_name || ""} /></label>
          <label>Instagram (usuário ou link do perfil)<input name="instagram" placeholder="minhaloja" defaultValue={f_instagram || ""} /></label>
          <label>WhatsApp (com DDD)<input name="whatsapp" placeholder="81 99999-9999" defaultValue={f_whatsapp || ""} /></label>
          <p className="look-meta">As clientes entram em contato por esses links. Informe pelo menos um.</p>
          <label>Pacote desejado
            <select name="package" defaultValue="BASICA">
              <option value="BASICA">{PARTNER_PACKAGE_LABEL.BASICA}</option>
              <option value="PLUS">{PARTNER_PACKAGE_LABEL.PLUS}</option>
              <option value="PREMIUM">{PARTNER_PACKAGE_LABEL.PREMIUM}</option>
            </select>
          </label>
          <p className="look-meta">Depois do envio, a equipe analisa e aprova a loja. Aprovada, você ativa o pacote (Pix ou cartão) e a loja entra na vitrine.</p>
          <SubmitButton pendingText="Criando sua loja...">Criar minha loja</SubmitButton>
        </form>}
  </main>;
}
