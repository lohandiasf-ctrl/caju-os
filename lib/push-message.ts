// Notificações push para o app Caju OS no celular (caju-os-mobile), pelo
// serviço de push do Expo, que entrega via FCM (Android) e APNs (iPhone).
// Regras puras, sem imports, para os testes rodarem com strip-types; o envio
// e o banco ficam em lib/server/push.ts.

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** O serviço do Expo aceita até 100 mensagens por requisição. */
export const PUSH_BATCH = 100;

export type PushNote = {
  title: string;
  body: string;
  /** Vai junto para o app abrir a tela certa ao tocar (ex.: { url: '/ticket/FSA-1' }). */
  data?: Record<string, string>;
};

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: 'default';
  priority: 'high' | 'normal';
  channelId: string;
};

export type ExpoTicket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

export function isExpoPushToken(token: unknown): token is string {
  return typeof token === 'string' && /^Expo(nent)?PushToken\[[\w-]+\]$/.test(token.trim());
}

export function chunk<T>(items: T[], size = PUSH_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Texto curto para a notificação: uma linha, sem espaços repetidos. */
export function clip(text: string, max = 180) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

function minutesOf(hhmm: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Está no horário de silêncio da pessoa (communication_preferences)? O
 * intervalo pode virar a noite (20:00 → 07:00). Hora de Brasília.
 */
export function inQuietHours(now: Date, start: string, end: string, timeZone = 'America/Sao_Paulo') {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === null || e === null || s === e) return false;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const t = h * 60 + m;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** Uma mensagem por aparelho. No silêncio: chega na bandeja, mas sem som. */
export function buildMessages(tokens: string[], note: PushNote, quiet: boolean): ExpoMessage[] {
  const title = clip(note.title, 80) || 'Caju OS';
  const body = clip(note.body) || 'Nova atividade no Caju OS';
  return tokens.map((to) => ({
    to, title, body,
    ...(note.data ? { data: note.data } : {}),
    ...(quiet ? {} : { sound: 'default' as const }),
    priority: quiet ? 'normal' : 'high',
    channelId: 'default',
  }));
}

/** Aparelhos que o serviço disse não existirem mais (app desinstalado, token trocado). */
export function deadTokens(messages: ExpoMessage[], tickets: ExpoTicket[]) {
  return tickets.flatMap((ticket, i) => (
    ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' && messages[i] ? [messages[i].to] : []
  ));
}
