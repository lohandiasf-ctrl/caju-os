// Cobertura de técnicos por cidade: quem está na cidade e quem está perto.
//
// É a mesma conta que a tela do mapa faz. Vive aqui porque agora duas coisas
// precisam dela: a tela e o assistente. Responder "temos técnico em Jaçanã,
// Marizópolis, São José de Mipibu...?" era abrir a busca oito vezes e mandar
// oito prints no WhatsApp.
//
// Parte pura: recebe as coordenadas já resolvidas e devolve o agrupamento.

export type CoverageTechnician = {
  name: string;
  city: string;
  uf: string;
  lat: number;
  lng: number;
  vehicle?: boolean;
};

export type CoveragePlace = { city: string; uf: string; lat: number; lng: number };

export type Ranked = CoverageTechnician & { distanceKm: number };

// O raio que a operação usa para dizer que atende. Mesmo número da tela.
export const COVERAGE_RADIUS_KM = 55;
// Quando não há ninguém no raio, os mais próximos ainda respondem "quem é o
// mais perto que temos?" — que é a pergunta seguinte do cliente.
const FALLBACK_NEAREST = 5;

export function distanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const radians = Math.PI / 180;
  const latitude = (to.lat - from.lat) * radians;
  const longitude = (to.lng - from.lng) * radians;
  const value = Math.sin(latitude / 2) ** 2
    + Math.cos(from.lat * radians) * Math.cos(to.lat * radians) * Math.sin(longitude / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(value));
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export type Coverage = {
  cidade: string;
  naCidade: Ranked[];
  proximos: Ranked[];
  maisProximos: Ranked[];
  total: number;
};

export function coverageFor(
  place: CoveragePlace,
  technicians: CoverageTechnician[],
  radiusKm = COVERAGE_RADIUS_KM,
): Coverage {
  const ranked = technicians
    .filter((technician) => Number.isFinite(technician.lat) && Number.isFinite(technician.lng))
    .map((technician) => ({ ...technician, distanceKm: distanceKm(place, technician) }))
    .sort((left, right) => left.distanceKm - right.distanceKm || left.name.localeCompare(right.name, 'pt-BR'));

  const dentro = ranked.filter((technician) => technician.distanceKm <= radiusKm + 0.0001);
  // "Na cidade" é pelo nome, não pela distância: duas cidades vizinhas podem
  // estar a 3 km, e o cliente pergunta por uma delas.
  const naCidade = dentro.filter((technician) =>
    normalize(technician.city) === normalize(place.city) && technician.uf.toUpperCase() === place.uf.toUpperCase());
  const proximos = dentro.filter((technician) => !naCidade.includes(technician));

  return {
    cidade: `${place.city}/${place.uf}`,
    naCidade,
    proximos,
    maisProximos: dentro.length ? [] : ranked.slice(0, FALLBACK_NEAREST),
    total: dentro.length,
  };
}

// O texto que vai para o cliente. Uma cidade por bloco, com a distância de
// cada um — é o que os prints mostravam, em forma de texto para colar.
export function coverageText(coverage: Coverage, radiusKm = COVERAGE_RADIUS_KM): string {
  const linha = (technician: Ranked) => `  - ${technician.name} (${technician.city}/${technician.uf}, ${technician.distanceKm.toFixed(1)} km${technician.vehicle ? ', com veículo' : ''})`;
  if (!coverage.total) {
    return [
      `${coverage.cidade}: nenhum técnico em até ${radiusKm} km.`,
      ...(coverage.maisProximos.length ? ['  Mais próximos:', ...coverage.maisProximos.map(linha)] : []),
    ].join('\n');
  }
  return [
    `${coverage.cidade}: ${coverage.total} ${coverage.total === 1 ? 'técnico' : 'técnicos'} em até ${radiusKm} km.`,
    ...(coverage.naCidade.length ? [`  Na cidade (${coverage.naCidade.length}):`, ...coverage.naCidade.map(linha)] : ['  Nenhum técnico na própria cidade.']),
    ...(coverage.proximos.length ? [`  Próximos (${coverage.proximos.length}):`, ...coverage.proximos.slice(0, 8).map(linha)] : []),
    ...(coverage.proximos.length > 8 ? [`  e mais ${coverage.proximos.length - 8} no raio.`] : []),
  ].join('\n');
}

// O diretório de técnicos é `window.TECHNICIAN_DIRECTORY=[...]`, não JSON
// puro: o mesmo arquivo serve a tela (como script) e o servidor (embutido no
// bundle). A leitura fica aqui para ser testável.
type DirectoryEntry = { name?: unknown; city?: unknown; uf?: unknown; lat?: unknown; lng?: unknown; vehicle?: unknown };

export function parseDirectory(raw: string): CoverageTechnician[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  let rows: DirectoryEntry[];
  try { rows = JSON.parse(raw.slice(start, end + 1)) as DirectoryEntry[]; }
  catch { return []; }
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
