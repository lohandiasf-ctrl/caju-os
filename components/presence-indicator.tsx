import { Check, Clock3, Minus } from 'lucide-react';
import { presenceOf } from '@/lib/presence';
import { cn } from '@/lib/utils';

const fill = {
  success: 'bg-success text-background',
  danger: 'bg-danger text-background',
  warning: 'bg-warning text-background',
  muted: 'border-2 border-muted-foreground bg-transparent',
} as const;

const text = {
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  muted: 'text-muted-foreground',
} as const;

/**
 * Selo de disponibilidade: cor + forma (✓ online, − ocupado, relógio ausente,
 * anel vazio offline). Legível para quem não distingue as cores; o texto do
 * status fica ao lado ou no rótulo acessível de quem usa o selo.
 */
export function PresenceDot({ status, size = 'md', className, ring = 'ring-card' }: {
  status: string;
  size?: 'sm' | 'md';
  className?: string;
  /** Cor do contorno que separa o selo do avatar (a superfície de fundo). */
  ring?: string;
}) {
  const meta = presenceOf(status);
  const Icon = meta.glyph === 'check' ? Check : meta.glyph === 'minus' ? Minus : meta.glyph === 'clock' ? Clock3 : null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full ring-2',
        size === 'sm' ? 'size-3' : 'size-3.5',
        fill[meta.tone],
        ring,
        className,
      )}
    >
      {Icon && <Icon className={size === 'sm' ? 'size-2' : 'size-2.5'} strokeWidth={3.5} />}
    </span>
  );
}

/** Status em texto com o selo na frente — para listas e cabeçalhos. */
export function PresenceLabel({ status, className }: { status: string; className?: string }) {
  const meta = presenceOf(status);
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 font-medium', text[meta.tone], className)}>
      <PresenceDot status={status} size="sm" ring="ring-transparent" />
      <span className="truncate">{status}</span>
    </span>
  );
}
