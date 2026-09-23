// Perfil mínimo de quem usa o Caju OS: nome e foto, que os colegas veem na
// equipe e no chat. Regras puras (sem imports) para os testes rodarem com
// strip-types; o componente ProfileSetupGate só chama e desenha.

export type ProfileFields = { displayName?: string | null; photoUrl?: string | null };

/** Evento que avisa o app (menu da conta, equipe) que nome/foto mudaram. */
export const PROFILE_UPDATED_EVENT = 'caju-profile-updated';

/**
 * Pede o cadastro só a quem ainda não tem nome OU foto salvos no servidor.
 * Quem já tem os dois nunca vê a tela; depois de salvar, a próxima abertura
 * do app já encontra os dois e não pergunta de novo.
 */
export function needsProfileSetup(profile: ProfileFields | null | undefined) {
  return !profile?.displayName?.trim() || !profile?.photoUrl?.startsWith('data:image/');
}

/** Espaços extras fora; "  lohan   dias " → "lohan dias". */
export function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

/** Nome e sobrenome, como "Lohan Dias". Devolve a mensagem de erro ou null. */
export function fullNameError(value: string) {
  const name = normalizeName(value);
  if (!name) return 'Informe seu nome.';
  if (name.length > 80) return 'Use até 80 caracteres.';
  const words = name.split(' ').filter((word) => /\p{L}{2,}/u.test(word));
  if (words.length < 2) return 'Informe nome e sobrenome, como “Lohan Dias”.';
  return null;
}
