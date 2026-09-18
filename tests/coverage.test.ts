import test from 'node:test';
import assert from 'node:assert/strict';
import { COVERAGE_RADIUS_KM, coverageFor, coverageText, distanceKm, type CoverageTechnician } from '../lib/coverage.ts';

// Coordenadas reais, para a distância ser conferível fora do teste.
const JACANA = { city: 'Jaçanã', uf: 'RN', lat: -6.4147, lng: -35.9967 };
const JARDIM_SERIDO = { city: 'Jardim do Seridó', uf: 'RN', lat: -6.5836, lng: -36.7736 };

function tech(partial: Partial<CoverageTechnician> = {}): CoverageTechnician {
  return { name: 'Técnico', city: 'Jaçanã', uf: 'RN', lat: JACANA.lat, lng: JACANA.lng, ...partial };
}

test('a distância entre duas cidades bate com a real', () => {
  // Jaçanã–Jardim do Seridó são ~90 km em linha reta.
  const km = distanceKm(JACANA, JARDIM_SERIDO);
  assert.ok(km > 80 && km < 100, `deu ${km.toFixed(1)} km`);
  assert.equal(Math.round(distanceKm(JACANA, JACANA)), 0);
});

test('quem está na cidade não se mistura com quem está perto', () => {
  const coverage = coverageFor(JACANA, [
    tech({ name: 'Ana', city: 'Jaçanã', uf: 'RN' }),
    // ~20 km: dentro do raio, mas de outra cidade.
    tech({ name: 'Bruno', city: 'Japi', uf: 'RN', lat: -6.4667, lng: -35.9333 }),
  ]);
  assert.deepEqual(coverage.naCidade.map((item) => item.name), ['Ana']);
  assert.deepEqual(coverage.proximos.map((item) => item.name), ['Bruno']);
  assert.equal(coverage.total, 2);
});

// Cidade vizinha pode estar a poucos quilômetros; o cliente perguntou por uma
// delas, e a resposta precisa distinguir.
test('mesmo nome em outro estado não conta como "na cidade"', () => {
  const coverage = coverageFor(JACANA, [tech({ name: 'Carla', city: 'Jaçanã', uf: 'SP' })]);
  assert.equal(coverage.naCidade.length, 0);
  assert.equal(coverage.proximos.length, 1);
});

test('fora do raio não entra, e o raio é configurável', () => {
  const longe = [tech({ name: 'Dan', city: 'Jardim do Seridó', uf: 'RN', lat: JARDIM_SERIDO.lat, lng: JARDIM_SERIDO.lng })];
  assert.equal(coverageFor(JACANA, longe).total, 0, 'a ~90 km fica fora dos 55');
  assert.equal(coverageFor(JACANA, longe, 120).total, 1, 'com raio maior, entra');
});

// Sem ninguém no raio, "quem é o mais perto?" é a pergunta seguinte do cliente.
test('sem cobertura, sobram os mais próximos', () => {
  const coverage = coverageFor(JACANA, [
    tech({ name: 'Dan', lat: JARDIM_SERIDO.lat, lng: JARDIM_SERIDO.lng, city: 'Jardim do Seridó' }),
  ]);
  assert.equal(coverage.total, 0);
  assert.equal(coverage.maisProximos.length, 1);
  assert.match(coverageText(coverage), /nenhum técnico em até 55 km/i);
  assert.match(coverageText(coverage), /Mais próximos:/);
});

test('coordenada quebrada não derruba a conta', () => {
  const coverage = coverageFor(JACANA, [
    tech({ name: 'Ok' }),
    { name: 'Sem coordenada', city: 'X', uf: 'RN', lat: Number.NaN, lng: Number.NaN },
  ]);
  assert.equal(coverage.total, 1);
});

test('o texto sai pronto para colar, com distância e veículo', () => {
  const coverage = coverageFor(JACANA, [
    tech({ name: 'Ana', vehicle: true }),
    tech({ name: 'Bruno', city: 'Japi', uf: 'RN', lat: -6.4667, lng: -35.9333 }),
  ]);
  const text = coverageText(coverage);
  assert.match(text, /^Jaçanã\/RN: 2 técnicos em até 55 km\./m);
  assert.match(text, /Na cidade \(1\):/);
  assert.match(text, /- Ana \(Jaçanã\/RN, 0\.0 km, com veículo\)/);
  assert.match(text, /Próximos \(1\):/);
  assert.match(text, /- Bruno \(Japi\/RN, \d+\.\d km\)/);
});

test('lista longa é cortada, com a conta do que sobrou', () => {
  const muitos = Array.from({ length: 12 }, (_, index) => tech({ name: `T${index}`, city: 'Japi', uf: 'RN', lat: -6.4667, lng: -35.9333 }));
  const text = coverageText(coverageFor(JACANA, muitos));
  assert.match(text, /Próximos \(12\):/);
  assert.match(text, /e mais 4 no raio/);
});

test('o raio da operação é o mesmo da tela', () => {
  assert.equal(COVERAGE_RADIUS_KM, 55);
});
