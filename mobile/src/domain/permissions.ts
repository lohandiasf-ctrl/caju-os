import type { UserRole } from '../api/types';

/** Mesmas regras de lib/permissions.ts na web — uma fonte, dois clientes. */
const routeRoles: Record<string, UserRole[]> = {
  operacao: ['gerencia', 'coordenador', 'n1', 'analista', 'tecnico'],
  mapa: ['gerencia', 'coordenador', 'n1', 'analista', 'tecnico'],
  'central-n1': ['gerencia', 'coordenador', 'n1'],
  spares: ['gerencia'],
  financeiro: ['gerencia'],
};

export const roleLabels: Record<UserRole, string> = {
  gerencia: 'Gerência',
  coordenador: 'Coordenador',
  n1: 'N1',
  analista: 'Analista',
  tecnico: 'Técnico de campo',
};

export function canAccess(role: UserRole | null, screen: string) {
  if (!role) return false;
  // Gerência é o topo da hierarquia: acessa tudo, sempre.
  if (role === 'gerencia') return true;
  return routeRoles[screen]?.includes(role) ?? false;
}
