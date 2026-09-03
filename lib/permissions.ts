export type UserRole = 'gerencia' | 'n1' | 'analista';

const routeRoles: Record<string, UserRole[]> = {
  '/': ['gerencia', 'n1', 'analista'],
  '/mapa': ['gerencia', 'n1', 'analista'],
  '/central-n1': ['gerencia', 'n1'],
  '/spares': ['gerencia'],
  '/financeiro': ['gerencia'],
};

export const roleLabels: Record<UserRole, string> = {
  gerencia: 'Gerência',
  n1: 'N1',
  analista: 'Analista',
};

export function isUserRole(value: unknown): value is UserRole {
  return value === 'gerencia' || value === 'n1' || value === 'analista';
}

export function canAccess(role: UserRole | null, pathname: string) {
  if (!role) return false;
  if (pathname === '/acesso-negado' || pathname === '/login') return true;
  const matchedRoute = Object.keys(routeRoles)
    .sort((a, b) => b.length - a.length)
    .find((route) => route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(`${route}/`));
  return matchedRoute ? routeRoles[matchedRoute].includes(role) : role === 'gerencia';
}
