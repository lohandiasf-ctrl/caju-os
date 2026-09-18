import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { geocodeCache } from '@/db/schema';

// Coordenadas de uma cidade. Estava dentro da rota `/api/geocode`, que a tela
// do mapa chama; o assistente precisa da mesma coisa para dizer se há técnico
// perto, então virou módulo em vez de uma segunda cópia.
//
// A política do Nominatim pede cache e um User-Agent de verdade. Coordenada de
// cidade não muda, então o cache é permanente.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'CajuOS/1.0 (operacoes.cajutech.net)';

export type GeocodeHit = { lat: number; lng: number; label: string; cached: boolean };

export async function geocodeCity(raw: string): Promise<GeocodeHit | null> {
  const term = raw.trim();
  if (term.length < 3) return null;
  const key = term.toLowerCase().replace(/\s+/g, ' ');
  const db = getDb();

  const cached = await db.select().from(geocodeCache).where(eq(geocodeCache.query, key)).get();
  if (cached) return { lat: cached.lat, lng: cached.lng, label: cached.label, cached: true };

  const url = `${NOMINATIM}?q=${encodeURIComponent(`${term}, Brasil`)}&format=json&limit=1&countrycodes=br`;
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR' } });
  if (!response.ok) return null;

  const results = await response.json().catch(() => null) as Array<{ lat?: string; lon?: string; display_name?: string }> | null;
  const hit = results?.[0];
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lon);
  if (!hit || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const label = (hit.display_name ?? term).split(',').slice(0, 2).join(',').trim();
  await db.insert(geocodeCache)
    .values({ query: key, lat, lng, label, createdAt: new Date().toISOString() })
    .onConflictDoNothing();
  return { lat, lng, label, cached: false };
}
