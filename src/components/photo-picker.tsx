"use client";
import { useRef, useState } from "react";

/** Escolhe fotos e, antes de enviar, reduz cada uma (lado maior 1600 px, JPEG): celular tira fotos de 3 a 6 MB, e várias de uma vez
 * estourariam o limite de envio. As fotos reduzidas substituem as originais dentro do próprio campo do formulário. */
async function shrink(file: File, maxSide = 1600): Promise<File> {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
    URL.revokeObjectURL(url);
    const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

export default function PhotoPicker({ name, multiple = false, max = 8, label, hint }: { name: string; multiple?: boolean; max?: number; label: string; hint?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function onChange() {
    const input = ref.current; if (!input?.files?.length) { setPreviews([]); setNote(""); return; }
    setBusy(true); setNote("");
    const picked = Array.from(input.files).filter((f) => f.type.startsWith("image/")).slice(0, multiple ? max : 1);
    if (multiple && input.files.length > max) setNote(`Usei as primeiras ${max} fotos.`);
    const out = await Promise.all(picked.map((f) => shrink(f)));
    const dt = new DataTransfer(); out.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    setPreviews((old) => { old.forEach((u) => URL.revokeObjectURL(u)); return out.map((f) => URL.createObjectURL(f)); });
    setBusy(false);
  }
  return <div className="photo-picker">
    <label>{label}<input ref={ref} type="file" name={name} accept="image/*" multiple={multiple} onChange={onChange} required /></label>
    {hint && <p className="look-meta">{hint}</p>}
    {busy && <p className="look-meta">Preparando as fotos...</p>}
    {note && <p className="look-meta">{note}</p>}
    {previews.length > 0 && <div className="pp-grid">{previews.map((u, i) => <img key={u} src={u} alt={`Foto ${i + 1}`} />)}</div>}
  </div>;
}
