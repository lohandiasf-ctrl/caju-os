'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';

// Visualizador de evidência com zoom.
//
// A foto do anexo abria no tamanho da tela e parava aí: dava para ver que o
// PDV está com erro, não para ler o que está escrito nele. Aqui a imagem
// amplia com pinça no celular, roda do mouse no computador, duplo toque, e
// arrasta quando está ampliada.
//
// Os ponteiros são tratados por `pointer events`, que valem para dedo e mouse
// sem dois caminhos separados.

const MIN_SCALE = 1;
const MAX_SCALE = 8;
// Passo dos botões e do duplo toque.
const STEP = 1.6;

type Point = { x: number; y: number };

export function ImageZoom({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  // Distância entre os dois dedos e centro do gesto, para a pinça.
  const pinch = useRef<{ distance: number; center: Point } | null>(null);
  const dragged = useRef(false);
  // Duplo toque é detectado na mão: com `touch-action: none`, o navegador do
  // celular não garante o evento de duplo clique.
  const lastTap = useRef<{ at: number; point: Point } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Imagem nova começa do zero.
  useEffect(() => { reset(); }, [src, reset]);

  // Amplia mantendo sob o cursor (ou entre os dedos) o mesmo ponto da imagem.
  const zoomTo = useCallback((next: number, center?: Point) => {
    const box = frame.current?.getBoundingClientRect();
    setScale((current) => {
      const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
      if (!box || target === current) return target;
      const focus = center ?? { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      const dx = focus.x - box.left - box.width / 2;
      const dy = focus.y - box.top - box.height / 2;
      const ratio = target / current;
      setOffset((position) => target === MIN_SCALE
        ? { x: 0, y: 0 }
        : { x: dx - (dx - position.x) * ratio, y: dy - (dy - position.y) * ratio });
      return target;
    });
  }, []);

  // `passive: false` porque o zoom precisa impedir a rolagem da página.
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY / 320);
      setScale((current) => {
        zoomTo(current * factor, { x: event.clientX, y: event.clientY });
        return current;
      });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [zoomTo]);

  function distanceBetween(a: Point, b: Point) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onPointerDown(event: React.PointerEvent) {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragged.current = false;
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      pinch.current = {
        distance: distanceBetween(first, second),
        center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
      };
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, current);

    if (pointers.current.size === 2 && pinch.current) {
      const [first, second] = [...pointers.current.values()];
      const distance = distanceBetween(first, second);
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      if (pinch.current.distance > 0) {
        setScale((now) => {
          zoomTo(now * (distance / pinch.current!.distance), center);
          return now;
        });
      }
      pinch.current = { distance, center };
      dragged.current = true;
      return;
    }

    // Um dedo só: arrasta, e apenas quando há o que arrastar.
    if (pointers.current.size === 1 && scale > MIN_SCALE) {
      const dx = current.x - previous.x;
      const dy = current.y - previous.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragged.current = true;
      setOffset((position) => ({ x: position.x + dx, y: position.y + dy }));
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    const wasPinching = pointers.current.size === 2;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (wasPinching || dragged.current) { lastTap.current = null; return; }

    const point = { x: event.clientX, y: event.clientY };
    const previous = lastTap.current;
    // Segundo toque perto do primeiro, logo depois: é duplo toque.
    if (previous && Date.now() - previous.at < 320 && distanceBetween(previous.point, point) < 32) {
      lastTap.current = null;
      toggleZoom(point);
      return;
    }
    lastTap.current = { at: Date.now(), point };
  }

  // Alterna entre a tela inteira e um zoom de leitura, no ponto tocado — é
  // como se lê um número de série na foto.
  function toggleZoom(point: Point) {
    if (scale > MIN_SCALE) reset();
    else zoomTo(STEP * 1.8, point);
  }

  const ampliada = scale > MIN_SCALE;

  return (
    // A altura vem de fora: o mesmo componente serve a um diálogo de tela
    // cheia e a um painel menor.
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      <div
        ref={frame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`absolute inset-0 touch-none select-none overflow-hidden ${ampliada ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            // Sem transição durante o gesto, senão a imagem "persegue" o dedo.
            transition: pointers.current.size ? 'none' : 'transform 120ms ease-out',
          }}
          className="absolute inset-0 m-auto max-h-full max-w-full object-contain will-change-transform"
        />
      </div>

      <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card/90 p-1 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() => zoomTo(scale / STEP)}
          disabled={scale <= MIN_SCALE}
          aria-label="Diminuir zoom"
          className="pointer-events-auto grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={!ampliada}
          aria-label="Ajustar à tela"
          className="pointer-events-auto flex h-9 min-w-16 items-center justify-center gap-1 rounded-full px-3 text-xs font-semibold tabular-nums text-muted-foreground transition hover:bg-primary/10 hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Maximize2 className="size-3.5" aria-hidden="true" />{Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={() => zoomTo(scale * STEP)}
          disabled={scale >= MAX_SCALE}
          aria-label="Aumentar zoom"
          className="pointer-events-auto grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
