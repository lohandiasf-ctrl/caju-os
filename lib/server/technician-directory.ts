import type { CoverageTechnician } from '@/lib/coverage';

// As coordenadas dos técnicos não estão no banco: vivem em
// `public/data/technician-directory.js`, que a tela do mapa carrega como
// script. O Worker serve esse arquivo, então o servidor o busca na própria
// origem e guarda em memória — são ~890 técnicos e o arquivo muda raramente.
const CACHE_TTL_MS = 6 * 60 * 60_000;
let cache: { expiresAt: number; technicians: CoverageTechnician[] } | null = null;

type DirectoryEntry = { name?: unknown; city?: unknown; uf?: unknown; lat?: unknown; lng?: unknown; vehicle?: unknown };

// O arquivo é `window.TECHNICIAN_DIRECTORY=[...]`, não JSON puro.
function parseDirectory(source: string): CoverageTechnician[] {
  const start = source.indexOf('[');
  const end = source.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  const rows = JSON.parse(source.slice(start, end + 1)) as DirectoryEntry[];
  return rows.flatMap((row) => {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (typeof row.name !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    return [{
      name: row.name,
      city: typeof row.city === 'string' ? row.city : '',
      uf: typeof row.uf === 'string' ? row.uf : '',
      lat,
      lng,
      vehicle: row.vehicle === true,
    }];
  });
}

export async function loadTechnicianDirectory(origin: string): Promise<CoverageTechnician[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.technicians;
  const response = await fetch(new URL('/data/technician-directory.js', origin).toString());
  if (!response.ok) throw new Error(`Diretório de técnicos indisponível (HTTP ${response.status}).`);
  const technicians = parseDirectory(await response.text());
  if (!technicians.length) throw new Error('Diretório de técnicos veio vazio.');
  cache = { expiresAt: Date.now() + CACHE_TTL_MS, technicians };
  return technicians;
}
