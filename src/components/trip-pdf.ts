/** Roteiro da mala em PDF (A4, várias páginas), montado no navegador: cada página é desenhada num canvas,
 * vira JPEG e é embutida num PDF mínimo. Não depende de biblioteca nem do diálogo de impressão, então o arquivo
 * sai igual no celular e no computador e pode ser compartilhado direto (WhatsApp, e-mail...). */

export type PdfPiece = { name: string; photo: string | null; cat?: string };
export type PdfLook = { day: number; tag: string; label: string; imageUrl: string | null; pieces: PdfPiece[] };
export type PdfData = {
  destination: string; days: number | null; dates: string; objective: string; clima: string | null;
  reasoning: string; alerts: string[];
  looks: PdfLook[]; groups: { title: string; items: PdfPiece[] }[]; checklist: { label: string; done: boolean }[];
};

const BG = "#fbf3f1", INK = "#2b1c25", WINE = "#8e3a57", MUTED = "#7f6b73", PANEL = "#fffdfc", LINE = "#f0dfdd", SOFT = "#f7e9e7", GOLD = "#c4a07a", GOLD_INK = "#876744";
let DISP = "Georgia, serif", UI = "system-ui, sans-serif";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; });
}
const thumb = (u: string | null, w: number) => (u && u.includes("/api/closet/photos/") && !u.includes("?") ? `${u}?w=${w}` : u);
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text; while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1); return `${t}…`;
}
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean); const lines: string[] = []; let cur = "";
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const k = lines.slice(0, maxLines); k[maxLines - 1] = ellipsize(ctx, `${k[maxLines - 1]}…`, maxW); return k; }
  return lines;
}
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r: number) {
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
  const s = Math.max(w / img.width, h / img.height); const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); ctx.restore();
}
const spaced = (ctx: CanvasRenderingContext2D, px: number) => { (ctx as any).letterSpacing = `${px}px`; };

function buildPdf(pages: { bytes: Uint8Array; w: number; h: number }[], title: string): Blob {
  const enc = new TextEncoder(); const parts: Uint8Array[] = []; let off = 0; const offs: number[] = [];
  const push = (d: string | Uint8Array) => { const b = typeof d === "string" ? enc.encode(d) : d; parts.push(b); off += b.length; };
  const n = pages.length, infoId = 3 + n * 3, total = infoId;
  const begin = (id: number) => { offs[id] = off; push(`${id} 0 obj\n`); };
  push("%PDF-1.4\n%âãÏÓ\n");
  begin(1); push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  begin(2); push(`<< /Type /Pages /Kids [${pages.map((_, k) => `${3 + k * 3} 0 R`).join(" ")}] /Count ${n} >>\nendobj\n`);
  pages.forEach((p, k) => {
    const pid = 3 + k * 3, cid = pid + 1, iid = pid + 2;
    begin(pid); push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>\nendobj\n`);
    const content = "q 595.28 0 0 841.89 0 0 cm /Im0 Do Q";
    begin(cid); push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
    begin(iid); push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`);
    push(p.bytes); push("\nendstream\nendobj\n");
  });
  const hex = "FEFF" + Array.from(title).map((c) => c.charCodeAt(0).toString(16).padStart(4, "0")).join("").toUpperCase();
  begin(infoId); push(`<< /Title <${hex}> /Producer (Closet Inteligente) >>\nendobj\n`);
  const xref = off;
  push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= total; i++) push(`${String(offs[i]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts as unknown as BlobPart[], { type: "application/pdf" });
}

export async function renderTripPdf(d: PdfData): Promise<Blob> {
  const cs = getComputedStyle(document.documentElement);
  DISP = cs.getPropertyValue("--font-cormorant").trim() || "Georgia, serif";
  UI = cs.getPropertyValue("--font-manrope").trim() || "system-ui, sans-serif";
  await Promise.all([`500 40px ${DISP}`, `italic 500 40px ${DISP}`, `600 40px ${DISP}`, `500 16px ${UI}`, `600 16px ${UI}`, `700 16px ${UI}`, `800 16px ${UI}`].map((f) => document.fonts.load(f).catch(() => null)));

  const urls = new Set<string>();
  d.looks.forEach((l) => { if (l.imageUrl) urls.add(l.imageUrl.includes("?") ? l.imageUrl : `${l.imageUrl}?w=960`); l.pieces.forEach((p) => { const t = thumb(p.photo, 480); if (t) urls.add(t); }); });
  d.groups.forEach((g) => g.items.forEach((p) => { const t = thumb(p.photo, 480); if (t) urls.add(t); }));
  const imgs = new Map<string, HTMLImageElement | null>();
  await Promise.all([...urls].map(async (u) => imgs.set(u, await loadImage(u))));
  const lookImg = (l: PdfLook) => (l.imageUrl ? imgs.get(l.imageUrl.includes("?") ? l.imageUrl : `${l.imageUrl}?w=960`) || null : null);
  const pieceImg = (p: PdfPiece) => { const t = thumb(p.photo, 480); return t ? imgs.get(t) || null : null; };

  const W = 1240, H = 1754, M = 72, S = 1.25, TOP = 124, BOTTOM = H - 104, CW = W - M * 2;
  const out: { bytes: Uint8Array; w: number; h: number }[] = [];
  let cv: HTMLCanvasElement | null = null, ctx!: CanvasRenderingContext2D, y = 0, pageNo = 0;

  const finishPage = async () => {
    if (!cv) return;
    ctx.textAlign = "center"; ctx.fillStyle = GOLD; ctx.fillRect(M, H - 84, CW, 1.2);
    ctx.fillStyle = MUTED; ctx.font = `600 12px ${UI}`; spaced(ctx, 3);
    ctx.fillText(`FEITO COM O QUE VOCÊ JÁ TEM NO CLOSET  ·  CLOSET INTELIGENTE  ·  ${pageNo}`, W / 2, H - 50); spaced(ctx, 0); ctx.textAlign = "left";
    const blob: Blob | null = await new Promise((res) => cv!.toBlob(res, "image/jpeg", 0.9));
    if (!blob) throw new Error("jpeg");
    out.push({ bytes: new Uint8Array(await blob.arrayBuffer()), w: cv.width, h: cv.height });
    cv.width = 0; cv = null;
  };
  const newPage = async (first = false) => {
    await finishPage();
    cv = document.createElement("canvas"); cv.width = Math.round(W * S); cv.height = Math.round(H * S);
    const c = cv.getContext("2d"); if (!c) throw new Error("canvas"); ctx = c;
    ctx.scale(S, S); ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H); ctx.textBaseline = "alphabetic"; pageNo++;
    if (first) { ctx.fillStyle = WINE; ctx.fillRect(0, 0, W, 14); y = 0; return; }
    ctx.fillStyle = MUTED; ctx.font = `600 13px ${UI}`; spaced(ctx, 4);
    ctx.fillText(ellipsize(ctx, `MINHA MALA DE VIAGEM  ·  ${d.destination.toUpperCase()}`, CW - 300), M, 68);
    ctx.textAlign = "right"; ctx.fillText("CLOSET INTELIGENTE", W - M, 68); ctx.textAlign = "left"; spaced(ctx, 0);
    ctx.fillStyle = GOLD; ctx.fillRect(M, 88, CW, 1.2); y = TOP;
  };
  const ensure = async (h: number) => { if (y + h > BOTTOM) await newPage(); };
  const title = (t: string, sub?: string) => {
    ctx.fillStyle = INK; ctx.font = `500 56px ${DISP}`; ctx.fillText(t, M, y + 46); ctx.fillStyle = GOLD; ctx.fillRect(M, y + 66, 56, 2);
    y += 92; if (sub) { ctx.fillStyle = MUTED; ctx.font = `500 22px ${UI}`; ctx.fillText(sub, M, y); y += 40; }
  };

  // ============ capa
  await newPage(true);
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD_INK; ctx.font = `700 15px ${UI}`; spaced(ctx, 7); ctx.fillText("CLOSET INTELIGENTE", W / 2, 96);
  ctx.fillStyle = MUTED; ctx.font = `600 16px ${UI}`; spaced(ctx, 8); ctx.fillText("MINHA MALA DE VIAGEM", W / 2, 170); spaced(ctx, 0);
  let fs = 128; ctx.font = `600 ${fs}px ${DISP}`;
  while (ctx.measureText(d.destination).width > CW && fs > 64) { fs -= 6; ctx.font = `600 ${fs}px ${DISP}`; }
  ctx.fillStyle = INK;
  const dest = wrap(ctx, d.destination, CW, 2); let dy = 290;
  dest.forEach((ln, i) => ctx.fillText(ln, W / 2, dy + i * (fs * 0.95)));
  dy += (dest.length - 1) * fs * 0.95 + 44;
  ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - 40, dy, 80, 2); ctx.textAlign = "left";
  y = dy + 48;

  // chips de informação
  const chips = [d.days ? `${d.days} ${d.days === 1 ? "dia" : "dias"}` : "", d.dates, d.objective, `${d.looks.length} look${d.looks.length === 1 ? "" : "s"}`,
    `${d.groups.reduce((s, g) => s + g.items.length, 0)} peças`].filter(Boolean);
  ctx.font = `600 22px ${UI}`;
  const cw = chips.map((c) => ctx.measureText(c).width + 44);
  let rowChips: number[] = [], rowW = 0; const rowsC: number[][] = [];
  cw.forEach((w, i) => { if (rowW + w > CW && rowChips.length) { rowsC.push(rowChips); rowChips = []; rowW = 0; } rowChips.push(i); rowW += w + 12; });
  if (rowChips.length) rowsC.push(rowChips);
  rowsC.forEach((row) => {
    const tw = row.reduce((s, i) => s + cw[i] + 12, -12); let x = (W - tw) / 2;
    row.forEach((i) => {
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; rr(ctx, x, y, cw[i], 46, 23); ctx.stroke();
      ctx.fillStyle = INK; ctx.font = `600 22px ${UI}`; ctx.fillText(chips[i], x + 22, y + 31); x += cw[i] + 12;
    });
    y += 60;
  });
  y += 16;

  if (d.clima) {
    ctx.font = `600 22px ${UI}`; const lines = wrap(ctx, d.clima, CW - 120, 2); const h = 70 + lines.length * 32;
    ctx.fillStyle = SOFT; rr(ctx, M, y, CW, h, 22); ctx.fill();
    ctx.fillStyle = GOLD_INK; ctx.font = `700 13px ${UI}`; spaced(ctx, 4); ctx.fillText("CLIMA PREVISTO", M + 36, y + 40); spaced(ctx, 0);
    ctx.fillStyle = INK; ctx.font = `500 24px ${UI}`; lines.forEach((ln, i) => ctx.fillText(ln, M + 36, y + 78 + i * 32));
    y += h + 26;
  }
  if (d.reasoning) {
    ctx.font = `italic 500 32px ${DISP}`; const lines = wrap(ctx, d.reasoning, CW - 100, 9); const h = 48 + lines.length * 44;
    ctx.fillStyle = PANEL; rr(ctx, M, y, CW, h, 22); ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.2; rr(ctx, M, y, CW, h, 22); ctx.stroke();
    ctx.fillStyle = GOLD; ctx.fillRect(M + 28, y + 26, 3, h - 52);
    ctx.fillStyle = INK; lines.forEach((ln, i) => ctx.fillText(ln, M + 56, y + 62 + i * 44));
    y += h + 26;
  }
  if (d.alerts.length) {
    ctx.font = `500 22px ${UI}`;
    const al = d.alerts.slice(0, 4).map((a) => wrap(ctx, a, CW - 100, 2)); const h = 70 + al.reduce((s, l) => s + l.length * 30 + 8, 0);
    ctx.fillStyle = "#fffaf0"; rr(ctx, M, y, CW, h, 22); ctx.fill(); ctx.strokeStyle = "#efd9b0"; ctx.lineWidth = 1.5; rr(ctx, M, y, CW, h, 22); ctx.stroke();
    ctx.fillStyle = GOLD_INK; ctx.font = `700 13px ${UI}`; spaced(ctx, 4); ctx.fillText("ATENÇÃO", M + 36, y + 40); spaced(ctx, 0);
    let ay = y + 76; ctx.fillStyle = INK; ctx.font = `500 22px ${UI}`;
    al.forEach((ls) => { ls.forEach((ln, i) => ctx.fillText((i === 0 ? "•  " : "    ") + ln, M + 36, ay + i * 30)); ay += ls.length * 30 + 8; });
    y += h + 26;
  }

  // looks em miniatura (visão geral)
  if (d.looks.length) {
    const n = d.looks.length, gap = 14, avail = BOTTOM - (y + 100);
    let cols = Math.min(n, 5), best = 0;
    for (let c = Math.min(n, 3); c <= Math.min(n, 6); c++) {
      const w0 = (CW - gap * (c - 1)) / c, rows0 = Math.ceil(n / c), h0 = Math.min(w0 * 1.32, avail / rows0 - 56);
      if (h0 >= w0 * 0.9 && w0 * h0 > best) { best = w0 * h0; cols = c; }
    }
    const tw = (CW - gap * (cols - 1)) / cols, rowsAll = Math.ceil(n / cols);
    const th = Math.max(tw * 0.9, Math.min(tw * 1.32, avail / rowsAll - 56)), rowH = th + 56;
    await ensure(100 + rowH);
    title("Os looks da viagem");
    for (let i = 0; i < n; i++) {
      if (i % cols === 0 && i > 0) { y += rowH; await ensure(rowH); }
      const l = d.looks[i], x = M + (i % cols) * (tw + gap);
      ctx.fillStyle = SOFT; rr(ctx, x, y, tw, th, 16); ctx.fill();
      const im = lookImg(l);
      if (im) cover(ctx, im, x, y, tw, th, 16);
      else { const ps = l.pieces.map(pieceImg).filter(Boolean).slice(0, 4) as HTMLImageElement[]; if (ps.length) { const h = th / ps.length; ps.forEach((p, k) => cover(ctx, p, x, y + k * h, tw, h - 2, k === 0 ? 16 : 2)); } }
      ctx.font = `800 13px ${UI}`; spaced(ctx, 1.5); const dt = `DIA ${l.day}`; const dw = ctx.measureText(dt).width + 24;
      ctx.fillStyle = "rgba(255,253,250,0.94)"; rr(ctx, x + 10, y + 10, dw, 28, 14); ctx.fill(); ctx.fillStyle = WINE; ctx.fillText(dt, x + 22, y + 29); spaced(ctx, 0);
      ctx.fillStyle = INK; ctx.font = `600 18px ${UI}`; ctx.fillText(ellipsize(ctx, l.label || l.tag, tw), x, y + th + 28);
    }
    y += rowH;
  }

  // ============ looks dia a dia
  if (d.looks.length) {
    await newPage();
    title("Look por look", "Cada compromisso, com as peças que você já tem.");
    for (const l of d.looks) {
      const n = l.pieces.length, twoCol = n > 3, rowH = 92, nRows = twoCol ? Math.ceil(n / 2) : n, blockH = Math.max(560, 262 + nRows * rowH + 24);
      await ensure(blockH + 34);
      ctx.fillStyle = PANEL; rr(ctx, M, y, CW, blockH, 28); ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.4; rr(ctx, M, y, CW, blockH, 28); ctx.stroke();
      const ix = M + 22, iy = y + 22, iw = 420, ih = blockH - 44;
      ctx.fillStyle = SOFT; rr(ctx, ix, iy, iw, ih, 20); ctx.fill();
      const im = lookImg(l);
      if (im) cover(ctx, im, ix, iy, iw, ih, 20);
      else { const ps = l.pieces.map(pieceImg).filter(Boolean).slice(0, 4) as HTMLImageElement[]; if (ps.length) { const h = ih / ps.length; ps.forEach((p, k) => cover(ctx, p, ix, iy + k * h, iw, h - 3, k === 0 ? 20 : 3)); } }
      const x0 = ix + iw + 40, rw = M + CW - 28 - x0;
      let py = y + 40;
      ctx.font = `800 15px ${UI}`; spaced(ctx, 2); const dt = `DIA ${l.day}`; const dw = ctx.measureText(dt).width + 34;
      ctx.fillStyle = WINE; rr(ctx, x0, py, dw, 36, 18); ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillText(dt, x0 + 17, py + 25);
      ctx.font = `700 14px ${UI}`; spaced(ctx, 2.5); const tg = ellipsize(ctx, l.tag, rw - dw - 40); const tgw = ctx.measureText(tg).width + 30;
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; rr(ctx, x0 + dw + 12, py, tgw, 36, 18); ctx.stroke(); ctx.fillStyle = GOLD_INK; ctx.fillText(tg, x0 + dw + 27, py + 24); spaced(ctx, 0);
      py += 50;
      ctx.fillStyle = INK; ctx.font = `600 46px ${DISP}`;
      wrap(ctx, l.label || l.tag, rw, 2).forEach((ln, i) => ctx.fillText(ln, x0, py + 38 + i * 50));
      py += 38 + Math.min(2, wrap(ctx, l.label || l.tag, rw, 2).length) * 50 + 10;
      ctx.fillStyle = GOLD; ctx.fillRect(x0, py, 44, 2); py += 34;
      ctx.fillStyle = MUTED; ctx.font = `700 13px ${UI}`; spaced(ctx, 4); ctx.fillText("PEÇAS DO LOOK", x0, py); spaced(ctx, 0); py += 22;
      const colW = twoCol ? (rw - 16) / 2 : rw, fsz = twoCol ? 20 : 24, lh = twoCol ? 25 : 30;
      l.pieces.forEach((p, k) => {
        const col = twoCol ? (k % 2) : 0, row = twoCol ? Math.floor(k / 2) : k;
        const px = x0 + col * (colW + 16), ry = py + row * rowH, t = 76, pim = pieceImg(p);
        ctx.fillStyle = SOFT; rr(ctx, px, ry, t, t, 14); ctx.fill(); if (pim) cover(ctx, pim, px, ry, t, t, 14);
        ctx.fillStyle = INK; ctx.font = `600 ${fsz}px ${UI}`;
        const nl = wrap(ctx, p.name, colW - t - 18, 2);
        const ty = ry + t / 2 - (nl.length - 1) * (lh / 2) + (p.cat ? -8 : 7);
        nl.forEach((ln, i) => ctx.fillText(ln, px + t + 16, ty + i * lh));
        if (p.cat) { ctx.fillStyle = MUTED; ctx.font = `500 ${twoCol ? 15 : 18}px ${UI}`; ctx.fillText(ellipsize(ctx, p.cat, colW - t - 18), px + t + 16, ty + nl.length * lh - 4); }
      });
      y += blockH + 30;
    }
  }

  // ============ o que vai na mala
  const groups = d.groups.filter((g) => g.items.length > 0);
  if (groups.length) {
    await newPage();
    title("O que vai na mala", "Tudo o que entra na bagagem, por tipo.");
    const perRow = 6, gap = 14, t = (CW - gap * (perRow - 1)) / perRow, rowH = t + 88;
    for (const g of groups) {
      await ensure(70 + rowH);
      ctx.fillStyle = INK; ctx.font = `500 40px ${DISP}`; ctx.fillText(g.title, M, y + 34); ctx.fillStyle = GOLD; ctx.fillRect(M, y + 50, 40, 2);
      ctx.fillStyle = MUTED; ctx.font = `600 18px ${UI}`; ctx.textAlign = "right"; ctx.fillText(`${g.items.length} ${g.items.length === 1 ? "peça" : "peças"}`, W - M, y + 32); ctx.textAlign = "left";
      y += 74;
      for (let i = 0; i < g.items.length; i++) {
        if (i % perRow === 0 && i > 0) { y += rowH; await ensure(rowH); }
        const p = g.items[i], x = M + (i % perRow) * (t + gap), pim = pieceImg(p);
        ctx.fillStyle = SOFT; rr(ctx, x, y, t, t, 18); ctx.fill(); if (pim) cover(ctx, pim, x, y, t, t, 18);
        ctx.fillStyle = INK; ctx.font = `600 17px ${UI}`; ctx.textAlign = "center";
        wrap(ctx, p.name, t, 2).forEach((ln, k) => ctx.fillText(ln, x + t / 2, y + t + 26 + k * 22)); ctx.textAlign = "left";
      }
      y += rowH + 22;
    }
  }

  // ============ checklist
  if (d.checklist.length) {
    const half = Math.ceil(d.checklist.length / 2), h = 120 + half * 46;
    await ensure(h);
    ctx.fillStyle = PANEL; rr(ctx, M, y, CW, h, 24); ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.4; rr(ctx, M, y, CW, h, 24); ctx.stroke();
    ctx.fillStyle = INK; ctx.font = `500 40px ${DISP}`; ctx.fillText("Checklist da mala", M + 40, y + 62); ctx.fillStyle = GOLD; ctx.fillRect(M + 40, y + 78, 40, 2);
    d.checklist.forEach((it, i) => {
      const col = i < half ? 0 : 1, row = i < half ? i : i - half, cx = M + 40 + col * (CW / 2 - 10), cy = y + 130 + row * 46;
      ctx.strokeStyle = GOLD_INK; ctx.lineWidth = 2.2; rr(ctx, cx, cy - 22, 26, 26, 6); ctx.stroke();
      if (it.done) { ctx.beginPath(); ctx.moveTo(cx + 6, cy - 9); ctx.lineTo(cx + 12, cy - 3); ctx.lineTo(cx + 21, cy - 17); ctx.stroke(); }
      ctx.fillStyle = INK; ctx.font = `500 23px ${UI}`; ctx.fillText(ellipsize(ctx, it.label, CW / 2 - 100), cx + 42, cy);
    });
    y += h + 20;
  }

  await finishPage();
  return buildPdf(out, `Minha mala de viagem - ${d.destination}`);
}
