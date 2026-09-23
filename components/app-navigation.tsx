'use client';

import { useEffect, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useMotionValue, animate, type PanInfo } from 'motion/react';
import { Archive, Building2, CalendarClock, CircleDollarSign, ClipboardList, Headphones, LayoutDashboard, Map, MessageCircle, MessageSquarePlus, PackageOpen, PanelLeftClose, Users, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { UserMenu } from '@/components/user-menu';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { canUseNavItem } from '@/lib/navigation';
import { roleLabels } from '@/lib/permissions';
import { CHAT_CLOSE_EVENT, isChatDocked, isSidebarCollapsed, NAV_CLOSE_EVENT, setSidebarCollapsed, setTeamSlot, subscribeSidebar } from '@/lib/sidebar-state';
import { projectMomentum, rubberband } from '@/lib/gesture';

// Matches the drawer's own w-[min(300px,calc(100vw-2rem))] closely enough
// for the rubber-band curve and close threshold; exact px is not load-bearing.
const DRAWER_WIDTH = 300;
// Hysteresis before a touch commits to a drag, so a tap that wobbles a
// couple pixels on a real touchscreen still lands as a tap, not a drag.
const DRAG_THRESHOLD = 10;

/**
 * Lets the mobile nav drawer be swiped closed 1:1 with the finger. The
 * actual open/close state (focus trap, Escape, outside click, unmount) stays
 * entirely owned by Sheet/onOpenChange below — this only tracks a visual x
 * offset and calls onClose once a flick or drag crosses the threshold, the
 * same call a tap on the close button already makes.
 */
function DraggableDrawer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const x = useMotionValue(0);
  function onPan(_: unknown, info: PanInfo) {
    const raw = info.offset.x;
    if (Math.abs(raw) < DRAG_THRESHOLD) { x.set(0); return; }
    const past = raw < 0 ? raw + DRAG_THRESHOLD : raw - DRAG_THRESHOLD;
    // Free 1:1 tracking while closing (drag left); rubber-band resistance
    // past fully open (drag right — there is nothing further to open into).
    x.set(past <= 0 ? past : rubberband(past, DRAWER_WIDTH));
  }
  function onPanEnd(_: unknown, info: PanInfo) {
    const projected = info.offset.x + projectMomentum(info.velocity.x);
    void animate(x, 0, { type: 'spring', bounce: 0, duration: 0.25 });
    if (projected < -DRAWER_WIDTH / 3) onClose();
  }
  return (
    <motion.div className="app-drawer flex h-full flex-col" style={{ x }} onPan={onPan} onPanEnd={onPanEnd}>
      {children}
    </motion.div>
  );
}

// Mesma ordem e mesmas rotas de antes, agora em grupos: o rótulo e o espaço
// entre grupos mostram o que anda junto, sem linhas separadoras.
const groups = [
  ['Operação', [
    ['Visão geral', LayoutDashboard, '/?view=overview', 'overview'],
    ['Chamados', ClipboardList, '/?view=tickets', 'tickets'],
    ['Histórico de chamados', Archive, '/?view=history', 'history'],
    ['Mapa operacional', Map, '/mapa', 'map'],
    ['Agenda', CalendarClock, '/?view=agenda', 'agenda'],
    ['Central N1', Headphones, '/?view=central', 'central'],
  ]],
  ['Comunicação', [
    ['WhatsApp', MessageCircle, '/?view=whatsapp', 'whatsapp'],
  ]],
  ['Gestão', [
    ['Equipe', Users, '/?view=technicians', 'technicians'],
    ['Projetos e lojas', Building2, '/?view=projects', 'projects'],
    ['Spares', PackageOpen, '/spares', 'spares'],
    ['Financeiro', CircleDollarSign, '/financeiro', 'finance'],
    ['Feedback', MessageSquarePlus, '/?view=feedback', 'feedback'],
  ]],
] as const;

function subscribe(callback: () => void) {
  const media = window.matchMedia('(min-width: 1024px)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

// Botão do topo e tecla "[": com uma conversa ancorada, expandir fecha a
// conversa e a barra volta ao estado aberto.
function toggleSidebar() {
  if (isChatDocked()) {
    window.dispatchEvent(new Event(CHAT_CLOSE_EVENT));
    setSidebarCollapsed(false);
    return;
  }
  setSidebarCollapsed(!isSidebarCollapsed());
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * Item de menu. Recolhida, a barra mostra só o ícone e o rótulo vira tooltip.
 * O item ativo ganha a barrinha de 3 px à esquerda, que desliza entre itens
 * (`layoutId`) quando a troca é dentro do dashboard (?view=).
 */
function NavLink({ href, label, icon: Icon, current, collapsed, onNavigate }: {
  href: string;
  label: string;
  icon: LucideIcon;
  current: boolean;
  collapsed: boolean;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const link = <Link href={href} onClick={(event) => onNavigate(event, href)} aria-current={current ? 'page' : undefined} className="app-nav-link" aria-label={collapsed ? label : undefined}>
    {current && <motion.span layoutId="app-nav-indicator" aria-hidden="true" className="app-nav-indicator" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
    <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.75} />
    <span className="app-nav-label">{label}</span>
  </Link>;
  if (!collapsed) return link;
  return <Tooltip>
    <TooltipTrigger render={link} />
    <TooltipContent side="right" sideOffset={10}>{label}</TooltipContent>
  </Tooltip>;
}

export function AppNavigation({ active, open, onOpenChange, onNavigate }: {
  active: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const { role } = useAuth();
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia('(min-width: 1024px)').matches, () => false);
  const storedCollapsed = useSyncExternalStore(subscribeSidebar, isSidebarCollapsed, () => false);
  const chatDocked = useSyncExternalStore(subscribeSidebar, isChatDocked, () => false);
  // A gaveta do celular sempre abre expandida. No desktop, uma conversa
  // aberta recolhe a barra enquanto durar, sem mudar a escolha salva.
  const collapsed = desktop && (storedCollapsed || chatDocked);
  useEffect(() => { if (desktop) onOpenChange(false); }, [desktop, onOpenChange]);
  useEffect(() => {
    const close = () => onOpenChange(false);
    window.addEventListener(NAV_CLOSE_EVENT, close);
    return () => window.removeEventListener(NAV_CLOSE_EVENT, close);
  }, [onOpenChange]);
  // A barra superior ganha vidro só depois de rolar (globals.css).
  useEffect(() => {
    const root = document.documentElement;
    const update = () => { if (window.scrollY > 4) root.dataset.scrolled = ''; else delete root.dataset.scrolled; };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => { window.removeEventListener('scroll', update); delete root.dataset.scrolled; };
  }, []);
  // Atalho "[" recolhe/expande a barra (fora de campos de texto).
  useEffect(() => {
    if (!desktop) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '[' || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      event.preventDefault();
      toggleSidebar();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [desktop]);
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
  // Um botão só para recolher/expandir, no topo. Aberta: logo + nome + botão à
  // direita. Recolhida: só o botão, alinhado com os ícones (os rótulos somem em
  // fade enquanto a largura anima — globals.css).
  const toggle = desktop && <button
    type="button"
    onClick={toggleSidebar}
    className="app-sidebar-toggle"
    aria-expanded={!collapsed}
    aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
    title={collapsed ? 'Expandir menu ([)' : 'Recolher menu ([)'}
  >
    <PanelLeftClose aria-hidden="true" strokeWidth={1.75} className={`size-[18px] transition-transform duration-(--motion-layout) ${collapsed ? 'rotate-180' : ''}`} />
  </button>;
  const content = <>
    <div className="app-sidebar-brand">
      {collapsed ? toggle : <>
        <Image src="/caju-tech-emblem.png" alt="" width={40} height={40} className="size-10 shrink-0 rounded-lg border border-border bg-black object-contain p-1" />
        <div className="app-nav-label min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight">Caju OS</p>
          <p className="truncate text-xs text-muted-foreground">{role ? roleLabels[role] : 'Operações'}</p>
        </div>
        {toggle}
      </>}
    </div>
    {/* O menu fica com a altura natural; só rola em tela muito baixa. O resto
        da altura é da equipe (o painel de colegas desenha nela). */}
    <nav aria-label="Navegação principal" className="mt-5 min-h-0 shrink overflow-y-auto overflow-x-hidden overscroll-contain">
      {groups.map(([title, entries]) => {
        const visible = entries.filter(([, , , key]) => canUseNavItem(role, key));
        if (!visible.length) return null;
        return <div key={title} className="app-nav-group">
          <p className="app-nav-section">{title}</p>
          <div className="space-y-0.5">
            {visible.map(([label, Icon, href, key]) => <NavLink key={key} href={href} label={label} icon={Icon} current={active === key} collapsed={collapsed} onNavigate={navigate} />)}
          </div>
        </div>;
      })}
    </nav>
    <div ref={setTeamSlot} className="app-team-slot" />
    {/* Configurações ficam no menu da conta (clique no próprio nome). */}
    <div className="shrink-0 border-t border-sidebar-border pt-2">
      <UserMenu compact={collapsed} />
    </div>
  </>;
  return <>
    <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
    {desktop ? <aside className="app-sidebar" data-collapsed={collapsed ? '' : undefined}>{content}</aside> : <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" keepMounted className="data-[side=left]:w-[min(300px,calc(100vw-2rem))] gap-0 px-3 py-5">
        <SheetTitle className="sr-only">Menu principal</SheetTitle>
        <SheetDescription className="sr-only">Navegue pelas áreas da operação.</SheetDescription>
        <DraggableDrawer onClose={() => onOpenChange(false)}>{content}</DraggableDrawer>
      </SheetContent>
    </Sheet>}
  </>;
}
