import type { UserRole } from './permissions';

export const DASHBOARD_VIEWS = ['overview', 'tickets', 'central', 'agenda', 'technicians', 'projects', 'feedback', 'settings'] as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

export function isDashboardView(value: string | null): value is DashboardView {
  return DASHBOARD_VIEWS.includes((value ?? '') as DashboardView);
}

export function canUseDashboardView(role: string | null, view: DashboardView) {
  if (role === 'gerencia' || role === 'coordenador') return true;
  if (role === 'n1') return view !== 'projects';
  if (role === 'tecnico') return ['overview', 'agenda', 'technicians', 'feedback', 'settings'].includes(view);
  if (role === 'analista') return !['central', 'projects'].includes(view);
  return view === 'overview' || view === 'feedback';
}

export function canUseNavItem(role: UserRole | null, key: string) {
  if (key === 'spares' || key === 'finance') return role === 'gerencia';
  if (key === 'map') return Boolean(role);
  return isDashboardView(key) && canUseDashboardView(role, key);
}
