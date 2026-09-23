// Perfil mínimo de quem usa o Caju OS: nome e foto, que os colegas veem na
// equipe e no chat. Regras puras (sem imports) para os testes rodarem com
// strip-types; o componente ProfileSetupGate só chama e desenha.

export type ProfileFields = { displayName?: string | null; photoUrl?: string | null };

/** Evento que avisa o app (menu da conta, equipe) que nome/foto mudaram. */
export const PROFILE_UPDATED_EVENT = 'caju-profile-updated';

// Nome de exibição do perfil (o que a pessoa preencheu), para quem não carrega
// o perfil por conta própria — a saudação do topo. O menu da conta, que já lê
// o perfil, é quem alimenta.
const PROFILE_NAME_EVENT = 'caju-profile-name';
let profileDisplayName = '';

export function setProfileDisplayName(name: string | null | undefined) {
  const next = (name ?? '').trim();
  if (next === profileDisplayName) return;
  profileDisplayName = next;
  window.dispatchEvent(new Event(PROFILE_NAME_EVENT));
}

export function getProfileDisplayName() {
  return profileDisplayName;
}

export function subscribeProfileDisplayName(callback: () => void) {
  window.addEventListener(PROFILE_NAME_EVENT, callback);
  return () => window.removeEventListener(PROFILE_NAME_EVENT, callback);
}

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
