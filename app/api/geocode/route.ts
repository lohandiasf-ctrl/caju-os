import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { geocodeCache } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';

// technician-map.json only carries the 425 cities that have technicians, so a
// search for anywhere else has no coordinates to measure distance from. This
// resolves those through Nominatim and caches the answer: their usage policy
// asks for caching and a real User-Agent, and a city's coordinates never move.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'CajuOS/1.0 (operacoes.cajutech.net)';

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const raw = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    if (raw.length < 3) return Response.json({ found: false, reason: 'Busca muito curta.' });

    const key = raw.toLowerCase().replace(/\s+/g, ' ');
    const db = getDb();
    const cached = await db.select().from(geocodeCache).where(eq(geocodeCache.query, key)).get();
    if (cached) {
      return Response.json({ found: true, lat: cached.lat, lng: cached.lng, label: cached.label, cached: true });
    }

    const url = `${NOMINATIM}?q=${encodeURIComponent(`${raw}, Brasil`)}&format=json&limit=1&countrycodes=br`;
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR' } });
    if (!response.ok) return Response.json({ found: false, reason: 'Serviço de localização indisponível.' });

    const results = await response.json() as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const hit = results?.[0];
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    if (!hit || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ found: false, reason: 'Cidade não encontrada.' });
    }

    const label = (hit.display_name ?? raw).split(',').slice(0, 2).join(',').trim();
    await db.insert(geocodeCache)
      .values({ query: key, lat, lng, label, createdAt: new Date().toISOString() })
      .onConflictDoNothing();

    return Response.json({ found: true, lat, lng, label, cached: false });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ found: false, reason: 'Não foi possível localizar a cidade.' });
  }
}
