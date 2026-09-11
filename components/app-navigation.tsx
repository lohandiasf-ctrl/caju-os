'use client';

import { useEffect, useSyncExternalStore, type MouseEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Building2, CalendarClock, CircleDollarSign, ClipboardList, Headphones, LayoutDashboard, Map, MessageSquarePlus, PackageOpen, Settings, Users } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { UserMenu } from '@/components/user-menu';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { canUseNavItem } from '@/lib/navigation';

const items = [
  ['Visão geral', LayoutDashboard, '/?view=overview', 'overview'],
  ['Chamados', ClipboardList, '/?view=tickets', 'tickets'],
  ['Mapa operacional', Map, '/mapa', 'map'],
  ['Agenda', CalendarClock, '/?view=agenda', 'agenda'],
  ['Central N1', Headphones, '/?view=central', 'central'],
  ['Equipe', Users, '/?view=technicians', 'technicians'],
  ['Projetos e lojas', Building2, '/?view=projects', 'projects'],
  ['Spares', PackageOpen, '/spares', 'spares'],
  ['Financeiro', CircleDollarSign, '/financeiro', 'finance'],
  ['Feedback', MessageSquarePlus, '/?view=feedback', 'feedback'],
] as const;

function subscribe(callback: () => void) {
  const media = window.matchMedia('(min-width: 1024px)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

export function AppNavigation({ active, open, onOpenChange, onNavigate }: {
  active: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const { role } = useAuth();
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia('(min-width: 1024px)').matches, () => false);
  useEffect(() => { if (desktop) onOpenChange(false); }, [desktop, onOpenChange]);
  function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    onNavigate?.(event, href);
    const primaryNavigation = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (!primaryNavigation) return;

    onOpenChange(false);

    // The dashboard intercepts its own ?view= links so it can switch sections
    // without reloading. Standalone routes must perform a document navigation:
    // vinext's client router can leave these links on the current screen even
    // though the URL target is valid, especially inside the desktop webview.
    if (!event.defaultPrevented) {
      event.preventDefault();
      window.location.assign(href);
    }
  }
  const content = <>
    <div className="flex shrink-0 items-center gap-3 border-b border-sidebar-border px-2 pb-5">
      <Image src="/caju-tech-emblem.png" alt="" width={40} height={40} className="size-10 rounded-xl border border-primary/25 bg-black object-contain p-1" />
      <div><p className="text-base font-bold tracking-tight">Caju OS</p><p className="mt-0.5 text-xs text-muted-foreground">Central de operações</p></div>
    </div>
    <nav aria-label="Navegação principal" className="mt-5 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-1">
      <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Operação</p>
      {items.filter(([, , , key]) => canUseNavItem(role, key)).map(([label, Icon, href, key]) => <Link key={key} href={href} onClick={(event) => navigate(event, href)} aria-current={active === key ? 'page' : undefined} className="app-nav-link"><Icon aria-hidden="true" className="size-[18px] shrink-0" /><span>{label}</span></Link>)}
    </nav>
    <div className="mt-3 shrink-0 border-t border-sidebar-border pt-3">
      <Link href="/?view=settings" onClick={(event) => navigate(event, '/?view=settings')} aria-current={active === 'settings' ? 'page' : undefined} className="app-nav-link"><Settings aria-hidden="true" className="size-[18px]" />Configurações</Link>
      <UserMenu />
    </div>
  </>;
  return <>
    <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
    {desktop ? <aside className="caju-sidebar app-sidebar">{content}</aside> : <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" keepMounted className="data-[side=left]:w-[min(300px,calc(100vw-2rem))] gap-0 px-3 py-5">
        <SheetTitle className="sr-only">Menu principal</SheetTitle>
        <SheetDescription className="sr-only">Navegue pelas áreas da operação.</SheetDescription>
        {content}
      </SheetContent>
    </Sheet>}
  </>;
}
