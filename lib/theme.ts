// Preferência de tema (claro/escuro) por navegador. O escuro é o padrão: a
// produção nasceu escura e quem nunca escolheu continua vendo o mesmo app.
// Leitura e escrita sempre em try/catch — modo privado, webview do Tauri com
// storage bloqueado ou cota cheia não podem quebrar a tela.

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'caju-theme';
export const DEFAULT_THEME: ThemePreference = 'dark';
const THEME_EVENT = 'caju:theme';

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_THEME;
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/**
 * Script mínimo que roda no <head> antes da hidratação e aplica a classe
 * certa no <html> — sem ele, quem escolheu o claro veria um flash escuro a
 * cada carga. Precisa ser autocontido (vai como texto para o HTML).
 */
export const themeBootScript = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}');var d=p==='light'?false:p==='system'?matchMedia('(prefers-color-scheme: dark)').matches:true;var c=document.documentElement.classList;c.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

function systemPrefersDark() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return true;
  }
}

export function currentResolvedTheme(): ResolvedTheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function applyResolvedTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function subscribeTheme(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

/**
 * Troca e salva o tema. Com View Transitions, o novo tema nasce num círculo
 * que se expande a partir de `origin` (o botão). Sem suporte — ou com
 * movimento reduzido — a troca é direta com um fade curto das superfícies.
 */
export function setThemePreference(preference: ThemePreference, origin?: { x: number; y: number }) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* sem storage a escolha vale só para esta visita */
  }
  const next = resolveTheme(preference, systemPrefersDark());
  const notify = () => window.dispatchEvent(new Event(THEME_EVENT));
  if (next === currentResolvedTheme()) {
    notify();
    return;
  }

  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doc = document as ViewTransitionDocument;
  if (!doc.startViewTransition || reduced || !origin) {
    root.classList.add('theme-fading');
    applyResolvedTheme(next);
    notify();
    window.setTimeout(() => root.classList.remove('theme-fading'), 300);
    return;
  }

  const radius = Math.hypot(
    Math.max(origin.x, window.innerWidth - origin.x),
    Math.max(origin.y, window.innerHeight - origin.y),
  );
  const transition = doc.startViewTransition(() => {
    applyResolvedTheme(next);
    notify();
  });
  void transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${radius}px at ${origin.x}px ${origin.y}px)`] },
        { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => undefined);
}
