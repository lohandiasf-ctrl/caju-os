import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-xl">
        <p className="text-sm font-semibold tracking-widest text-primary">CAJU OS · 404</p>
        <h1 className="mt-4 text-2xl font-bold">Página não encontrada</h1>
        <p className="mt-3 text-sm text-muted-foreground">O endereço pode ter mudado ou você pode não ter acesso a esta página.</p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground transition hover:opacity-90">Voltar ao início</Link>
      </div>
    </main>
  );
}
