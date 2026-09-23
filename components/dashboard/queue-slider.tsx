'use client';

import { useId } from 'react';
import { Slider as SliderPrimitive } from '@base-ui/react/slider';

/**
 * Slider das Ações rápidas: trilho fino, preenchimento azul e thumb quadrado
 * arredondado de 20 px. Teclado (setas, Home/End) vem do Base UI; o valor
 * lido pelo leitor de tela é o texto (`valueText`), não o número cru.
 */
export function QueueSlider({ label, value, min, max, valueText, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  valueText: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="py-1.5">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span id={id} className="font-medium">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-primary">{valueText}</span>
      </div>
      <SliderPrimitive.Root
        value={value}
        min={min}
        max={max}
        step={1}
        thumbAlignment="edge"
        onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
        className="w-full"
      >
        <SliderPrimitive.Control className="relative flex h-6 w-full touch-none items-center select-none max-sm:h-11">
          <SliderPrimitive.Track className="relative h-1.5 w-full grow rounded-full bg-chart-track">
            <SliderPrimitive.Indicator className="rounded-full bg-primary" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-labelledby={id}
            getAriaValueText={() => valueText}
            className="block size-5 rounded-md bg-brand shadow-[0_2px_6px_-1px_color-mix(in_oklab,var(--brand)_55%,transparent)] ring-offset-2 ring-offset-card transition-transform after:absolute after:-inset-3 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
          />
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
    </div>
  );
}
