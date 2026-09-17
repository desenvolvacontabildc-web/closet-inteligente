import { adminListAccounts, setSubscription, resetPassword } from "@/server/admin-actions";
export default async function Admin({searchParams}:{searchParams:Promise<{temp?:string;for?:string}>}){
  const {temp,for:forEmail}=await searchParams;
  const {actorId,accounts}=await adminListAccounts();
  if(!accounts)return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;
  return <main className="shell narrow">
    <a href="/home">← Voltar</a>
    <h1>Administração de contas</h1>
    {temp&&<p role="alert">Senha temporária para {forEmail}: <strong>{temp}</strong> (copie agora; não será mostrada de novo)</p>}
    {accounts.map((a:any)=>(
      <section key={a.user_id} className="card">
        <h2>{a.display_name||"(sem nome)"} {a.is_admin&&"· administradora"}</h2>
        <p>{a.email} · desde {new Date(a.created_at).toLocaleDateString("pt-BR")}{a.sub_status==="TRIAL"&&a.trial_ends_at&&<> · teste termina em {new Date(a.trial_ends_at).toLocaleDateString("pt-BR")}</>}</p>
        <form action={setSubscription} className="form">
          <input type="hidden" name="user_id" value={a.user_id}/>
          <label>Status
            <select name="status" defaultValue={a.sub_status} disabled={a.user_id===actorId}>
              <option value="TRIAL">Em teste gratuito</option>
              <option value="ACTIVE">Ativa (assinante)</option>
              <option value="PAST_DUE">Inadimplente</option>
              <option value="BLOCKED">Bloqueada</option>
              <option value="CANCELED">Cancelada</option>
            </select>
          </label>
          <label>Mensalidade (R$)<input name="fee" defaultValue={(a.monthly_fee_cents/100).toFixed(2)} disabled={a.user_id===actorId}/></label>
          <label>Desconto (R$)<input name="discount" defaultValue={(a.discount_cents/100).toFixed(2)} disabled={a.user_id===actorId}/></label>
          <label>Observações<input name="notes" defaultValue={a.notes} disabled={a.user_id===actorId}/></label>
          <button disabled={a.user_id===actorId}>Salvar</button>
        </form>
        {a.user_id!==actorId&&<form action={resetPassword}><input type="hidden" name="user_id" value={a.user_id}/><button>Resetar senha</button></form>}
      </section>
    ))}
  </main>;
}
