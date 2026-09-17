'use client';

import { useEffect } from 'react';
import { canScrollUp, type ScrollNode } from '@/lib/pull-refresh-guard';

function toScrollChain(target: EventTarget | null): ScrollNode | null {
  let element = target instanceof Element ? target : null;
  let head: ScrollNode | null = null;
  let tail: ScrollNode | null = null;
  while (element) {
    const style = window.getComputedStyle(element);
    const node: ScrollNode = {
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      overflowY: style.overflowY,
      parent: null,
    };
    if (tail) tail.parent = node; else head = node;
    tail = node;
    element = element.parentElement;
  }
  return head;
}

// Barra o pull-to-refresh do navegador sem tocar na rolagem legítima:
// o gesto só é cancelado quando começou sem nada para rolar para cima.
export function PullRefreshGuard() {
  useEffect(() => {
    let startY = 0;
    let armed = false;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        armed = false;
        return;
      }
      startY = event.touches[0].clientY;
      armed = !canScrollUp(toScrollChain(event.target));
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!armed || event.touches.length !== 1 || !event.cancelable) return;
      if (event.touches[0].clientY - startY > 0) event.preventDefault();
    };

    const stop = () => { armed = false; };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', stop, { passive: true });
    document.addEventListener('touchcancel', stop, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', stop);
      document.removeEventListener('touchcancel', stop);
    };
  }, []);

  return null;
}
