// Saudação da barra superior. Hora de Brasília, que é onde a operação roda —
// não a do dispositivo, que pode estar em outro fuso (Tauri em viagem, VPN).

export function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Emoji do período, nos mesmos cortes da saudação: manhã, tarde, noite. */
export function greetingEmoji(hour: number) {
  if (hour >= 5 && hour < 12) return '🌅';
  if (hour >= 12 && hour < 18) return '☀️';
  return '🌙';
}

export function brasiliaHour(date = new Date()) {
  const hour = new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(date);
  return Number(hour);
}

/** "maria.silva@cajutech.net" → "Maria"; "Ana Paula Souza" → "Ana". */
export function firstName(displayName?: string | null, email?: string | null) {
  const source = displayName?.trim() || email?.split('@')[0] || '';
  const first = source.split(/[\s._-]+/).find(Boolean) ?? '';
  if (!first || /^\d+$/.test(first)) return '';
  return first.charAt(0).toLocaleUpperCase('pt-BR') + first.slice(1).toLocaleLowerCase('pt-BR');
}
