// Sidebar recolhida (72 px) ou expandida (240 px) no desktop. O estado fica no
// <html data-sidebar> — o CSS usa para a largura da barra e o recuo do
// conteúdo — e é salvo por navegador. O script de boot aplica antes da
// pintura para o conteúdo não "pular" na carga.

export const SIDEBAR_STORAGE_KEY = 'caju-sidebar';
const SIDEBAR_EVENT = 'caju:sidebar';

export const sidebarBootScript = `(function(){try{if(localStorage.getItem('${SIDEBAR_STORAGE_KEY}')==='collapsed')document.documentElement.dataset.sidebar='collapsed';}catch(e){}})();`;

/** Escolha da pessoa (botão do topo ou tecla "["), salva no navegador. */
export function isSidebarCollapsed() {
  return document.documentElement.dataset.sidebar === 'collapsed';
}

// ── Chat ancorado ─────────────────────────────────────────────────────────
// No desktop, uma conversa aberta encosta na barra e a barra vira o trilho de
// ícones enquanto ela estiver aberta (<html data-chat-dock>). Não mexe na
// escolha salva: ao fechar a conversa, a barra volta como estava.
export const CHAT_CLOSE_EVENT = 'caju:chat-close';
/** Pede para a gaveta do celular fechar (ex.: ao abrir uma conversa por ela). */
export const NAV_CLOSE_EVENT = 'caju:nav-close';
const dockOwners = new Set<string>();

export function isChatDocked() {
  return 'chatDock' in document.documentElement.dataset;
}

export function setChatDocked(owner: string, docked: boolean) {
  if (docked) dockOwners.add(owner);
  else dockOwners.delete(owner);
  const root = document.documentElement;
  if (dockOwners.size) root.dataset.chatDock = '';
  else delete root.dataset.chatDock;
  window.dispatchEvent(new Event(SIDEBAR_EVENT));
}

// ── Espaço da equipe na barra ─────────────────────────────────────────────
// A barra (AppNavigation) oferece um elemento; o painel de colegas desenha a
// equipe nele via portal. Um de cada vez: desktop ou gaveta do celular.
const TEAM_SLOT_EVENT = 'caju:team-slot';
let teamSlot: HTMLElement | null = null;

export function setTeamSlot(element: HTMLElement | null) {
  if (teamSlot === element) return;
  teamSlot = element;
  window.dispatchEvent(new Event(TEAM_SLOT_EVENT));
}

export function getTeamSlot() {
  return teamSlot;
}

export function subscribeTeamSlot(callback: () => void) {
  window.addEventListener(TEAM_SLOT_EVENT, callback);
  return () => window.removeEventListener(TEAM_SLOT_EVENT, callback);
}

export function subscribeSidebar(callback: () => void) {
  window.addEventListener(SIDEBAR_EVENT, callback);
  return () => window.removeEventListener(SIDEBAR_EVENT, callback);
}

export function setSidebarCollapsed(collapsed: boolean) {
  const root = document.documentElement;
  if (collapsed) root.dataset.sidebar = 'collapsed';
  else delete root.dataset.sidebar;
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? 'collapsed' : 'expanded');
  } catch {
    /* sem storage vale só nesta visita */
  }
  window.dispatchEvent(new Event(SIDEBAR_EVENT));
}

// ── Grupos recolhíveis do menu (desktop) ──────────────────────────────────
// Em tela baixa o menu inteiro não deixa altura para a equipe; um grupo pouco
// usado (Gestão) pode ficar numa linha só. A escolha da pessoa é salva; sem
// escolha, o grupo abre em telas com 900 px ou mais de altura, ou quando a
// página atual está dentro dele.
const NAV_GROUP_KEY = 'caju-nav-group:';
const navGroupMemory = new Map<string, boolean>();

export function isNavGroupOpen(group: string, containsActive = false) {
  if (navGroupMemory.has(group)) return navGroupMemory.get(group)!;
  try {
    const stored = window.localStorage.getItem(NAV_GROUP_KEY + group);
    if (stored) return stored === 'open';
  } catch {
    /* sem storage: vale o padrão */
  }
  return containsActive || window.innerHeight >= 900;
}

export function setNavGroupOpen(group: string, open: boolean) {
  navGroupMemory.set(group, open);
  try {
    window.localStorage.setItem(NAV_GROUP_KEY + group, open ? 'open' : 'closed');
  } catch {
    /* sem storage vale só nesta visita (memória acima) */
  }
  window.dispatchEvent(new Event(SIDEBAR_EVENT));
}

export function subscribeNavGroups(callback: () => void) {
  window.addEventListener(SIDEBAR_EVENT, callback);
  window.addEventListener('resize', callback);
  return () => {
    window.removeEventListener(SIDEBAR_EVENT, callback);
    window.removeEventListener('resize', callback);
  };
}
