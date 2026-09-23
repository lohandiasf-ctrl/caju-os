'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { brasiliaHour, firstName, greetingForHour } from '@/lib/greeting';

/** "Boa tarde, Maria 👋" + uma linha de contexto da tela. */
export function AppGreeting({ context, className = '' }: { context: string; className?: string }) {
  const { user } = useAuth();
  const [hour, setHour] = useState(() => brasiliaHour());
  useEffect(() => {
    const timer = window.setInterval(() => setHour(brasiliaHour()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const name = firstName(user?.displayName, user?.email);
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="truncate text-lg font-semibold leading-tight tracking-[-.01em] xl:text-xl">
        {greetingForHour(hour)}{name ? `, ${name}` : ''} <span aria-hidden="true">👋</span>
      </p>
      <p className="truncate text-xs text-muted-foreground">{context}</p>
    </div>
  );
}
