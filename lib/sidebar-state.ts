// Sidebar recolhida (72 px) ou expandida (240 px) no desktop. O estado fica no
// <html data-sidebar> — o CSS usa para a largura da barra e o recuo do
// conteúdo — e é salvo por navegador. O script de boot aplica antes da
// pintura para o conteúdo não "pular" na carga.

export const SIDEBAR_STORAGE_KEY = 'caju-sidebar';
const SIDEBAR_EVENT = 'caju:sidebar';

export const sidebarBootScript = `(function(){try{if(localStorage.getItem('${SIDEBAR_STORAGE_KEY}')==='collapsed')document.documentElement.dataset.sidebar='collapsed';}catch(e){}})();`;

export function isSidebarCollapsed() {
  return document.documentElement.dataset.sidebar === 'collapsed';
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
