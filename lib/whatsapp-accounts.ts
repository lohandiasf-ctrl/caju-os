// As contas de WhatsApp da operação.
//
// O sistema nasceu com um número só: as conversas nem guardavam de qual
// número vieram. Com um segundo número ("Whatsapp Caju"), cada conversa
// precisa saber a quem pertence — senão a resposta sai pelo número errado, e
// quem está do outro lado recebe de um desconhecido.
//
// `principal` é o número que já existe. O nome vem daqui para a tela e para o
// banco não dependerem de texto solto.

export const WHATSAPP_ACCOUNTS = [
  { id: 'principal', label: 'WhatsApp Suporte' },
  { id: 'caju', label: 'WhatsApp Caju' },
] as const;

export type WhatsappAccountId = (typeof WHATSAPP_ACCOUNTS)[number]['id'];

// A conta de tudo que existia antes de haver duas. As linhas antigas do banco
// ficam com ela na migration, então nada muda de dono.
export const DEFAULT_ACCOUNT: WhatsappAccountId = 'principal';

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
