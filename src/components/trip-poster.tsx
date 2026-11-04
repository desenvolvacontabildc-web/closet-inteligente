"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { generateLookImageQuiet } from "@/server/look-actions";

type Piece = { name: string; photo: string | null };
type PosterLook = { id: string; day: number; tag: string; label: string; imageUrl: string | null; pieces: Piece[] };
type Groups = { swim: Piece[]; shoes: Piece[]; bags: Piece[]; accessories: Piece[]; clothes: Piece[] };
type Props = {
  destination: string; days: number | null; objective: string; fileName: string;
  looks: PosterLook[]; groups: Groups; checklist: { label: string; done: boolean }[];
  imagesRemaining: number | null; defaultStyle: string;
};

const STYLE_OPTIONS = [
  { value: "REALISTA", label: "Foto realista (você vestida)" },
  { value: "AVATAR", label: "Meu avatar" },
  { value: "ILUSTRACAO", label: "Ilustração" },
];

// paleta do pôster (tons de papel e vinho, no estilo do modelo)
const BG = "#efe8de", INK = "#3b2a2a", WINE = "#5b2b2f", MUTED = "#7d6f62", PANEL = "#f6f0e8", PANEL_LINE = "#ddd1c2", PILL = "#6e4f3e";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; });
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text; while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1); return `${t}…`;
}
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/); const lines: string[] = []; let cur = "";
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const k = lines.slice(0, maxLines); k[maxLines - 1] = ellipsize(ctx, k[maxLines - 1] + "…", maxW); return k; }
  return lines;
}
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r: number) {
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
  const s = Math.max(w / img.width, h / img.height); const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); ctx.restore();
}
function spaced(ctx: CanvasRenderingContext2D, px: number) { (ctx as any).letterSpacing = `${px}px`; }

/** Exporta a mala como um pôster (looks vestidos lado a lado, peças de cada look, sapatos, bolsas, acessórios,
 * roupas e checklist) direto no navegador, e permite gerar antes a imagem dos looks que ainda não têm. */
export default function TripPoster({ destination, days, objective, fileName, looks, groups, checklist, imagesRemaining, defaultStyle }: Props) {
  const router = useRouter();
  const [style, setStyle] = useState(STYLE_OPTIONS.some((o) => o.value === defaultStyle) ? defaultStyle : "REALISTA");
  const [busy, setBusy] = useState(false);
  const [genProgress, setGenProgress] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const missing = looks.filter((l) => !l.imageUrl);

  async function generateMissing() {
    setGenError(null);
    for (let i = 0; i < missing.length; i++) {
      setGenProgress(`Gerando a imagem do look ${i + 1} de ${missing.length}... (cerca de 1 minuto cada)`);
      const r = await generateLookImageQuiet(missing[i].id, style);
      if (!r.ok) { setGenError(r.message || "Não foi possível gerar a imagem agora."); setGenProgress(null); router.refresh(); return; }
    }
    setGenProgress(null);
    router.refresh();
  }

  async function makePoster() {
    setBusy(true); setError(null);
    try {
      const S = 2, W = 1700, M = 44, GAP = 8;
      const urls = new Set<string>();
      looks.forEach((l) => { if (l.imageUrl) urls.add(l.imageUrl); l.pieces.forEach((p) => p.photo && urls.add(p.photo)); });
      Object.values(groups).forEach((g: Piece[]) => g.forEach((p) => p.photo && urls.add(p.photo)));
      const imgs = new Map<string, HTMLImageElement | null>();
      await Promise.all([...urls].map(async (u) => imgs.set(u, await loadImage(u))));

      // ---------- medidas
      const cols = looks.length <= 7 ? Math.max(1, looks.length) : 5;
      const tileW = (W - M * 2 - GAP * (cols - 1)) / cols, tileH = tileW * 1.5;
      const maxLines = Math.min(6, Math.max(2, ...looks.map((l) => l.pieces.length)));
      const lookRowH = tileH + 62 + maxLines * 22 + 26;
      const lookRows = Math.ceil(looks.length / cols);
      const topH = 252;
      const innerW = W - M * 2, leftW = innerW * 0.58 - 10, rightW = innerW - leftW - 20, PAD = 22;
      const secH = (w: number, n: number, perRow: number) => {
        if (n === 0) return 0; const t = (w - PAD * 2 - 12 * (perRow - 1)) / perRow;
        return PAD + 40 + Math.ceil(n / perRow) * (t + 8 + 34 + 12) + PAD - 12;
      };
      const checkH = PAD + 40 + Math.ceil(checklist.length / 2) * 32 + PAD;
      const leftH = secH(leftW, groups.swim.length, 6) + (groups.swim.length ? 18 : 0) + secH(leftW, groups.clothes.length, 6) + (checklist.length ? checkH + 18 : 0);
      const rightH = secH(rightW, groups.shoes.length, 4) + secH(rightW, groups.bags.length, 4) + secH(rightW, groups.accessories.length, 4) + 18 * 3;
      const H = topH + lookRows * lookRowH + 24 + Math.max(leftH, rightH) + 90;

      const canvas = document.createElement("canvas");
      canvas.width = W * S; canvas.height = H * S;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("canvas indisponível");
      ctx.scale(S, S); ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = "alphabetic";

      // ---------- cabeçalho
      ctx.strokeStyle = PANEL_LINE; ctx.lineWidth = 1.5; rr(ctx, M, M, 340, 150, 14); ctx.stroke();
      ctx.font = "400 40px system-ui, sans-serif"; ctx.fillStyle = WINE; ctx.fillText("✈", M + 22, M + 64);
      ctx.fillStyle = MUTED; ctx.font = "700 14px system-ui, sans-serif"; spaced(ctx, 2); ctx.fillText("DESTINO", M + 90, M + 36); spaced(ctx, 0);
      ctx.fillStyle = WINE; ctx.font = "800 26px system-ui, sans-serif"; ctx.fillText(ellipsize(ctx, destination.toUpperCase(), 230), M + 90, M + 68);
      ctx.fillStyle = INK; ctx.font = "500 17px system-ui, sans-serif";
      ctx.fillText(days ? `${days} ${days === 1 ? "DIA" : "DIAS"}` : "", M + 90, M + 98);
      ctx.fillText(ellipsize(ctx, objective, 240), M + 90, M + 124);

      ctx.textAlign = "center"; ctx.fillStyle = WINE; ctx.font = "600 74px Georgia, 'Times New Roman', serif";
      ctx.fillText("MINHA MALA", W / 2, M + 74); ctx.fillText("DE VIAGEM", W / 2, M + 148);
      ctx.fillStyle = MUTED; ctx.font = "500 18px system-ui, sans-serif"; spaced(ctx, 4); ctx.fillText("CONFORTO, ESTILO E PRATICIDADE", W / 2, M + 182); spaced(ctx, 0);
      ctx.textAlign = "left";
      ctx.fillStyle = WINE; ctx.font = "italic 400 30px Georgia, serif";
      wrap(ctx, "Mais que looks, liberdade para viver novas histórias.", 330, 3).forEach((ln, i) => ctx.fillText(ln, W - M - 340, M + 50 + i * 38));

      // ---------- looks lado a lado
      for (let r = 0; r < lookRows; r++) {
        const rowY = topH + r * lookRowH;
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c; if (i >= looks.length) break;
          const l = looks[i]; const x = M + c * (tileW + GAP);
          ctx.fillStyle = "#e4dacd"; rr(ctx, x, rowY, tileW, tileH, 10); ctx.fill();
          const main = l.imageUrl ? imgs.get(l.imageUrl) : null;
          if (main) cover(ctx, main, x, rowY, tileW, tileH, 10);
          else {
            // sem imagem do look: empilha as fotos das peças (cima, baixo, calçado, bolsa)
            const ps = l.pieces.filter((p) => p.photo && imgs.get(p.photo!)).slice(0, 4);
            if (ps.length === 0) { ctx.fillStyle = "#c9b79c"; ctx.font = "400 44px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("👗", x + tileW / 2, rowY + tileH / 2 + 14); ctx.textAlign = "left"; }
            else { const h = tileH / ps.length; ps.forEach((p, k) => cover(ctx, imgs.get(p.photo!)!, x, rowY + k * h, tileW, h - 2, k === 0 ? 10 : 2)); }
          }
          // etiqueta do dia
          ctx.font = "800 13px system-ui, sans-serif"; spaced(ctx, 1.5);
          const dayTxt = `DIA ${l.day}`; const dw = ctx.measureText(dayTxt).width + 22;
          ctx.fillStyle = "rgba(255,255,255,0.88)"; rr(ctx, x + 10, rowY + 10, dw, 26, 13); ctx.fill();
          ctx.fillStyle = WINE; ctx.fillText(dayTxt, x + 21, rowY + 28); spaced(ctx, 0);
          // faixa do tipo (AEROLOOK, EVENTO...)
          const py = rowY + tileH + 8;
          ctx.fillStyle = PILL; ctx.fillRect(x, py, tileW, 36);
          ctx.fillStyle = "#fff"; ctx.font = "700 15px system-ui, sans-serif"; spaced(ctx, 2); ctx.textAlign = "center";
          ctx.fillText(ellipsize(ctx, l.tag, tileW - 10), x + tileW / 2, py + 24); spaced(ctx, 0);
          // peças do look
          ctx.fillStyle = INK; ctx.font = "500 15px system-ui, sans-serif";
          const nameLines = [l.label, ...l.pieces.map((p) => p.name)].slice(0, maxLines + 1);
          nameLines.forEach((t, k) => {
            ctx.font = k === 0 ? "700 15px system-ui, sans-serif" : "500 15px system-ui, sans-serif";
            ctx.fillText(ellipsize(ctx, t, tileW - 8), x + tileW / 2, py + 62 + k * 22);
          });
          ctx.textAlign = "left";
        }
      }

      // ---------- seções
      const drawSection = (x: number, y: number, w: number, title: string, items: Piece[], perRow: number): number => {
        if (items.length === 0) return y;
        const h = secH(w, items.length, perRow), t = (w - PAD * 2 - 12 * (perRow - 1)) / perRow;
        ctx.fillStyle = PANEL; rr(ctx, x, y, w, h, 18); ctx.fill(); ctx.strokeStyle = PANEL_LINE; ctx.lineWidth = 1.2; rr(ctx, x, y, w, h, 18); ctx.stroke();
        ctx.fillStyle = WINE; ctx.font = "600 22px Georgia, serif"; spaced(ctx, 1); ctx.fillText(title.toUpperCase(), x + PAD, y + PAD + 22); spaced(ctx, 0);
        items.forEach((p, i) => {
          const cx = x + PAD + (i % perRow) * (t + 12), cy = y + PAD + 40 + Math.floor(i / perRow) * (t + 8 + 34 + 12);
          const img = p.photo ? imgs.get(p.photo) : null;
          if (img) cover(ctx, img, cx, cy, t, t, 12); else { ctx.fillStyle = "#e4dacd"; rr(ctx, cx, cy, t, t, 12); ctx.fill(); }
          ctx.fillStyle = INK; ctx.font = "500 13px system-ui, sans-serif"; ctx.textAlign = "center";
          wrap(ctx, p.name, t, 2).forEach((ln, k) => ctx.fillText(ln, cx + t / 2, cy + t + 20 + k * 16));
          ctx.textAlign = "left";
        });
        return y + h;
      };
      const sy = topH + lookRows * lookRowH + 24;
      let ly = sy;
      if (groups.swim.length) ly = drawSection(M, ly, leftW, "Biquínis e saída", groups.swim, 6) + 18;
      ly = drawSection(M, ly, leftW, "Roupas na mala", groups.clothes, 6);
      if (checklist.length) {
        ly += 18;
        ctx.fillStyle = PANEL; rr(ctx, M, ly, leftW, checkH, 18); ctx.fill(); ctx.strokeStyle = PANEL_LINE; ctx.lineWidth = 1.2; rr(ctx, M, ly, leftW, checkH, 18); ctx.stroke();
        ctx.fillStyle = WINE; ctx.font = "600 22px Georgia, serif"; spaced(ctx, 1); ctx.fillText("CHECKLIST DA MALA", M + PAD, ly + PAD + 22); spaced(ctx, 0);
        const half = Math.ceil(checklist.length / 2);
        checklist.forEach((it, i) => {
          const colX = M + PAD + (i < half ? 0 : (leftW - PAD * 2) / 2), rowI = i < half ? i : i - half;
          const cy = ly + PAD + 56 + rowI * 32;
          ctx.strokeStyle = WINE; ctx.lineWidth = 1.8; rr(ctx, colX, cy - 15, 18, 18, 4); ctx.stroke();
          if (it.done) { ctx.beginPath(); ctx.moveTo(colX + 4, cy - 6); ctx.lineTo(colX + 8, cy - 2); ctx.lineTo(colX + 15, cy - 12); ctx.stroke(); }
          ctx.fillStyle = INK; ctx.font = "500 16px system-ui, sans-serif"; ctx.fillText(it.label, colX + 30, cy);
        });
      }
      let ry = sy; const rx = M + leftW + 20;
      ry = drawSection(rx, ry, rightW, "Sapatos da viagem", groups.shoes, 4) + (groups.shoes.length ? 18 : 0);
      ry = drawSection(rx, ry, rightW, "Bolsas da viagem", groups.bags, 4) + (groups.bags.length ? 18 : 0);
      ry = drawSection(rx, ry, rightW, "Acessórios (essenciais)", groups.accessories, 4) + (groups.accessories.length ? 18 : 0);

      // ---------- rodapé
      ctx.textAlign = "center"; ctx.fillStyle = MUTED; ctx.font = "500 15px system-ui, sans-serif"; spaced(ctx, 3);
      ctx.fillText("FEITO COM O QUE VOCÊ JÁ TEM NO CLOSET  ·  CLOSET INTELIGENTE", W / 2, H - 36); spaced(ctx, 0); ctx.textAlign = "left";

      const b: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (!b) throw new Error("não foi possível gerar a imagem");
      if (preview) URL.revokeObjectURL(preview);
      setBlob(b); setPreview(URL.createObjectURL(b));
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      console.error("exportar mala falhou:", e);
      setError("Não consegui gerar a imagem agora. Atualize a página e tente de novo.");
    } finally { setBusy(false); }
  }

  function download() { if (!preview) return; const a = document.createElement("a"); a.href = preview; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); }
  async function share() {
    if (!blob) return; const file = new File([blob], fileName, { type: "image/png" });
    try { if ((navigator as any).canShare?.({ files: [file] })) await (navigator as any).share({ files: [file], title: `Minha mala · ${destination}` }); else download(); } catch { /* cancelado */ }
  }

  const withImage = looks.length - missing.length;
  return (
    <section className="card export-trip no-print" id="exportar">
      <h2>📤 Exportar mala como imagem</h2>
      <p className="look-meta">Gera um pôster com todos os looks lado a lado, as peças de cada um, sapatos, bolsas, acessórios e o checklist. {withImage} de {looks.length} look{looks.length === 1 ? "" : "s"} já têm imagem; os outros usam as fotos das peças.</p>

      {missing.length > 0 && <div className="export-gen">
        <label>Estilo das imagens dos looks
          <select value={style} onChange={(e) => setStyle(e.target.value)} disabled={!!genProgress}>
            {STYLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={generateMissing} disabled={!!genProgress || imagesRemaining === 0}>
          {genProgress ? "Gerando..." : `🖼️ Gerar a imagem dos ${missing.length} look${missing.length === 1 ? "" : "s"} que faltam`}
        </button>
        <p className="look-meta">{imagesRemaining === null ? "Gerações de imagem ilimitadas no seu plano." : `Usa ${missing.length} das suas ${imagesRemaining} gerações de imagem restantes.`}{genProgress ? ` ${genProgress}` : ""}</p>
        {genError && <p role="alert" className="look-meta" style={{ color: "#b3261e" }}>{genError}</p>}
      </div>}

      <button type="button" onClick={makePoster} disabled={busy || !!genProgress || looks.length === 0}>{busy ? "Montando a imagem..." : "📤 Montar imagem da mala"}</button>
      {error && <p role="alert" className="look-meta" style={{ color: "#b3261e" }}>{error}</p>}
      {preview && <div className="export-panel" ref={panelRef}>
        <img src={preview} alt={`Pôster da mala ${destination}`} className="export-preview" />
        <div className="action-row">
          <button type="button" onClick={download}>⬇️ Baixar imagem</button>
          <button type="button" className="reject" onClick={share}>Compartilhar</button>
          <button type="button" className="link" onClick={() => { URL.revokeObjectURL(preview); setPreview(null); setBlob(null); }}>Fechar</button>
        </div>
      </div>}
    </section>
  );
}
