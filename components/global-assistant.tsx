'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { FloatingAssistant } from '@/components/assistant-panel';
import { canUseWhatsapp } from '@/lib/navigation';

export function GlobalAssistant() {
  const { user, role } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (!user || pathname === '/login' || pathname === '/acesso-negado') {
    return null;
  }

  function handleOpenTicket(ticketKey: string) {
    if (pathname === '/') {
      window.dispatchEvent(new CustomEvent('caju:open-ticket', { detail: ticketKey }));
    } else {
      router.push(`/?view=tickets&ticket=${encodeURIComponent(ticketKey)}`);
    }
  }

  function handlePrepareSchedule(ticketKeys: string[], at: string) {
    if (pathname === '/') {
      window.dispatchEvent(
        new CustomEvent('caju:prepare-schedule', { detail: { ticketKeys, at } }),
      );
    } else {
      router.push(
        `/?view=tickets&schedule_at=${encodeURIComponent(at)}&schedule_keys=${encodeURIComponent(ticketKeys.join(','))}`,
      );
    }
  }

  function handlePrepareMessage(draft: { contato: string; nome: string; texto: string }) {
    if (pathname === '/') {
      window.dispatchEvent(new CustomEvent('caju:prepare-whatsapp', { detail: draft }));
    } else {
      router.push(`/?view=whatsapp`);
    }
  }

  return (
    <FloatingAssistant
      user={user}
      onOpenTicket={handleOpenTicket}
      onPrepareSchedule={handlePrepareSchedule}
      onPrepareMessage={canUseWhatsapp(role) ? handlePrepareMessage : undefined}
    />
  );
}
