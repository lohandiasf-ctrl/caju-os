'use client';

import { Expand, GripHorizontal, Maximize2, Minus, X } from 'lucide-react';
import type { Window as TauriWindow } from '@tauri-apps/api/window';
import { useEffect, useState } from 'react';

export function DesktopWindowControls() {
  const [desktop, setDesktop] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const isDesktop = '__TAURI_INTERNALS__' in window;
    setDesktop(isDesktop);
    if (!isDesktop) return;
    const onKeyDown = async (event: KeyboardEvent) => {
      if (event.key !== 'F11' && !(event.key === 'Enter' && event.altKey)) return;
      event.preventDefault();
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();
      const next = !await appWindow.isFullscreen();
      await appWindow.setFullscreen(next);
      setFullscreen(next);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!desktop) return null;

  async function withWindow(action: (appWindow: TauriWindow) => Promise<void>) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await action(getCurrentWindow());
  }

  return <div className="group/window-controls fixed right-3 top-2 z-[100] flex h-9 w-10 items-center overflow-hidden rounded-xl border border-white/10 bg-[#111218]/95 text-white shadow-2xl backdrop-blur-xl transition-[width] duration-200 hover:w-[200px] motion-reduce:transition-none">
    <button type="button" aria-label="Mover janela" title="Arraste para mover" className="grid h-full w-10 shrink-0 cursor-move place-items-center text-white/45 hover:bg-white/5" onMouseDown={() => void withWindow((appWindow) => appWindow.startDragging())}><GripHorizontal className="size-4" /></button>
    <button type="button" aria-label="Minimizar" title="Minimizar" className="grid h-full w-10 shrink-0 place-items-center opacity-0 transition-opacity pointer-events-none group-hover/window-controls:pointer-events-auto group-hover/window-controls:opacity-100 hover:bg-white/10" onClick={() => void withWindow((appWindow) => appWindow.minimize())}><Minus className="size-4" /></button>
    <button type="button" aria-label="Maximizar ou restaurar" title="Maximizar ou restaurar" className="grid h-full w-10 shrink-0 place-items-center opacity-0 transition-opacity pointer-events-none group-hover/window-controls:pointer-events-auto group-hover/window-controls:opacity-100 hover:bg-white/10" onClick={() => void withWindow((appWindow) => appWindow.toggleMaximize())}><Maximize2 className="size-3.5" /></button>
    <button type="button" aria-label="Alternar tela cheia" title="Tela cheia (F11)" className={`grid h-full w-10 shrink-0 place-items-center opacity-0 transition-opacity pointer-events-none group-hover/window-controls:pointer-events-auto group-hover/window-controls:opacity-100 hover:bg-white/10 ${fullscreen ? 'bg-primary/20 text-primary' : ''}`} onClick={() => void withWindow(async (appWindow) => { const next = !await appWindow.isFullscreen(); await appWindow.setFullscreen(next); setFullscreen(next); })}><Expand className="size-3.5" /></button>
    <button type="button" aria-label="Fechar" title="Fechar" className="grid h-full w-10 shrink-0 place-items-center opacity-0 transition-opacity pointer-events-none group-hover/window-controls:pointer-events-auto group-hover/window-controls:opacity-100 hover:bg-red-500 hover:text-white" onClick={() => void withWindow((appWindow) => appWindow.close())}><X className="size-4" /></button>
  </div>;
}
