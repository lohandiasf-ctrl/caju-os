// As contas de WhatsApp da operação.
//
// Hoje é uma só: o número Caju, ligado pelo OpenWA. O sistema já guarda de qual
// número vem cada conversa (coluna `account`), então um segundo número
// voltaria a ser só uma linha aqui e as variáveis WHATSAPP_BRIDGE_URL_<CONTA> e
// WHATSAPP_BRIDGE_SECRET_<CONTA>. O antigo "WhatsApp Suporte" (`principal`) foi
// desligado em 2026-09-29; as conversas da API oficial ficam em `despacho`, fora
// desta lista.

export const WHATSAPP_ACCOUNTS = [
  { id: 'caju', label: 'WhatsApp Caju' },
] as const;

export type WhatsappAccountId = (typeof WHATSAPP_ACCOUNTS)[number]['id'];

// A conta usada quando a tela ou a rota não diz qual número é.
export const DEFAULT_ACCOUNT: WhatsappAccountId = 'caju';

export function isWhatsappAccount(value: unknown): value is WhatsappAccountId {
  return WHATSAPP_ACCOUNTS.some((account) => account.id === value);
}

// O que vier do cliente passa por aqui: conta desconhecida vira a principal,
// nunca um erro de tela.
export function toWhatsappAccount(value: unknown): WhatsappAccountId {
  return isWhatsappAccount(value) ? value : DEFAULT_ACCOUNT;
}

export function whatsappAccountLabel(id: WhatsappAccountId): string {
  return WHATSAPP_ACCOUNTS.find((account) => account.id === id)?.label ?? id;
}
