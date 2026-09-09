export type UserRole = 'gerencia' | 'coordenador' | 'n1' | 'analista' | 'tecnico';

const routeRoles: Record<string, UserRole[]> = {
  '/': ['gerencia', 'coordenador', 'n1', 'analista', 'tecnico'],
  '/mapa': ['gerencia', 'coordenador', 'n1', 'analista', 'tecnico'],
  '/central-n1': ['gerencia', 'coordenador', 'n1'],
  '/spares': ['gerencia'],
  '/financeiro': ['gerencia'],
};

export const roleLabels: Record<UserRole, string> = {
  gerencia: 'Gerência',
  coordenador: 'Coordenador',
  n1: 'N1',
  analista: 'Analista',
  tecnico: 'Técnico de campo',
};

export function isUserRole(value: unknown): value is UserRole {
  return value === 'gerencia' || value === 'coordenador' || value === 'n1' || value === 'analista' || value === 'tecnico';
}

export function canAccess(role: UserRole | null, pathname: string) {
  if (!role) return false;
  // Gerência é o topo da hierarquia: acessa tudo, sempre. Explícito aqui para
  // não depender de estar listada em cada entrada de routeRoles.
  if (role === 'gerencia') return true;
  if (pathname === '/acesso-negado' || pathname === '/login') return true;
  const matchedRoute = Object.keys(routeRoles)
    .sort((a, b) => b.length - a.length)
    .find((route) => route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(`${route}/`));
  return matchedRoute ? routeRoles[matchedRoute].includes(role) : false;
}
