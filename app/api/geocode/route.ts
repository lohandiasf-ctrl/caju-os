import { requireApiUser } from '@/lib/server/firebase-auth';
import { geocodeCity } from '@/lib/server/geocode';

// A tela do mapa mede distância a partir de uma cidade qualquer, e
// `technician-map.json` só traz as 425 que têm técnico. A resolução e o cache
// vivem em `lib/server/geocode.ts`, porque o assistente precisa do mesmo.
export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const raw = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    if (raw.length < 3) return Response.json({ found: false, reason: 'Busca muito curta.' });

    const hit = await geocodeCity(raw);
    if (!hit) return Response.json({ found: false, reason: 'Cidade não encontrada.' });
    return Response.json({ found: true, lat: hit.lat, lng: hit.lng, label: hit.label, cached: hit.cached });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Geocode', error);
    return Response.json({ found: false, reason: 'Não foi possível localizar a cidade.' }, { status: 500 });
  }
}
