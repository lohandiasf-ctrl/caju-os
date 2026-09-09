"use client";

/**
 * Tela de carregamento da marca. A animação fluida (WebP) troca automaticamente
 * pelo quadro estático quando o usuário pede movimento reduzido no sistema
 * operacional — a regra `prefers-reduced-motion` no globals.css cuida disso.
 * O WebP tem ~398 KB e fica em cache do navegador após a primeira carga.
 */
export function CajuLoading({
  label = "Carregando...",
  fullscreen = true,
  compact = false,
}: {
  label?: string;
  fullscreen?: boolean;
  compact?: boolean;
}) {
  return (
    <output
      aria-label={`Caju Tech: ${label}`}
      className={`${fullscreen ? "min-h-screen bg-background" : "min-h-full"} grid place-items-center text-foreground`}
    >
      <div className={`flex flex-col items-center ${compact ? "gap-2" : "gap-4"}`}>
        <picture className={`caju-loading-mark block ${compact ? "w-24" : "w-[min(320px,60vw)]"}`}>
          <source srcSet="/brand/caju-loading.webp" type="image/webp" />
          <img
            src="/brand/caju-loading.gif"
            alt=""
            width={512}
            height={400}
            className="block h-auto w-full"
          />
        </picture>
        <p className={`${compact ? "text-xs" : "text-sm"} text-muted-foreground`}>{label}</p>
      </div>
    </output>
  );
}
