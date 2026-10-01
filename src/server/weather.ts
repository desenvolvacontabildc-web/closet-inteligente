import "server-only";

export type WeatherNow = { city: string; temp: number; chovendo: boolean } | null;

/** Clima atual da cidade salva no perfil (geocodificação + previsão via Open-Meteo, sem
 * chave de API). Sem conexão de banco -- só faz o fetch externo. Falha aqui (sem cidade
 * cadastrada, API fora do ar, cidade não encontrada) nunca deve travar nada, só volta null. */
export async function fetchCurrentWeather(city: string): Promise<WeatherNow> {
  if (!city) return null;
  try {
    const geo: any = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt&format=json`, { signal: AbortSignal.timeout(4000) }).then(r => r.json());
    const loc = geo?.results?.[0];
    if (!loc) return null;
    const fc: any = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,precipitation&timezone=auto`, { signal: AbortSignal.timeout(4000) }).then(r => r.json());
    const temp = fc?.current?.temperature_2m;
    if (temp === undefined || temp === null) return null;
    return { city: loc.name || city, temp: Math.round(temp), chovendo: Number(fc?.current?.precipitation || 0) > 0 };
  } catch {
    return null;
  }
}
