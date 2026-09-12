/**
 * Paleta do Caju OS. Os valores vêm do tema da web (app/globals.css) para que
 * o app nativo e o navegador não pareçam dois produtos diferentes.
 */
export const theme = {
  color: {
    background: '#0B0B0F',
    surface: '#14141B',
    surfaceRaised: '#1C1C26',
    border: '#2A2A38',
    text: '#F5F5F7',
    textMuted: '#9B9BA8',
    accent: '#F07A3F',
    accentSoft: 'rgba(240,122,63,0.14)',
    success: '#5FDBB8',
    warning: '#F5C451',
    danger: '#FF6B6B',
    info: '#6FA8FF',
  },
  radius: { sm: 8, md: 12, lg: 18, xl: 24 },
  space: (n: number) => n * 4,
  font: {
    size: { xs: 11, sm: 13, md: 15, lg: 18, xl: 22, xxl: 28 },
  },
} as const;

/** Cor de cada etapa do fluxo operacional, igual à web. */
export function statusColor(statusCategory: string): string {
  switch (statusCategory) {
    case 'done':
      return theme.color.success;
    case 'indeterminate':
      return theme.color.info;
    default:
      return theme.color.warning;
  }
}

export function priorityColor(priority: string): string {
  const value = priority.toLowerCase();
  if (value.includes('highest') || value.includes('crít')) return theme.color.danger;
  if (value.includes('high') || value.includes('alta')) return theme.color.accent;
  if (value.includes('low') || value.includes('baixa')) return theme.color.textMuted;
  return theme.color.info;
}
