// Unifica as cópias do cadastro de técnicos.
//
//   node --experimental-strip-types scripts/unificar-tecnicos.ts <pasta-de-saida>
//
// Só LÊ produção. Escreve na pasta indicada:
//   - plano.txt     o que vai acontecer, para conferir (nomes e ids, sem CPF)
//   - aplicar.sql   o SQL que executa o plano
//
// A pasta de saída deve ficar FORA do repositório: o SQL carrega telefone,
// PIX e endereço dos técnicos. A execução é um passo separado e manual:
//   npx wrangler d1 execute caju-os-prod --remote --file=<pasta>/aplicar.sql
// e só depois de um backup.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpfValido, planejarUnificacao, type TecnicoDoCadastro } from '../lib/technician-identity.ts';

const saida = process.argv[2];
if (!saida) {
  console.error('Informe a pasta de saída (fora do repositório).');
  process.exit(1);
}

// Tabelas que apontam para technicians.id. Hoje nenhuma aponta para uma cópia,
// mas o SQL repõe as referências mesmo assim: entre o plano e a execução alguém
// pode ter usado uma cópia.
const REFERENCIAS = ['tickets', 'technician_reviews', 'operational_workflows', 'operational_visits', 'fsa_groups'];

// Colunas que a cópia pode ter e a linha mantida não. Nome, cidade, estado e
// e-mail ficam os da linha mantida; o e-mail é único, e a linha mantida é
// justamente a que tem e-mail quando alguma tem.
const COMPLETAVEIS = [
  'technician_external_id', 'technician_code', 'phone', 'pix_key', 'age', 'full_address',
  'source_status', 'onboarding_completed', 'has_vehicle', 'vehicle_type', 'alternative_transport',
  'serves_other_cities', 'extra_cities', 'tools_count', 'available_tools', 'specialties_count', 'specialties',
];

type Linha = Record<string, unknown> & { id: number };

function consultar(sql: string): Linha[] {
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'caju-os-prod', '--remote', '--json', '--command', `"${sql}"`], {
    shell: process.platform === 'win32',
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`wrangler falhou: ${(r.stderr || r.stdout).slice(0, 500)}`);
  const texto = r.stdout;
  return JSON.parse(texto.slice(texto.indexOf('[')))[0].results as Linha[];
}

const literal = (v: unknown) =>
  v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

const linhas = consultar('SELECT * FROM technicians');
const porId = new Map(linhas.map((l) => [l.id, l]));
const tecnicos: TecnicoDoCadastro[] = linhas.map((l) => ({
  id: l.id,
  name: String(l.name),
  cpf: (l.cpf as string | null) ?? null,
  email: (l.email as string | null) ?? null,
  baseCity: String(l.base_city),
  createdAt: String(l.created_at),
}));

const { unificacoes, conflitos } = planejarUnificacao(tecnicos);

const sql: string[] = [
  '-- Unificação do cadastro de técnicos. Gerado por scripts/unificar-tecnicos.ts.',
  '-- Rodar só depois do backup. Referências são repostas antes de apagar as cópias.',
];
const plano: string[] = [];
let camposCompletados = 0;

for (const { manter, remover } of unificacoes) {
  const mantida = porId.get(manter)!;
  const copias = remover.map((id) => porId.get(id)!);
  // A cópia mais recente primeiro: se duas cópias têm um dado, vale a da
  // importação mais nova.
  const recentes = [...copias].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id);

  const set: string[] = [];
  for (const coluna of COMPLETAVEIS) {
    if (!vazio(mantida[coluna])) continue;
    const doador = recentes.find((c) => !vazio(c[coluna]));
    if (doador) set.push(`${coluna} = ${literal(doador[coluna])}`);
  }
  // CPF inválido na linha mantida é trocado pelo válido de uma cópia.
  if (!cpfValido(mantida.cpf as string | null)) {
    const valida = recentes.find((c) => cpfValido(c.cpf as string | null));
    if (valida) set.push(`cpf = ${literal(valida.cpf)}`);
  }
  // Aprovado em qualquer cópia é aprovado.
  if (!mantida.approved && copias.some((c) => c.approved)) set.push('approved = 1');
  // A linha mantida só fica sem e-mail quando o e-mail estava numa cópia marcada
  // "APAGAR". Ele passa para a mantida; como o e-mail é único, sai da cópia antes.
  const antes: string[] = [];
  if (vazio(mantida.email)) {
    const comEmail = recentes.find((c) => !vazio(c.email));
    if (comEmail) {
      antes.push(`UPDATE technicians SET email = NULL WHERE id = ${comEmail.id};`);
      set.push(`email = ${literal(comEmail.email)}`);
    }
  }
  camposCompletados += set.length;

  const ids = remover.join(', ');
  sql.push(`-- ${String(mantida.name)}: mantém ${manter}, remove ${ids}`);
  sql.push(...antes);
  if (set.length) sql.push(`UPDATE technicians SET ${set.join(', ')} WHERE id = ${manter};`);
  for (const tabela of REFERENCIAS) sql.push(`UPDATE ${tabela} SET technician_id = ${manter} WHERE technician_id IN (${ids});`);
  sql.push(`DELETE FROM technicians WHERE id IN (${ids});`);

  plano.push(`${String(mantida.name)} (${String(mantida.base_city)}): mantém ${manter}, remove ${remover.length} [${ids}]${set.length ? `, completa ${set.length} campo(s)` : ''}`);
}

const removidas = unificacoes.reduce((soma, u) => soma + u.remover.length, 0);
const resumo = [
  `Técnicos no cadastro hoje: ${linhas.length}`,
  `Pessoas com cópias: ${unificacoes.length}`,
  `Cópias a remover: ${removidas}`,
  `Técnicos depois: ${linhas.length - removidas}`,
  `Campos completados nas linhas mantidas: ${camposCompletados}`,
  `Casos que NÃO serão unificados (decisão humana): ${conflitos.length}`,
  ...conflitos.map((c) => `  - ${c.motivo}: ${c.ids.map((id) => `${id} ${String(porId.get(id)!.name)} (${String(porId.get(id)!.base_city)})`).join(' | ')}`),
];

mkdirSync(saida, { recursive: true });
writeFileSync(join(saida, 'aplicar.sql'), `${sql.join('\n')}\n`);
writeFileSync(join(saida, 'plano.txt'), `${resumo.join('\n')}\n\nUNIFICAÇÕES\n${plano.join('\n')}\n`);
console.log(resumo.join('\n'));
