import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MetricItem = {
  label: string;
  value: ReactNode;
  /** Contexto do número (o que significa, de onde vem, comparação real). */
  note?: ReactNode;
  icon?: LucideIcon;
  /** Cor só quando o valor pede atenção; o padrão é neutro. */
  tone?: 'default' | 'warning' | 'danger' | 'success';
};

const toneClass = {
  default: '',
  warning: 'text-warning',
  danger: 'text-danger',
  success: 'text-success',
} as const;

/**
 * Faixa de métricas: um único painel dividido em células, em vez de vários
 * cards iguais com o mesmo peso. Com `primary` (padrão), a primeira métrica é
 * a principal — número maior e mais espaço; as demais são secundárias.
 * Layout e divisórias ficam em `.metric-strip` (globals.css).
 */
export function MetricStrip({ items, primary = true, loading = false, className, label }: {
  items: MetricItem[];
  primary?: boolean;
  loading?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      aria-busy={loading || undefined}
      data-primary={primary ? 'true' : 'false'}
      className={cn('metric-strip', className)}
      style={{ ['--metric-rest' as string]: Math.max(1, items.length - 1), ['--metric-count' as string]: items.length }}
    >
      {items.map((item, index) => {
        const main = primary && index === 0;
        const Icon = item.icon;
        return (
          <div key={item.label} className="flex min-w-0 flex-col">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />}
              <span className="truncate">{item.label}</span>
            </p>
            {loading ? (
              <span aria-hidden="true" className={cn('skeleton mt-2 block rounded-md', main ? 'h-8 w-32' : 'h-6 w-16')} />
            ) : (
              <p className={cn('mt-1 truncate font-semibold tabular-nums tracking-[-.02em]', main ? 'text-metric' : 'text-xl', toneClass[item.tone ?? 'default'])}>
                {item.value}
              </p>
            )}
            {item.note && !loading && <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}
          </div>
        );
      })}
    </section>
  );
}
