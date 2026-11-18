"use client";
import { useState } from "react";

type Props = { name: string; occasion: string; pieces: string[]; imageUrl: string | null; photos: string[]; fileName: string };

// mesma paleta do app (marfim, espresso, vinho e dourado envelhecido)
const BG = "#fbf3f1", INK = "#2b1c25", WINE = "#8e3a57", MUTED = "#7f6b73", GOLD = "#c4a07a", PANEL = "#fffdfc", LINE = "#f0dfdd";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; });
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r: number) {
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
  const s = Math.max(w / img.width, h / img.height); const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); ctx.restore();
}
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean); const lines: string[] = []; let cur = "";
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const k = lines.slice(0, maxLines); k[maxLines - 1] = k[maxLines - 1].replace(/[\s,.;:+]+$/, "") + "…"; return k; }
  return lines;
}

/** Cartão do look para compartilhar (1080x1350, formato de feed), desenhado no próprio aparelho: imagem do look, nome, peças e a marca. */
export default function ShareLook({ name, occasion, pieces, imageUrl, photos, fileName }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function make(): Promise<Blob> {
    const cs = getComputedStyle(document.documentElement);
    const DISP = cs.getPropertyValue("--font-cormorant").trim() || "Georgia, serif";
    const UI = cs.getPropertyValue("--font-manrope").trim() || "system-ui, sans-serif";
    await Promise.all([`500 40px ${DISP}`, `italic 500 40px ${DISP}`, `600 16px ${UI}`, `700 16px ${UI}`].map((f) => document.fonts.load(f).catch(() => null)));
    const W = 1080, H = 1350, M = 64;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);

    // marca no topo
    (ctx as any).letterSpacing = "6px"; ctx.fillStyle = WINE; ctx.font = `700 22px ${UI}`; ctx.textBaseline = "alphabetic";
    ctx.fillText("CLOSET INTELIGENTE", M, M + 22);
    (ctx as any).letterSpacing = "0px";
    ctx.fillStyle = GOLD; ctx.fillRect(M, M + 40, 72, 3);

    // imagem principal
    const IX = M, IY = 150, IW = W - M * 2, IH = 770;
    ctx.fillStyle = PANEL; rr(ctx, IX, IY, IW, IH, 28); ctx.fill();
    ctx.strokeStyle = LINE; ctx.lineWidth = 2; rr(ctx, IX, IY, IW, IH, 28); ctx.stroke();
    const main = imageUrl ? await loadImage(imageUrl) : null;
    if (main) cover(ctx, main, IX, IY, IW, IH, 28);
    else {
      const imgs = (await Promise.all(photos.slice(0, 4).map(loadImage))).filter(Boolean) as HTMLImageElement[];
      const n = imgs.length;
      if (n === 0) { ctx.fillStyle = GOLD; ctx.font = `500 120px ${DISP}`; ctx.textAlign = "center"; ctx.fillText("✦", W / 2, IY + IH / 2 + 40); ctx.textAlign = "left"; }
      else {
        const cols = n === 1 ? 1 : 2, rows = Math.ceil(n / cols), g = 12;
        const cw = (IW - g * (cols + 1)) / cols, ch = (IH - g * (rows + 1)) / rows;
        imgs.forEach((im, i) => cover(ctx, im, IX + g + (i % cols) * (cw + g), IY + g + Math.floor(i / cols) * (ch + g), cw, ch, 18));
      }
    }

    // nome, ocasião e peças
    let y = IY + IH + 70;
    ctx.fillStyle = INK; ctx.font = `500 62px ${DISP}`;
    const title = wrap(ctx, name || "Meu look", W - M * 2, 2);
    for (const line of title) { ctx.fillText(line, M, y); y += 64; }
    if (occasion) { ctx.fillStyle = WINE; ctx.font = `italic 500 34px ${DISP}`; ctx.fillText(wrap(ctx, occasion, W - M * 2, 1)[0], M, y); y += 46; }
    ctx.fillStyle = MUTED; ctx.font = `600 26px ${UI}`;
    const list = wrap(ctx, pieces.join("  ·  "), W - M * 2, 2);
    for (const line of list) { ctx.fillText(line, M, y + 6); y += 36; }

    // rodapé
    ctx.fillStyle = GOLD; ctx.fillRect(M, H - 96, W - M * 2, 2);
    ctx.fillStyle = INK; ctx.font = `700 24px ${UI}`; ctx.fillText("Monte os seus looks também", M, H - 52);
    ctx.fillStyle = WINE; ctx.textAlign = "right"; ctx.fillText("closet.desenvolvacontabil.com.br", W - M, H - 52); ctx.textAlign = "left";

    return await new Promise<Blob>((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas vazio"))), "image/png"));
  }

  async function share() {
    setBusy(true); setMsg("");
    try {
      const blob = await make();
      const file = new File([blob], fileName, { type: "image/png" });
      const nav = navigator as any;
      if (nav.canShare?.({ files: [file] })) {
        try { await nav.share({ files: [file], title: name || "Meu look" }); return; } catch (e: any) { if (e?.name === "AbortError") return; }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMsg("Imagem salva no seu aparelho. É só postar ou enviar.");
    } catch (e) { console.error("cartao do look falhou:", e); setMsg("Não consegui montar o cartão agora. Tente de novo."); }
    finally { setBusy(false); }
  }

  return <div className="share-look">
    <button type="button" onClick={share} disabled={busy}>{busy ? "Montando o cartão..." : "Compartilhar este look"}</button>
    {msg && <p className="look-meta" role="status">{msg}</p>}
  </div>;
}
