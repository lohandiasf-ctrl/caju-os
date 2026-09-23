// "Atualizar chamado": nota curta sobre um acontecimento do atendimento
// (técnico adoeceu, loja fechada, peça atrasou...) que vai para os comentários
// internos do Jira assinada com nome e sobrenome de quem escreveu — nunca o
// e-mail. Regras puras (sem imports) para os testes rodarem com strip-types.

export const TICKET_UPDATE_MIN = 5;
export const TICKET_UPDATE_MAX = 2000;

export function ticketUpdateError(text: string) {
  const clean = text.trim();
  if (clean.length < TICKET_UPDATE_MIN) return 'Escreva o que aconteceu (pelo menos 5 caracteres).';
  if (clean.length > TICKET_UPDATE_MAX) return `Use até ${TICKET_UPDATE_MAX} caracteres.`;
  return null;
}

/** Nome e sobrenome do perfil, com espaços normalizados; null se incompleto. */
export function authorFullName(displayName: string | null | undefined) {
  const name = (displayName ?? '').trim().replace(/\s+/g, ' ');
  const words = name.split(' ').filter((word) => /\p{L}{2,}/u.test(word));
  return words.length >= 2 ? name : null;
}

/** Texto do comentário interno: a nota e, embaixo, só quem escreveu. */
export function ticketUpdateComment(text: string, authorName: string) {
  return `${text.trim()}\n\n— ${authorName}`;
}
