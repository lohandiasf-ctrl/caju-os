'use client';

import { useEffect, useRef } from 'react';
import { motion, useAnimationControls } from 'motion/react';
import { Bell } from 'lucide-react';

/**
 * Sino da barra superior. Ponto vermelho de 6 px quando há não lidas; quando
 * o total sobe, o sino balança ±12° duas vezes e o ponto pulsa uma vez.
 */
export function NotificationBell({ count, expanded, onClick }: { count: number; expanded: boolean; onClick: () => void }) {
  const bell = useAnimationControls();
  const dot = useAnimationControls();
  const previous = useRef(count);
  useEffect(() => {
    if (count > previous.current) {
      void bell.start({ rotate: [0, -12, 12, -12, 12, 0], transition: { duration: 0.6, ease: 'easeInOut' } });
      void dot.start({ scale: [1, 1.8, 1], opacity: [1, 0.7, 1], transition: { duration: 0.6 } });
    }
    previous.current = count;
  }, [bell, count, dot]);
  return (
    <button
      type="button"
      aria-label={count ? `Notificações (${count} não lidas)` : 'Notificações'}
      aria-expanded={expanded}
      onClick={onClick}
      className="relative grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground max-sm:size-11"
    >
      <motion.span animate={bell} className="grid origin-top place-items-center">
        <Bell className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </motion.span>
      {count > 0 && (
        <motion.span
          animate={dot}
          aria-hidden="true"
          className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-danger ring-2 ring-background"
        />
      )}
    </button>
  );
}
