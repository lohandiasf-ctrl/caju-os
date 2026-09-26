export type TechnicianImportRow = {
  technicianExternalId: string;
  technicianCode: string;
  name: string;
  cpf: string;
  phone: string;
  email: string;
  pixKey: string;
  age: string;
  city: string;
  state: string;
  fullAddress: string;
  sourceStatus: string;
  onboardingCompleted: string;
  approved: boolean;
  hasVehicle: string;
  vehicleType: string;
  alternativeTransport: string;
  servesOtherCities: string;
  extraCities: string;
  toolsCount: string;
  availableTools: string;
  specialtiesCount: string;
  specialties: string;
};

export function normalizeCsvHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function delimiterFor(text: string) {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && (char === '\r' || char === '\n')) break;
    else if (!quoted && char === ',') commas += 1;
    else if (!quoted && char === ';') semicolons += 1;
  }
  return semicolons >= commas ? ';' : ',';
}

/** CSV reader that preserves delimiters and line breaks inside quoted cells. */
export function parseCsvRecords(text: string) {
  const delimiter = delimiterFor(text);
  const records: string[][] = [];
  let record: string[] = [];
  let value = '';
  let quoted = false;

  const finishValue = () => {
    record.push(value.trim());
    value = '';
  };
  const finishRecord = () => {
    finishValue();
    if (record.some(Boolean)) records.push(record);
    record = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) finishValue();
    else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      finishRecord();
    } else value += char;
  }
  if (value || record.length) finishRecord();
  return records;
}

const STATES: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  distritofederal: 'DF', espiritosanto: 'ES', goias: 'GO', maranhao: 'MA', matogrosso: 'MT',
  matogrossodosul: 'MS', minasgerais: 'MG', para: 'PA', paraiba: 'PB', parana: 'PR',
  pernambuco: 'PE', piaui: 'PI', riodejaneiro: 'RJ', riograndedonorte: 'RN',
  riograndedosul: 'RS', rondonia: 'RO', roraima: 'RR', santacatarina: 'SC',
  saopaulo: 'SP', sergipe: 'SE', tocantins: 'TO',
};

export function normalizeBrazilianState(value: string) {
  const clean = normalizeCsvHeader(value);
  return clean.length === 2 ? clean.toUpperCase() : (STATES[clean] ?? '');
}

function first(row: Record<string, string>, ...keys: string[]) {
  for (const key of keys) if (row[key]?.trim()) return row[key].trim();
  return '';
}

function prefixed(row: Record<string, string>, prefix: string) {
  const match = Object.entries(row).find(([key, value]) => key.startsWith(prefix) && value.trim());
  return match?.[1].trim() ?? '';
}

export function parseTechnicianCsv(text: string): TechnicianImportRow[] {
  const [header = [], ...records] = parseCsvRecords(text.replace(/^\uFEFF/, ''));
  const headers = header.map(normalizeCsvHeader);
  return records
    .map((values) => Object.fromEntries(headers.map((key, index) => [key, values[index] ?? ''])))
    .map((row) => {
      const transport = first(row, 'transportealternativo') || prefixed(row, 'qualisseriamsuasmodalidadesdedeslocamento');
      const normalizedTransport = normalizeCsvHeader(transport);
      const ownVehicles = [normalizedTransport.includes('carropropri') ? 'Carro próprio' : '', normalizedTransport.includes('motopropri') ? 'Moto própria' : ''].filter(Boolean);
      const onboarding = first(row, 'onboardingconcluido');
      return {
        technicianExternalId: first(row, 'idtecnico', 'id'),
        technicianCode: first(row, 'codigotec', 'identificador'),
        name: first(row, 'nome', 'nomecompleto', 'tecnico'),
        cpf: first(row, 'cpf'),
        phone: first(row, 'whatsapptelefone', 'whatsapp', 'telefone'),
        email: first(row, 'email'),
        pixKey: first(row, 'chavepix'),
        age: first(row, 'idade'),
        city: first(row, 'cidade'),
        state: normalizeBrazilianState(first(row, 'uf', 'estado')),
        fullAddress: first(row, 'enderecocompleto'),
        sourceStatus: first(row, 'status'),
        onboardingCompleted: onboarding,
        approved: /sim|yes|true|ativo|concluido/i.test(onboarding),
        hasVehicle: first(row, 'possuiveiculo') || (ownVehicles.length ? 'Sim' : ''),
        vehicleType: first(row, 'tipodeveiculo') || ownVehicles.join(';'),
        alternativeTransport: transport,
        servesOtherCities: first(row, 'atendeoutrascidades', 'desloc'),
        extraCities: first(row, 'cidadesatendidasextras', 'raiodeatendimentotecnico'),
        toolsCount: first(row, 'qtdferramentas'),
        availableTools: first(row, 'ferramentasdisponiveis') || prefixed(row, 'quaisferramentais'),
        specialtiesCount: first(row, 'qtdespecialidades'),
        specialties: first(row, 'especialidadesareasdedominio', 'basedeconhecimento'),
      };
    })
    .filter((row) => row.name && row.city && row.state);
}
