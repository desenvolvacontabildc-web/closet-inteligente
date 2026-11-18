import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { aiUsageRemaining, imageGenerationsRemaining } from "@/server/limits";
import { generateWishLooks, toggleWishBought, deleteWishLook, generateWishLookImage } from "@/server/wish-actions";
import SubmitButton from "@/components/submit-button";
import ConfirmButton from "@/components/confirm-button";

type Piece = { source: "CLOSET" | "BUY"; item_id?: string; name: string; category: string; color: string; why: string; bought?: boolean };
const CAT_ORDER = ["vestido", "blusa", "camisa", "top", "calça", "saia", "casaco", "blazer", "sapato", "bolsa", "acessório", "outro"];
const catRank = (c: string) => { const i = CAT_ORDER.findIndex((x) => (c || "").toLowerCase().includes(x)); return i < 0 ? 99 : i; };

export default async function LooksComprar({ searchParams }: { searchParams: Promise<{ error?: string; lote?: string; f_occasion?: string; f_vibe?: string; f_budget?: string; f_base_text?: string }> }) {
  const sp = await searchParams;
  const lote = /^[0-9a-f-]{36}$/i.test(sp.lote || "") ? sp.lote! : "";
  const data = await withProfile(async (c, userId) => {
    const items = (await c.query("SELECT id,name,category FROM closet_items WHERE status='ACTIVE' ORDER BY category, name LIMIT 200")).rows as { id: string; name: string; category: string }[];
    const looks = (lote
      ? await c.query("SELECT id,name,occasion,mode,pieces,tip,illustration_object_key IS NOT NULL AS has_image,created_at FROM wish_looks WHERE batch_id=$1 ORDER BY created_at, id", [lote])
      : await c.query("SELECT id,name,occasion,mode,pieces,tip,illustration_object_key IS NOT NULL AS has_image,created_at FROM wish_looks ORDER BY created_at DESC LIMIT 9")).rows as any[];
    const ids = [...new Set(looks.flatMap((l) => (l.pieces as Piece[]).map((p) => p.item_id).filter(Boolean)))] as string[];
    const photos = ids.length ? (await c.query("SELECT DISTINCT ON (item_id) item_id, id FROM closet_item_photos WHERE item_id = ANY($1::uuid[]) ORDER BY item_id, created_at DESC", [ids])).rows : [];
    return { items, looks, photoOf: Object.fromEntries(photos.map((p: any) => [p.item_id, p.id])) as Record<string, string>, ai: await aiUsageRemaining(c, userId), img: await imageGenerationsRemaining(c, userId) };
  });
  if (!data) redirect("/");
  const { items, looks, photoOf, ai, img } = data;
  const back = lote ? `/looks/comprar?lote=${lote}` : "/looks/comprar";

  // Lista de compras: peças "comprar" ainda não marcadas como compradas, juntando as repetidas.
  const shop = new Map<string, { name: string; color: string; category: string; n: number }>();
  for (const l of looks) (l.pieces as Piece[]).forEach((p) => {
    if (p.source !== "BUY" || p.bought) return;
    const k = `${p.name.toLowerCase()}|${(p.color || "").toLowerCase()}`;
    const cur = shop.get(k); if (cur) cur.n++; else shop.set(k, { name: p.name, color: p.color, category: p.category, n: 1 });
  });
  const shopList = [...shop.values()].sort((a, b) => catRank(a.category) - catRank(b.category) || a.name.localeCompare(b.name));

  return <main className="shell narrow">
    <Link href="/looks">← Looks</Link>
    <h1>Looks com peças novas</h1>
    <p className="look-meta">Ainda não tem peças suficientes no closet? Aqui a IA monta o look completo e mostra <strong>o que vale comprar</strong> para fechá-lo. Se você já tem uma peça, ela sugere o resto.</p>
    {sp.error && <p role="alert" className="trial-banner">{sp.error}</p>}

    <div className="card">
      <h2>Montar do zero</h2>
      <p className="look-meta">Conte a ocasião e a IA sugere o look inteiro, com as peças para comprar.</p>
      <form action={generateWishLooks} className="form">
        <input type="hidden" name="mode" value="ZERO" />
        <label>Para qual ocasião?<input name="occasion" required maxLength={140} placeholder='Ex.: "reunião de trabalho", "jantar", "viagem de 5 dias"' defaultValue={sp.f_occasion || ""} /></label>
        <label>Que estilo você gosta? (opcional)<input name="vibe" maxLength={140} placeholder="Ex.: elegante e confortável, minimalista" defaultValue={sp.f_vibe || ""} /></label>
        <label>Orçamento (opcional)<input name="budget" maxLength={60} placeholder="Ex.: até R$ 300 no total" defaultValue={sp.f_budget || ""} /></label>
        {items.length > 0 && <label className="checkbox"><input type="checkbox" name="use_closet" defaultChecked /> Aproveitar as peças que já tenho no closet</label>}
        <SubmitButton disabled={ai === 0} pendingText="Montando seus looks... (até 30s)">Gerar looks com peças para comprar</SubmitButton>
      </form>
    </div>

    <div className="card">
      <h2>Começar por uma peça</h2>
      <p className="look-meta">Tem uma peça e quer saber com o que combinar? A IA sugere as demais.</p>
      <form action={generateWishLooks} className="form">
        <input type="hidden" name="mode" value="PECA" />
        {items.length > 0 && <label>Escolha uma peça do seu closet
          <select name="base_item_id" defaultValue=""><option value="">— ou descreva abaixo —</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.category})</option>)}</select>
        </label>}
        <label>{items.length > 0 ? "Ou descreva a peça" : "Descreva a peça que você tem"}<input name="base_text" maxLength={140} placeholder="Ex.: calça jeans reta azul-escura" defaultValue={sp.f_base_text || ""} /></label>
        <label>Para qual ocasião? (opcional)<input name="occasion" maxLength={140} placeholder="Ex.: passeio no fim de semana" defaultValue={sp.f_occasion || ""} /></label>
        {items.length > 0 && <label className="checkbox"><input type="checkbox" name="use_closet" defaultChecked /> Aproveitar as outras peças que já tenho</label>}
        <SubmitButton disabled={ai === 0} pendingText="Montando seus looks... (até 30s)">Sugerir o resto do look</SubmitButton>
      </form>
      {ai === 0 && <p className="look-meta">Atenção: seu limite de IA deste mês acabou. Veja os planos em Perfil → Assinatura.</p>}
    </div>

    {looks.length > 0 && <>
      <div className="section-head" id="resultado"><h2>{lote ? "Seus looks novos" : "Seus looks com peças para comprar"}</h2>{lote && <Link href="/looks/comprar" className="look-meta">Ver todos</Link>}</div>
      {looks.map((l) => {
        const pieces = l.pieces as Piece[];
        return <article className="card wish-look" key={l.id}>
          <header><h3>{l.name}</h3><span className="look-meta">{l.occasion}{l.mode === "PECA" ? " · a partir de uma peça" : ""}</span></header>
          {l.has_image && <img className="wish-img" src={`/api/looks/compra/${l.id}?w=640`} alt={`Imagem do look ${l.name}`} loading="lazy" />}
          <ul className="wish-pieces">
            {pieces.map((p, i) => <li key={i} className={p.source === "BUY" ? (p.bought ? "buy done" : "buy") : "have"}>
              {p.source === "CLOSET" && p.item_id && photoOf[p.item_id] ? <img src={`/api/closet/photos/${photoOf[p.item_id]}?w=200`} alt="" loading="lazy" /> : <span className="wish-ico" aria-hidden="true">{p.source === "BUY" ? "+" : "✦"}</span>}
              <span className="wish-txt"><strong>{p.name}</strong><small>{[p.category, p.color].filter(Boolean).join(" · ")}</small>{p.why && <small className="why">{p.why}</small>}</span>
              {p.source === "CLOSET"
                ? <span className="chip-have">Já tem</span>
                : <form action={toggleWishBought}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="idx" value={i} /><input type="hidden" name="back" value={back} /><button type="submit" className={p.bought ? "chip-buy done" : "chip-buy"} aria-pressed={!!p.bought}>{p.bought ? "Comprei ✓" : "Comprar"}</button></form>}
            </li>)}
          </ul>
          {l.tip && <p className="look-meta wish-tip">Dica: {l.tip}</p>}
          <div className="action-row">
            {!l.has_image && <form action={generateWishLookImage}><input type="hidden" name="id" value={l.id} /><SubmitButton disabled={img === 0} pendingText="Gerando imagem... (até 2 min)">Ver em imagem</SubmitButton></form>}
            <form action={deleteWishLook}><input type="hidden" name="id" value={l.id} /><ConfirmButton className="link" message="Remover este look?" pendingText="Removendo...">Remover</ConfirmButton></form>
          </div>
        </article>;
      })}

      <div className="card">
        <h2>Lista de compras</h2>
        {shopList.length === 0 ? <p className="look-meta">Nada pendente: todas as peças dos looks acima já estão no closet ou foram marcadas como compradas.</p> : <>
          <p className="look-meta">Peças que mais rendem primeiro. Quando comprar, marque "Comprei" no look e depois cadastre a peça no closet.</p>
          <ul className="wish-shop">
            {shopList.map((s, i) => <li key={i}><strong>{s.name}</strong><small>{[s.category, s.color].filter(Boolean).join(" · ")}{s.n > 1 ? ` · usada em ${s.n} looks` : ""}</small></li>)}
          </ul>
        </>}
        <Link href="/closet" className="link">Cadastrar uma peça comprada →</Link>
      </div>
    </>}
  </main>;
}
