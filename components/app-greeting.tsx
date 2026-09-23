'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/components/auth-provider';
import { brasiliaHour, firstName, greetingEmoji, greetingForHour } from '@/lib/greeting';
import { getProfileDisplayName, subscribeProfileDisplayName } from '@/lib/profile';

/**
 * "Boa tarde, Lohan ☀️" + uma linha de contexto da tela. O nome é o primeiro
 * nome do perfil (o que a pessoa preencheu); sem perfil ainda, cai no nome da
 * conta/e-mail. O emoji acompanha o período (manhã, tarde, noite).
 */
export function AppGreeting({ context, className = '' }: { context: string; className?: string }) {
  const { user } = useAuth();
  const [hour, setHour] = useState(() => brasiliaHour());
  useEffect(() => {
    const timer = window.setInterval(() => setHour(brasiliaHour()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const profileName = useSyncExternalStore(subscribeProfileDisplayName, getProfileDisplayName, () => '');
  const name = firstName(profileName || user?.displayName, user?.email);
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="truncate text-lg font-semibold leading-tight tracking-[-.01em] xl:text-xl">
        {greetingForHour(hour)}{name ? `, ${name}` : ''} <span aria-hidden="true">{greetingEmoji(hour)}</span>
      </p>
      <p className="truncate text-xs text-muted-foreground">{context}</p>
    </div>
  );
}
