'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

const EVENT = 'caju:login-transition';
type Rect = { top: number; left: number; width: number; height: number };

/**
 * Chamado pelo login depois que o Firebase aceitou a senha: o painel azul se
 * expande até cobrir a tela e segura enquanto o AuthProvider valida o perfil e
 * troca a rota; quando o app aparece, o azul some. A lógica de autenticação
 * não muda — isto é só uma camada por cima.
 */
export function startLoginTransition(rect: Rect | null) {
  window.dispatchEvent(new CustomEvent<Rect | null>(EVENT, { detail: rect }));
}

export function LoginTransitionOverlay() {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [rect, setRect] = useState<Rect | null | undefined>(undefined);
  const [leaving, setLeaving] = useState(false);
  const active = rect !== undefined;

  useEffect(() => {
    const onStart = (event: Event) => {
      setLeaving(false);
      setRect((event as CustomEvent<Rect | null>).detail);
    };
    window.addEventListener(EVENT, onStart);
    return () => window.removeEventListener(EVENT, onStart);
  }, []);

  // Sai quando a rota deixou o /login (app ou acesso negado) — com um teto
  // para nunca prender a tela se algo no caminho demorar.
  useEffect(() => {
    if (!active) return;
    const cap = window.setTimeout(() => setLeaving(true), 3000);
    let settle: number | undefined;
    if (pathname !== '/login') settle = window.setTimeout(() => setLeaving(true), 350);
    return () => { window.clearTimeout(cap); if (settle) window.clearTimeout(settle); };
  }, [active, pathname]);

  const from = rect
    ? `inset(${rect.top}px ${window.innerWidth - rect.left - rect.width}px ${window.innerHeight - rect.top - rect.height}px ${rect.left}px round 28px)`
    : 'inset(0px 0px 0px 0px round 0px)';

  return (
    <AnimatePresence onExitComplete={() => { setRect(undefined); setLeaving(false); }}>
      {active && !leaving && (
        <motion.div
          key="login-transition"
          aria-hidden="true"
          className="login-transition fixed inset-0 z-(--z-window-chrome)"
          initial={reduced ? { opacity: 0 } : { clipPath: from, opacity: 1 }}
          animate={reduced ? { opacity: 1 } : { clipPath: 'inset(0px 0px 0px 0px round 0px)', opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] } }}
          transition={{ duration: reduced ? 0.15 : 0.45, ease: [0.2, 0.8, 0.2, 1] }}
        />
      )}
    </AnimatePresence>
  );
}
