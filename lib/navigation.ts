import type { UserRole } from './permissions';

export const DASHBOARD_VIEWS = ['overview', 'tickets', 'history', 'central', 'agenda', 'technicians', 'projects', 'whatsapp', 'feedback', 'settings'] as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

export function isDashboardView(value: string | null): value is DashboardView {
  return DASHBOARD_VIEWS.includes((value ?? '') as DashboardView);
}

// WhatsApp is in a closed pilot: only these logins see the tab or reach its
// API, regardless of role. Also enforced server-side (lib/server/whatsapp-bridge.ts).
export const WHATSAPP_PILOT_EMAILS = ['lohandiasf@gmail.com'];

export function canUseWhatsapp(email: string | null | undefined) {
  return Boolean(email && WHATSAPP_PILOT_EMAILS.includes(email.trim().toLowerCase()));
}

export function canUseDashboardView(role: string | null, view: DashboardView, email?: string | null) {
  if (view === 'whatsapp' && !canUseWhatsapp(email)) return false;
  if (role === 'gerencia' || role === 'coordenador') return true;
  if (role === 'n1') return view !== 'projects';
  if (role === 'tecnico') return ['overview', 'history', 'agenda', 'technicians', 'feedback', 'settings'].includes(view);
  if (role === 'analista') return !['central', 'projects'].includes(view);
  return view === 'overview' || view === 'feedback';
}

export function canUseNavItem(role: UserRole | null, key: string, email?: string | null) {
  if (key === 'spares' || key === 'finance') return role === 'gerencia';
  if (key === 'map') return Boolean(role);
  return isDashboardView(key) && canUseDashboardView(role, key, email);
}
