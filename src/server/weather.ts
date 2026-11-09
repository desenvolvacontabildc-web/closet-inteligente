import "server-only";

export type WeatherNow = { city: string; temp: number; chovendo: boolean } | null;

// A cada abertura da Home o clima fazia 2 chamadas externas em sequência. Agora a cidade é geocodificada uma
// vez só e o clima fica guardado por 20 minutos (em memória); falhas ficam guardadas por 2 minutos.
const GEO = new Map<string, { name: string; lat: number; lon: number } | null>();
const NOW = new Map<string, { at: number; ttl: number; data: WeatherNow }>();

/** Clima atual da cidade salva no perfil (geocodificação + previsão via Open-Meteo, sem
 * chave de API). Sem conexão de banco -- só faz o fetch externo. Falha aqui (sem cidade
 * cadastrada, API fora do ar, cidade não encontrada) nunca deve travar nada, só volta null. */
export async function fetchCurrentWeather(city: string): Promise<WeatherNow> {
  if (!city) return null;
  const key = city.trim().toLowerCase();
  const hit = NOW.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.data;
  const save = (data: WeatherNow, ttl: number) => { NOW.set(key, { at: Date.now(), ttl, data }); return data; };
  try {
    let loc = GEO.get(key);
    if (loc === undefined) {
      const geo: any = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt&format=json`, { signal: AbortSignal.timeout(3000) }).then(r => r.json());
      const g = geo?.results?.[0];
      loc = g ? { name: g.name || city, lat: g.latitude, lon: g.longitude } : null;
      GEO.set(key, loc);
    }
    if (!loc) return save(null, 20 * 60_000);
    const fc: any = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,precipitation&timezone=auto`, { signal: AbortSignal.timeout(3000) }).then(r => r.json());
    const temp = fc?.current?.temperature_2m;
    if (temp === undefined || temp === null) return save(null, 2 * 60_000);
    return save({ city: loc.name, temp: Math.round(temp), chovendo: Number(fc?.current?.precipitation || 0) > 0 }, 20 * 60_000);
  } catch {
    return save(null, 2 * 60_000);
  }
}
