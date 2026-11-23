"use client";
import { useState } from "react";

type Props = { name: string; occasion: string; pieces: string[]; imageUrl: string | null; photos: string[]; fileName: string };
type Format = "story" | "feed";

// paleta do app: marfim, espresso, vinho e dourado envelhecido
const INK = "#2b1c25", WINE = "#8e3a57", MUTED = "#7f6b73", GOLD = "#c4a07a", GOLD_DK = "#9a7a52", PANEL = "#fffdfc", LINE = "#ecd9d5";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; });
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
/** Preenche a área (corta o excesso): usado só no fundo desfocado. */
function fill(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height); const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
/** Encaixa a imagem inteira dentro da área, sem cortar nada. */
function contain(img: { width: number; height: number }, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / img.width, h / img.height); const dw = img.width * s, dh = img.height * s;
  return { x: x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh };
}
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean); const lines: string[] = []; let cur = "";
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const k = lines.slice(0, maxLines); k[maxLines - 1] = k[maxLines - 1].replace(/[\s,.;:+]+$/, "") + "…"; return k; }
  return lines;
}
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text; while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1); return `${t}…`;
}
function spaced(ctx: CanvasRenderingContext2D, px: number) { (ctx as any).letterSpacing = `${px}px`; }
function diamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill();
}

/** Cartão do look para compartilhar, desenhado no próprio aparelho. Stories (1080x1920) com a imagem inteira, sem cortes, e versão
 * para o feed (1080x1350). As zonas de segurança do Instagram (topo e rodapé) ficam livres para o texto principal. */
export default function ShareLook({ name, occasion, pieces, imageUrl, photos, fileName }: Props) {
  const [busy, setBusy] = useState<Format | null>(null);
  const [msg, setMsg] = useState("");

  async function make(format: Format): Promise<Blob> {
    const cs = getComputedStyle(document.documentElement);
    const DISP = cs.getPropertyValue("--font-cormorant").trim() || "Georgia, serif";
    const UI = cs.getPropertyValue("--font-manrope").trim() || "system-ui, sans-serif";
    await Promise.all([`500 40px ${DISP}`, `600 40px ${DISP}`, `700 40px ${DISP}`, `italic 500 40px ${DISP}`, `600 16px ${UI}`, `700 16px ${UI}`].map((f) => document.fonts.load(f).catch(() => null)));
    const story = format === "story";
    const W = 1080, H = story ? 1920 : 1350, CX = W / 2;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d")!;
    ctx.textBaseline = "alphabetic";

    // fundo: degradê marfim para rosé, com brilhos sutis
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#fdf8f6"); bg.addColorStop(0.6, "#f8ebe8"); bg.addColorStop(1, "#f1ddd9");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const glow = (x: number, y: number, r: number, a: number) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(196,160,122,${a})`); g.addColorStop(1, "rgba(196,160,122,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
    glow(W * 0.15, H * 0.08, 520, 0.22); glow(W * 0.9, H * 0.92, 620, 0.2);
    // moldura fina dourada
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; rr(ctx, 26, 26, W - 52, H - 52, 44); ctx.stroke();
    ctx.strokeStyle = "rgba(196,160,122,.45)"; ctx.lineWidth = 1; rr(ctx, 40, 40, W - 80, H - 80, 34); ctx.stroke();

    // cabeçalho
    const top = story ? 262 : 118;
    ctx.textAlign = "center"; ctx.fillStyle = WINE; ctx.font = `700 26px ${UI}`; spaced(ctx, 9);
    ctx.fillText("CLOSET INTELIGENTE", CX + 4, top); spaced(ctx, 0);
    ctx.fillStyle = MUTED; ctx.font = `italic 500 34px ${DISP}`; ctx.fillText("seu agente de moda", CX, top + 44);
    ctx.fillStyle = GOLD; diamond(ctx, CX, top + 76, 6); ctx.fillRect(CX - 120, top + 75, 100, 2); ctx.fillRect(CX + 20, top + 75, 100, 2);

    // painel da imagem
    const PX = 84, PW = W - PX * 2, PY = top + 112, PH = story ? 880 : 640;
    ctx.save(); ctx.shadowColor = "rgba(80,40,50,.22)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20; ctx.fillStyle = PANEL; rr(ctx, PX, PY, PW, PH, 40); ctx.fill(); ctx.restore();
    ctx.save(); rr(ctx, PX, PY, PW, PH, 40); ctx.clip();
    const main = imageUrl ? await loadImage(imageUrl) : null;
    if (main) {
      // fundo desfocado da própria imagem (reduz e amplia: funciona em qualquer navegador) e a imagem inteira por cima
      const sm = document.createElement("canvas"); sm.width = 28; sm.height = Math.max(8, Math.round(28 * (PH / PW)));
      const sctx = sm.getContext("2d")!; sctx.imageSmoothingQuality = "high"; fill(sctx, main, 0, 0, sm.width, sm.height);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(sm, PX, PY, PW, PH);
      ctx.fillStyle = "rgba(255,253,252,.34)"; ctx.fillRect(PX, PY, PW, PH);
      const f = contain(main, PX + 26, PY + 26, PW - 52, PH - 52);
      ctx.save(); ctx.shadowColor = "rgba(40,20,30,.28)"; ctx.shadowBlur = 36; ctx.shadowOffsetY = 12; rr(ctx, f.x, f.y, f.w, f.h, 24); ctx.fillStyle = "#fff"; ctx.fill(); ctx.restore();
      ctx.save(); rr(ctx, f.x, f.y, f.w, f.h, 24); ctx.clip(); ctx.drawImage(main, f.x, f.y, f.w, f.h); ctx.restore();
    } else {
      const imgs = (await Promise.all(photos.slice(0, 6).map(loadImage))).filter(Boolean) as HTMLImageElement[];
      if (imgs.length === 0) { ctx.fillStyle = GOLD; ctx.font = `500 160px ${DISP}`; ctx.fillText("✦", CX, PY + PH / 2 + 50); }
      else {
        const n = imgs.length, cols = n === 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols), g = 22, pad = 30;
        const cw = (PW - pad * 2 - g * (cols - 1)) / cols, ch = (PH - pad * 2 - g * (rows - 1)) / rows;
        imgs.forEach((im, i) => {
          const c = i % cols, r = Math.floor(i / cols);
          const f = contain(im, PX + pad + c * (cw + g), PY + pad + r * (ch + g), cw, ch);
          ctx.save(); rr(ctx, f.x, f.y, f.w, f.h, 18); ctx.clip(); ctx.drawImage(im, f.x, f.y, f.w, f.h); ctx.restore();
        });
      }
    }
    ctx.restore();
    ctx.strokeStyle = LINE; ctx.lineWidth = 2; rr(ctx, PX, PY, PW, PH, 40); ctx.stroke();

    // nome do look, ocasião e peças
    let y = PY + PH + (story ? 96 : 78);
    ctx.fillStyle = INK; ctx.font = `600 ${story ? 78 : 64}px ${DISP}`; ctx.textAlign = "center";
    const title = wrap(ctx, name || "Meu look", W - 200, 2);
    for (const line of title) { ctx.fillText(line, CX, y); y += story ? 80 : 66; }
    if (occasion) { ctx.fillStyle = WINE; ctx.font = `italic 500 ${story ? 40 : 34}px ${DISP}`; ctx.fillText(ellipsize(ctx, occasion, W - 200), CX, y + 4); y += story ? 58 : 50; }
    ctx.font = `600 ${story ? 26 : 24}px ${UI}`;
    const shown = pieces.slice(0, 6); const extra = pieces.length - shown.length;
    const labels = [...shown.map((p) => ellipsize(ctx, p, 300)), ...(extra > 0 ? [`+${extra}`] : [])];
    const chipH = story ? 54 : 48, gap = 14; let row: { t: string; w: number }[] = []; const rowsOut: { t: string; w: number }[][] = []; let rw = 0;
    for (const t of labels) { const w = ctx.measureText(t).width + 44; if (rw + w + (row.length ? gap : 0) > W - 200 && row.length) { rowsOut.push(row); row = []; rw = 0; } row.push({ t, w }); rw += w + (row.length > 1 ? gap : 0); }
    if (row.length) rowsOut.push(row);
    y += 10;
    for (const r of rowsOut.slice(0, 2)) {
      const total = r.reduce((a, c) => a + c.w, 0) + gap * (r.length - 1); let x = CX - total / 2;
      for (const c of r) { ctx.fillStyle = "#fff"; rr(ctx, x, y, c.w, chipH, chipH / 2); ctx.fill(); ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = INK; ctx.fillText(c.t, x + c.w / 2, y + chipH / 2 + 9); x += c.w + gap; }
      y += chipH + 14;
    }

    // rodapé com a marca
    const fy = story ? 1672 : H - 118;
    ctx.fillStyle = GOLD; ctx.fillRect(CX - 140, fy - 62, 280, 2); diamond(ctx, CX, fy - 61, 6);
    ctx.fillStyle = MUTED; ctx.font = `600 ${story ? 24 : 22}px ${UI}`; spaced(ctx, 2); ctx.fillText("LOOK CRIADO COM A AJUDA DO MEU", CX + 1, fy - 18); spaced(ctx, 0);
    ctx.fillStyle = WINE; ctx.font = `700 ${story ? 58 : 48}px ${DISP}`; ctx.fillText("Closet Inteligente", CX, fy + (story ? 44 : 34));
    if (story) { ctx.fillStyle = GOLD_DK; ctx.font = `600 22px ${UI}`; spaced(ctx, 1); ctx.fillText("closet.desenvolvacontabil.com.br", CX, fy + 92); spaced(ctx, 0); }

    return await new Promise<Blob>((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas vazio"))), "image/png"));
  }

  async function share(format: Format) {
    setBusy(format); setMsg("");
    try {
      const blob = await make(format);
      const file = new File([blob], format === "story" ? fileName.replace(/\.png$/, "-stories.png") : fileName, { type: "image/png" });
      const nav = navigator as any;
      if (nav.canShare?.({ files: [file] })) {
        try { await nav.share({ files: [file], title: name || "Meu look" }); return; } catch (e: any) { if (e?.name === "AbortError") return; }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMsg("Imagem salva no seu aparelho. É só postar nos Stories. 💛");
    } catch (e) { console.error("cartao do look falhou:", e); setMsg("Não consegui montar o cartão agora. Tente de novo."); }
    finally { setBusy(null); }
  }

  return <div className="share-look">
    <button type="button" onClick={() => share("story")} disabled={busy !== null}>{busy === "story" ? "Montando o seu story..." : "Compartilhar nos Stories"}</button>
    <button type="button" className="link" onClick={() => share("feed")} disabled={busy !== null}>{busy === "feed" ? "Montando..." : "Versão para o feed"}</button>
    {msg && <p className="look-meta" role="status">{msg}</p>}
  </div>;
}
