// Gera o SQL de carga inicial do catálogo de peças, transcrito da planilha
// enviada pela operação. Preços em centavos para evitar float em dinheiro.
//
//   node scripts/seed-parts.mjs   ->  .wrangler-parts.sql
//   npx wrangler d1 execute caju-os-prod --remote --file=.wrangler-parts.sql

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './cf-config.mjs';

const PARTS = [
  ['Bateria CMOS', 1000],
  ['Cabeça de Impressão ZEBRA PRINTONIX T2N', 150000],
  ['Cabeça de Impressão ZEBRA S4M', 150000],
  ['Cabeça de Impressão ZEBRA ZT230', 150000],
  ['Cabo De Força Bipolar', 3096],
  ['Cabo De Força para Fonte ATX', 3870],
  ['Cabo De Força SATA', 3096],
  ['Cabo De Força Tripolar', 3870],
  ['Cabo HDMI', 4336],
  ['Cabo SATA', 2743],
  ['Cabo Scanner ZEBRA USB', 18000],
  ['Cabo Teclado GTech 625', 18000],
  ['Cabo USB p/Impressora 2mt', 3870],
  ['Cabo VGA', 4730],
  ['Componentes ZEBRA (Rolo Platen, Trava da Cabeça)', 42538],
  ['Conector RJ11', 206],
  ['Conector RJ45', 206],
  ['Fan/Cooler', 2500],
  ['Fonte CPU Interna', 18000],
  ['Fonte CPU Interna MINI', 30000],
  ['Fonte Externa', 18000],
  ['Fonte Interna PICO', 18000],
  ['Memória RAM DDR3 - PC3', 30000],
  ['Memória RAM DDR3L - PC3L', 30000],
  ['Memória RAM DDR4 - PC4', 30000],
  ['Patch Cord 3mt', 3524],
  ['Placa Mãe IPX1800E2', 60000],
  ['Placa Mãe ACC1800N', 60000],
  ['Placa Mãe J1800I-C/BR', 60000],
  ['SSD 120GB', 30000],
  ['SSD 240GB', 30000],
];

const now = new Date().toISOString();
const esc = (v) => String(v).replace(/'/g, "''");
let sql = '-- Catálogo de peças. Gerado por scripts/seed-parts.mjs.\n';
sql += '-- Reexecutar é seguro: atualiza o preço e mantém o id existente.\n\n';
for (const [name, cents] of PARTS) {
  sql += `INSERT INTO parts_catalog (name, sale_price_cents, active, updated_by, updated_at) VALUES ('${esc(name)}', ${cents}, 1, 'carga inicial', '${now}')\n`;
  sql += `  ON CONFLICT(name) DO UPDATE SET sale_price_cents = excluded.sale_price_cents, updated_at = excluded.updated_at;\n`;
}
const out = join(REPO_ROOT, '.wrangler-parts.sql');
writeFileSync(out, sql);
const total = PARTS.reduce((sum, [, c]) => sum + c, 0);
console.log(`Wrote ${out}`);
console.log(`${PARTS.length} peças · soma dos preços R$ ${(total / 100).toFixed(2).replace('.', ',')}`);
