'use client';

import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import { animate, motion, useReducedMotion, type Variants } from 'motion/react';
import { ArrowDownRight, ArrowUpRight, RotateCcw, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Entrada em cascata dos cards: a grade orquestra, cada card sobe 12 px e
// chega à escala 1 com mola. `MotionConfig reducedMotion="user"` (raiz) tira
// transform/escala para quem pediu menos movimento — sobra só o fade.
export const bentoItem: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 26 } },
};

export function BentoCard({ className, children, tone = 'default', label }: {
  className?: string;
  children: ReactNode;
  tone?: 'default' | 'hero';
  label?: string;
}) {
  // Wrapper de entrada separado da superfície: o `motion` deixa transform
  // inline no elemento que anima, o que anularia o hover em CSS do card.
  return (
    <motion.section variants={bentoItem} className={cn('min-w-0', className)} aria-label={label}>
      <div className={cn('bento-card h-full', tone === 'hero' ? 'bento-card--hero brand-surface' : '')}>
        <CardBoundary>{children}</CardBoundary>
      </div>
    </motion.section>
  );
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-snug">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('skeleton block rounded-lg', className)} />;
}

export function EmptyCard({ icon: Icon, text, action }: { icon: LucideIcon; text: string; action?: ReactNode }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 px-4 py-6 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-muted text-muted-foreground"><Icon aria-hidden="true" className="size-7" strokeWidth={1.75} /></span>
      <p className="max-w-xs text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}

export function ErrorCard({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex h-full min-h-40 flex-col items-center justify-center gap-3 px-4 py-6 text-center">
      <p className="max-w-xs text-sm text-muted-foreground">{text}</p>
      {onRetry && <button type="button" onClick={onRetry} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-muted px-4 text-sm font-semibold hover:bg-accent"><RotateCcw aria-hidden="true" className="size-4" />Tentar de novo</button>}
    </div>
  );
}

/** O erro de um card nunca derruba os outros. */
class CardBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Card do dashboard falhou', error, info.componentStack); }
  render() {
    if (this.state.failed) return <ErrorCard text="Não foi possível mostrar este card." onRetry={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}

/** Badge de variação: sinal, seta e cor — nunca só a cor. */
export function DeltaBadge({ value, upIsGood = true }: { value: number | null; upIsGood?: boolean }) {
  if (value === null) return null;
  const up = value > 0;
  const flat = value === 0;
  const good = flat ? null : up === upIsGood;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <motion.span
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 24, delay: 0.25 }}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-0.5 rounded-full px-2 text-[11px] font-semibold tabular-nums',
        good === null ? 'bg-muted text-muted-foreground' : good ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
      )}
      title="Variação desde o último dia visto neste navegador"
    >
      {!flat && <motion.span initial={{ y: up ? 2 : -2 }} animate={{ y: 0 }} transition={{ delay: 0.35, duration: 0.3 }} className="grid"><Icon aria-hidden="true" className="size-3" strokeWidth={2.25} /></motion.span>}
      {value > 0 ? '+' : ''}{value}%
      <span className="sr-only">{flat ? ' sem variação' : up ? ' de aumento' : ' de queda'} desde ontem</span>
    </motion.span>
  );
}

/**
 * Número que conta de 0 até o valor na primeira exibição (900 ms) e depois
 * só desliza curto (200 ms) quando o dado atualiza. Movimento reduzido: valor
 * final direto.
 */
export function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = shown.current ?? 0;
    if (reduced || from === value) {
      node.textContent = `${value}${suffix}`;
      shown.current = value;
      return;
    }
    const controls = animate(from, value, {
      duration: shown.current === null ? 0.9 : 0.2,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (latest) => { node.textContent = `${Math.round(latest)}${suffix}`; },
    });
    shown.current = value;
    return () => controls.stop();
  }, [reduced, suffix, value]);
  return <>
    <span ref={ref} className="tabular-nums" aria-hidden="true">{reduced ? value : 0}{suffix}</span>
    <span className="sr-only">{value}{suffix}</span>
  </>;
}
