"use client";

/**
 * Tela de carregamento da marca. A animação fluida (WebP) troca automaticamente
 * pelo quadro estático quando o usuário pede movimento reduzido no sistema
 * operacional — a regra `prefers-reduced-motion` no globals.css cuida disso.
 * O WebP tem ~398 KB e fica em cache do navegador após a primeira carga.
 */
export function CajuLoading({ label = "Carregando..." }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={`Caju Tech: ${label}`}
      className="grid min-h-screen place-items-center bg-background text-foreground"
    >
      <div className="flex flex-col items-center gap-4">
        <picture className="caju-loading-mark block w-[min(320px,60vw)]">
          <source srcSet="/brand/caju-loading.webp" type="image/webp" />
          <img
            src="/brand/caju-loading.gif"
            alt=""
            width={512}
            height={400}
            className="block h-auto w-full"
          />
        </picture>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
