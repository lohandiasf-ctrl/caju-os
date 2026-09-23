'use client';

import { useSyncExternalStore, type MouseEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Moon, Sun } from 'lucide-react';
import { currentResolvedTheme, setThemePreference, subscribeTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * Pílula 52×28 com o "thumb" deslizando entre sol e lua. O ícone gira e troca
 * com crossfade; o tema novo se espalha a partir do botão (lib/theme.ts).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, currentResolvedTheme, () => 'dark' as const);
  const dark = theme === 'dark';

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setThemePreference(dark ? 'light' : 'dark', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Tema escuro"
      title={dark ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
      onClick={toggle}
      className={cn(
        // A área de toque tem 44 px; a pílula visível tem 52×28.
        'group relative grid h-11 w-[52px] shrink-0 place-items-center rounded-full active:!scale-100',
        className,
      )}
    >
      <span className="relative block h-7 w-[52px] rounded-full border border-border bg-muted transition-colors group-hover:border-(--field-hover-border)">
        <motion.span
          className="absolute left-[2px] top-[2px] grid size-[22px] place-items-center rounded-full bg-card-elevated text-foreground shadow-[0_1px_3px_rgb(0_0_0/.18),0_4px_10px_-2px_rgb(0_0_0/.18)]"
          initial={false}
          animate={{ x: dark ? 24 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={theme}
              className="grid place-items-center"
              initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
              transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {dark ? <Moon className="size-3.5" strokeWidth={2} aria-hidden="true" /> : <Sun className="size-3.5 text-amber-600" strokeWidth={2} aria-hidden="true" />}
            </motion.span>
          </AnimatePresence>
        </motion.span>
      </span>
    </button>
  );
}
