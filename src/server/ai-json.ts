/** A IA às vezes envolve o JSON em ```json ... ``` ou acrescenta uma frase antes/depois. Tenta o texto
 * puro, depois sem as cercas e por fim o primeiro objeto {...} encontrado. Devolve null se nada serve. */
export function parseAiJson(text: string | null | undefined): any {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const attempts = [raw, raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()];
  for (const a of attempts) { try { return JSON.parse(a); } catch { /* tenta o próximo formato */ } }
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* sem JSON válido */ } }
  return null;
}
