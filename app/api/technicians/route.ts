import { asc, eq } from 'drizzle-orm';
import { geocodeCache, technicianReviews, technicians } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';
import technicianMap from '@/public/data/technician-map.json';

// CPF, chave PIX e endereço completo são dado pessoal de 1.501 pessoas e só
// servem a quem trata pagamento ou monta o cadastro enviado ao Jira. O perfil
// `tecnico` enxerga a lista para escolher colegas e ver cobertura — não precisa
// disso, e a tela de Técnicos é aberta a ele.
const SENSITIVE_ROLES = new Set(['gerencia', 'coordenador', 'n1', 'analista']);

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const canSeeSensitive = SENSITIVE_ROLES.has(user.role);
    const db = getDb();
    const [rows, reviews] = await Promise.all([
      db.select({
        id: technicians.id, technicianExternalId: technicians.technicianExternalId, technicianCode: technicians.technicianCode,
        name: technicians.name, cpf: technicians.cpf, phone: technicians.phone, email: technicians.email, pixKey: technicians.pixKey,
        age: technicians.age, city: technicians.baseCity, state: technicians.baseState, fullAddress: technicians.fullAddress,
        sourceStatus: technicians.sourceStatus, status: technicians.status, approved: technicians.approved, onboardingCompleted: technicians.onboardingCompleted,
        hasVehicle: technicians.hasVehicle, vehicleType: technicians.vehicleType, alternativeTransport: technicians.alternativeTransport,
        servesOtherCities: technicians.servesOtherCities, extraCities: technicians.extraCities, toolsCount: technicians.toolsCount,
        availableTools: technicians.availableTools, specialtiesCount: technicians.specialtiesCount, specialties: technicians.specialties,
      }).from(technicians).orderBy(asc(technicians.name)).all(),
      db.select({ technicianId: technicianReviews.technicianId, rating: technicianReviews.rating }).from(technicianReviews).all(),
    ]);
    const stats = new Map<number, { sum: number; count: number }>();
    for (const review of reviews) {
      const current = stats.get(review.technicianId) ?? { sum: 0, count: 0 };
      current.sum += review.rating;
      current.count += 1;
      stats.set(review.technicianId, current);
    }
    const techniciansWithHistory = rows.map((row) => {
      const history = stats.get(row.id);
      const base = canSeeSensitive ? row : { ...row, cpf: null, pixKey: null, fullAddress: null };
      return { ...base, reviewCount: history?.count ?? 0, reviewAvg: history ? history.sum / history.count : null };
    });
    const url = new URL(request.url);
    const city = url.searchParams.get('near')?.trim() ?? '';
    if (!city) return Response.json({ technicians: techniciansWithHistory }, { headers: { 'Cache-Control': 'private, max-age=60' } });
    const limit = [2, 5, 10, 20].includes(Number(url.searchParams.get('limit')))
      ? Number(url.searchParams.get('limit'))
      : 5;
    const target = await resolvePlace(city, db);
    if (!target) return Response.json({ error: 'Cidade não encontrada. Digite cidade e UF, por exemplo Salvador/BA.', technicians: [] }, { status: 404 });
    const nearby = techniciansWithHistory
      .map((technician) => {
        const place = findPlace(`${technician.city} ${technician.state}`);
        return place ? { ...technician, distanceKm: Math.round(distanceKm(target, place)) } : null;
      })
      .filter((technician): technician is NonNullable<typeof technician> => technician !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, limit);
    return Response.json({ city: target.label, technicians: nearby }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar os técnicos.' }, { status: 500 });
  }
}

type Place = { city: string; uf: string; lat: number; lng: number; label: string };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, ' ').trim();
function findPlace(query: string): Place | null {
  const wanted = normalize(query);
  const exact = technicianMap.find((place) => normalize(`${place.city} ${place.uf}`) === wanted)
    ?? technicianMap.find((place) => normalize(place.city) === wanted);
  return exact && Number.isFinite(exact.lat) && Number.isFinite(exact.lng)
    ? { city: exact.city, uf: exact.uf, lat: exact.lat, lng: exact.lng, label: exact.uf ? `${exact.city}/${exact.uf}` : exact.city }
    : null;
}
async function resolvePlace(query: string, db: ReturnType<typeof getDb>): Promise<Place | null> {
  const listed = findPlace(query);
  if (listed) return listed;
  const key = normalize(query);
  const cached = await db.select().from(geocodeCache).where(eq(geocodeCache.query, key)).get();
  if (cached) return { city: query, uf: '', lat: cached.lat, lng: cached.lng, label: cached.label };
  const endpoint = new URL('https://nominatim.openstreetmap.org/search');
  endpoint.searchParams.set('q', `${query}, Brasil`);
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('limit', '1');
  endpoint.searchParams.set('countrycodes', 'br');
  const response = await fetch(endpoint, { headers: { 'User-Agent': 'CajuOS/1.0 (operacoes.cajutech.net)', 'Accept-Language': 'pt-BR' } });
  if (!response.ok) return null;
  const [hit] = await response.json() as Array<{ lat?: string; lon?: string; display_name?: string }>;
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lon);
  if (!hit || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const label = (hit.display_name ?? query).split(',').slice(0, 2).join(',').trim();
  await db.insert(geocodeCache).values({ query: key, lat, lng, label, createdAt: new Date().toISOString() }).onConflictDoNothing();
  return { city: query, uf: '', lat, lng, label };
}
function distanceKm(from: Place, to: Place) {
  const radians = (value: number) => value * Math.PI / 180;
  const latitude = radians(to.lat - from.lat);
  const longitude = radians(to.lng - from.lng);
  const value = Math.sin(latitude / 2) ** 2 + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
