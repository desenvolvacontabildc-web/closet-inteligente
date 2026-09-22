import { adminListAccounts, setSubscription, resetPassword, recordPayment, adminListAudit } from "@/server/admin-actions";

const AUDIT_LABEL: Record<string, string> = { SET_SUBSCRIPTION: "Alteração de plano/status", RESET_PASSWORD: "Senha resetada", PAYMENT_RECEIVED: "Pagamento registrado" };

export default async function Admin({searchParams}:{searchParams:Promise<{temp?:string;for?:string;historico?:string}>}){
  const {temp,for:forEmail,historico}=await searchParams;
  const {actorId,accounts}=await adminListAccounts();
  if(!accounts)return <main className="shell narrow"><h1>Acesso restrito</h1><p>Esta conta não é administradora.</p><a href="/home">← Voltar</a></main>;

  const activeAccounts=accounts.filter((a:any)=>a.sub_status==="ACTIVE");
  const mrrCents=activeAccounts.reduce((sum:number,a:any)=>sum+Math.max(0,a.monthly_fee_cents-a.discount_cents),0);
  const pastDueCount=accounts.filter((a:any)=>a.sub_status==="PAST_DUE").length;
  const trialCount=accounts.filter((a:any)=>a.sub_status==="TRIAL").length;
  const inactive30d=accounts.filter((a:any)=>!a.last_login_at||new Date(a.last_login_at).getTime()<Date.now()-30*86400000).length;

  const history=historico?await adminListAudit(historico):null;
  const historyAccount=historico?accounts.find((a:any)=>a.user_id===historico):null;

  return <main className="shell narrow">
    <a href="/home">← Voltar</a>
    <h1>Administração de contas</h1>
    {temp&&<p role="alert">Senha temporária para {forEmail}: <strong>{temp}</strong> (copie agora; não será mostrada de novo)</p>}

    <section className="card">
      <h2>Resumo</h2>
      <p className="look-meta">Receita mensal ativa (MRR)</p>
      <p className="look-pieces"><strong>R$ {(mrrCents/100).toFixed(2)}</strong> de {activeAccounts.length} assinante{activeAccounts.length===1?"":"s"} ativo{activeAccounts.length===1?"":"s"}</p>
      <p className="look-meta">{trialCount} em teste gratuito · {pastDueCount} inadimplente{pastDueCount===1?"":"s"} · {inactive30d} sem acessar há 30+ dias</p>
    </section>

    {historico&&<section className="card">
      <h2>Histórico — {historyAccount?.display_name||historyAccount?.email||"conta"}</h2>
      {!history||history.length===0?<p>Nenhum registro ainda.</p>:<ul>
        {history.map((h:any,i:number)=>(
          <li key={i}>
            <strong>{AUDIT_LABEL[h.action]||h.action}</strong> — {new Date(h.created_at).toLocaleString("pt-BR")}
            {h.action==="PAYMENT_RECEIVED"&&<> · R$ {(h.details.amount_cents/100).toFixed(2)} em {new Date(h.details.paid_at).toLocaleDateString("pt-BR")}{h.details.notes&&` · ${h.details.notes}`}</>}
            {h.action==="SET_SUBSCRIPTION"&&<> · status {h.details.status}, mensalidade R$ {(h.details.fee_cents/100).toFixed(2)}, desconto R$ {(h.details.discount_cents/100).toFixed(2)}</>}
          </li>
        ))}
      </ul>}
      <a href="/admin">← Fechar histórico</a>
    </section>}

    {accounts.map((a:any)=>(
      <section key={a.user_id} className="card">
        <h2>{a.display_name||"(sem nome)"} {a.is_admin&&"· administradora"}</h2>
        <p className="look-meta">{a.email} · desde {new Date(a.created_at).toLocaleDateString("pt-BR")}{a.sub_status==="TRIAL"&&a.trial_ends_at&&<> · teste termina em {new Date(a.trial_ends_at).toLocaleDateString("pt-BR")}</>}</p>
        <p className="look-meta">{a.last_login_at?`Último acesso em ${new Date(a.last_login_at).toLocaleDateString("pt-BR")}`:"Nunca fez login"}</p>
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
          <label>Plano
            <select name="plan" defaultValue={a.plan} disabled={a.user_id===actorId}>
              <option value="ARRUMADA">Arrumada (15 looks / 40 usos de IA por mês)</option>
              <option value="FASHION">Fashion (40 looks / 100 usos de IA por mês + Closet Cápsula)</option>
              <option value="SUPER_STAR">Super Star (ilimitado + Colorimetria)</option>
            </select>
          </label>
          <label>Mensalidade (R$)<input name="fee" defaultValue={(a.monthly_fee_cents/100).toFixed(2)} disabled={a.user_id===actorId}/></label>
          <label>Desconto (R$)<input name="discount" defaultValue={(a.discount_cents/100).toFixed(2)} disabled={a.user_id===actorId}/></label>
          <label>Observações<input name="notes" defaultValue={a.notes} disabled={a.user_id===actorId}/></label>
          <button disabled={a.user_id===actorId}>Salvar</button>
        </form>
        {a.user_id!==actorId&&<form action={recordPayment} className="form">
          <input type="hidden" name="user_id" value={a.user_id}/>
          <label>Registrar pagamento recebido (R$)<input name="amount" placeholder="Ex.: 49,90" required/></label>
          <label>Data do pagamento<input name="paid_at" type="date" defaultValue={new Date().toISOString().slice(0,10)}/></label>
          <label>Observações<input name="payment_notes" placeholder="Ex.: Pix, transferência..."/></label>
          <button>Registrar pagamento</button>
        </form>}
        <div className="look-actions">
          <a href={`/admin?historico=${a.user_id}`} className="link">Ver histórico</a>
          {a.user_id!==actorId&&<form action={resetPassword}><input type="hidden" name="user_id" value={a.user_id}/><button className="link">Resetar senha</button></form>}
        </div>
      </section>
    ))}
  </main>;
}
