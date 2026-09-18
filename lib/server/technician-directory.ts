// As coordenadas dos ~890 técnicos. Vêm de `public/data/technician-directory.js`,
// o mesmo arquivo que a tela do mapa carrega como script — um dado só, uma
// fonte só.
//
// O conteúdo entra no bundle (`?raw`) em vez de ser buscado pela rede. A
// primeira versão fazia `fetch` na própria origem e isso deu **HTTP 524 em
// produção**: no Cloudflare, o Worker que busca a própria rota volta para si
// mesmo e fica esperando até estourar o tempo.
import source from '../../public/data/technician-directory.js?raw';
import { parseDirectory, type CoverageTechnician } from '@/lib/coverage';

let parsed: CoverageTechnician[] | null = null;

export function technicianDirectory(): CoverageTechnician[] {
  // O trabalho acontece uma vez por isolate; o arquivo não muda em execução.
  parsed ??= parseDirectory(source);
  return parsed;
}
