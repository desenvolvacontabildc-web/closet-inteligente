"use client";
import { useRef, useState } from "react";

type Piece = { name: string; photo: string | null };
type Look = { day: number; label: string; pieces: Piece[] };
type Props = { title: string; subtitle: string; looks: Look[]; fileName: string };

const INK = "#2f282c", MUTED = "#7d6f62", LINE = "#ece1d2", BG = "#fbf5ee", SOFT = "#f4ecdf";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth || !current) current = test;
    else { lines.push(current); current = w; }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale, dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

/** Monta a "visão geral da mala" numa imagem (todos os looks lado a lado) direto no navegador, a partir
 * das fotos reais das peças, e deixa baixar ou compartilhar. Nada é enviado ao servidor. */
export default function ExportTripImage({ title, subtitle, looks, fileName }: Props) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  async function generate() {
    setBusy(true); setError(null);
    try {
      const S = 2; // nitidez
      const W = 1600, M = 56, GAP = 28, PAD = 22;
      const cols = looks.length <= 3 ? Math.max(1, looks.length) : looks.length <= 6 ? 3 : 4;
      const cardW = (W - M * 2 - GAP * (cols - 1)) / cols;
      const cellGap = 14;
      const cell = (cardW - PAD * 2 - cellGap) / 2;
      const nameLH = 18;
      const headerH = 78;

      const urls = Array.from(new Set(looks.flatMap((l) => l.pieces.map((p) => p.photo).filter(Boolean) as string[])));
      const loaded = new Map<string, HTMLImageElement | null>();
      await Promise.all(urls.map(async (u) => loaded.set(u, await loadImage(u))));

      // alturas: cada cartão tem N linhas de peças; a linha do mesmo grupo de cartões tem a altura do maior
      const cardHeights = looks.map((l) => PAD + headerH + Math.ceil(l.pieces.length / 2) * (cell + 8 + nameLH * 2 + cellGap) + PAD - cellGap);
      const rowHeights: number[] = [];
      for (let i = 0; i < looks.length; i += cols) rowHeights.push(Math.max(...cardHeights.slice(i, i + cols)));
      const topH = 190, footH = 90;
      const H = topH + rowHeights.reduce((a, b) => a + b, 0) + GAP * Math.max(0, rowHeights.length - 1) + footH + M / 2;

      const canvas = document.createElement("canvas");
      canvas.width = W * S; canvas.height = H * S;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas indisponível");
      ctx.scale(S, S);
      ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);

      // cabeçalho
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#a9714c"; ctx.font = "700 15px system-ui, sans-serif";
      (ctx as any).letterSpacing = "3px"; ctx.fillText("MALA INTELIGENTE", M, 72); (ctx as any).letterSpacing = "0px";
      ctx.fillStyle = INK; ctx.font = "500 56px Georgia, serif"; ctx.fillText(title, M, 132);
      ctx.fillStyle = MUTED; ctx.font = "400 20px system-ui, sans-serif"; ctx.fillText(subtitle, M, 168);

      // cartões
      let y = topH;
      for (let r = 0; r * cols < looks.length; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          if (idx >= looks.length) break;
          const look = looks[idx];
          const x = M + c * (cardW + GAP);
          const h = rowHeights[r];
          ctx.save();
          ctx.shadowColor = "rgba(107,59,72,0.16)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
          ctx.fillStyle = "#fff"; roundRect(ctx, x, y, cardW, h, 26); ctx.fill();
          ctx.restore();
          ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; roundRect(ctx, x, y, cardW, h, 26); ctx.stroke();

          ctx.fillStyle = "#a9714c"; ctx.font = "800 13px system-ui, sans-serif";
          (ctx as any).letterSpacing = "2px"; ctx.fillText(`DIA ${look.day}`, x + PAD, y + PAD + 14); (ctx as any).letterSpacing = "0px";
          ctx.fillStyle = INK; ctx.font = "700 20px system-ui, sans-serif";
          const titleLines = wrapLines(ctx, look.label, cardW - PAD * 2, 2);
          titleLines.forEach((ln, i) => ctx.fillText(ln, x + PAD, y + PAD + 40 + i * 24));

          look.pieces.forEach((p, i) => {
            const cx = x + PAD + (i % 2) * (cell + cellGap);
            const cy = y + PAD + headerH + Math.floor(i / 2) * (cell + 8 + nameLH * 2 + cellGap);
            const img = p.photo ? loaded.get(p.photo) : null;
            if (img) drawCover(ctx, img, cx, cy, cell, cell, 14);
            else { ctx.fillStyle = SOFT; roundRect(ctx, cx, cy, cell, cell, 14); ctx.fill(); ctx.fillStyle = "#c9b79c"; ctx.font = "400 34px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("👕", cx + cell / 2, cy + cell / 2 + 12); ctx.textAlign = "left"; }
            ctx.fillStyle = "#4a3f38"; ctx.font = "500 14px system-ui, sans-serif";
            wrapLines(ctx, p.name, cell, 2).forEach((ln, li) => ctx.fillText(ln, cx, cy + cell + 20 + li * nameLH));
          });
        }
        y += rowHeights[r] + GAP;
      }

      // rodapé
      ctx.fillStyle = MUTED; ctx.font = "400 16px system-ui, sans-serif";
      ctx.fillText(`${looks.length} look${looks.length === 1 ? "" : "s"} · gerado em ${new Date().toLocaleDateString("pt-BR")} · Closet Inteligente`, M, H - 34);

      const b: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (!b) throw new Error("não foi possível gerar a imagem");
      if (preview) URL.revokeObjectURL(preview);
      setBlob(b);
      setPreview(URL.createObjectURL(b));
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      console.error("exportar mala falhou:", e);
      setError("Não consegui gerar a imagem agora. Atualize a página e tente de novo.");
    } finally { setBusy(false); }
  }

  async function share() {
    if (!blob) return;
    const file = new File([blob], fileName, { type: "image/png" });
    try {
      if ((navigator as any).canShare?.({ files: [file] })) await (navigator as any).share({ files: [file], title });
      else download();
    } catch { /* compartilhamento cancelado */ }
  }
  function download() {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  }

  return (
    <div className="export-trip no-print">
      <button type="button" onClick={generate} disabled={busy || looks.length === 0}>{busy ? "Montando a imagem..." : "📤 Exportar mala (imagem)"}</button>
      {error && <p role="alert" className="look-meta" style={{ color: "#b3261e" }}>{error}</p>}
      {preview && (
        <div className="export-panel" ref={panelRef}>
          <p className="look-meta">Pré-visualização da imagem da mala. Baixe ou compartilhe.</p>
          <img src={preview} alt={`Visão geral da mala ${title}`} className="export-preview" />
          <div className="action-row">
            <button type="button" onClick={download}>⬇️ Baixar imagem</button>
            <button type="button" className="reject" onClick={share}>Compartilhar</button>
            <button type="button" className="link" onClick={() => { URL.revokeObjectURL(preview); setPreview(null); setBlob(null); }}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
