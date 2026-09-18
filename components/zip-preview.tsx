'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, FileArchive, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { ImageZoom } from '@/components/image-zoom';
import { extractZipEntry, isViewableInZip, readZipEntries, zipEntryLabel, zipEntryMime, type ZipEntry } from '@/lib/zip';

// Conteúdo de um .zip anexado ao chamado.
//
// O laudo do técnico chega assim, com as fotos dentro, e a visualização dizia
// só "este arquivo não possui visualização" — para conferir a evidência era
// preciso baixar, extrair e abrir fora do sistema.

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function ZipPreview({ buffer, filename, onDownloadAll }: {
  buffer: ArrayBuffer;
  filename: string;
  onDownloadAll: () => void;
}) {
  const entries = useMemo(() => readZipEntries(buffer), [buffer]);
  const [open, setOpen] = useState<{ entry: ZipEntry; url: string; mime: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Cada arquivo aberto vira um endereço temporário; sem soltar, a memória
  // fica presa enquanto a aba viver.
  useEffect(() => () => { if (open) URL.revokeObjectURL(open.url); }, [open]);

  async function show(entry: ZipEntry) {
    setLoading(entry.name);
    setError('');
    try {
      const bytes = await extractZipEntry(buffer, entry);
      const mime = zipEntryMime(entry.name);
      // `slice()` porque o Blob precisa de um buffer próprio, não de uma
      // janela sobre o ZIP inteiro.
      const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mime }));
      if (open) URL.revokeObjectURL(open.url);
      setOpen({ entry, url, mime });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir este arquivo.');
    } finally {
      setLoading(null);
    }
  }

  function close() {
    if (open) URL.revokeObjectURL(open.url);
    setOpen(null);
  }

  if (open) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <div className="mb-2 flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={close}><ArrowLeft /> Voltar ao conteúdo</Button>
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{zipEntryLabel(open.entry.name)}</p>
          <a
            href={open.url}
            download={zipEntryLabel(open.entry.name)}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          ><Download /> Baixar</a>
        </div>
        {open.mime.startsWith('image/') ? <ImageZoom src={open.url} alt={zipEntryLabel(open.entry.name)} className="min-h-0 flex-1" />
          : open.mime.startsWith('video/') ? <video src={open.url} controls className="max-h-full min-h-0 flex-1" />
          : <iframe src={open.url} title={zipEntryLabel(open.entry.name)} className="min-h-0 flex-1 rounded-lg bg-white" />}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="mb-2 flex items-center gap-2">
        <FileArchive className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {entries.length ? `${entries.length} ${entries.length === 1 ? 'arquivo' : 'arquivos'} em ${filename}` : filename}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onDownloadAll}><Download /> Baixar o ZIP</Button>
      </div>

      {error && <p role="alert" className="mb-2 rounded-lg border border-red-400/25 bg-red-400/10 p-2 text-xs text-red-200">{error}</p>}

      {!entries.length ? (
        <div className="grid flex-1 place-items-center text-center">
          <div>
            <FileArchive className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm">Não foi possível ler o conteúdo deste arquivo.</p>
            <Button type="button" className="mt-4" onClick={onDownloadAll}><Download /> Baixar o ZIP</Button>
          </div>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {entries.map((entry) => {
            const viewable = isViewableInZip(entry.name);
            const image = zipEntryMime(entry.name).startsWith('image/');
            return (
              <li key={entry.name}>
                <button
                  type="button"
                  onClick={() => viewable && void show(entry)}
                  disabled={!viewable || loading === entry.name}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-background/60 px-3 py-2 text-left transition enabled:hover:border-primary/40 enabled:hover:bg-primary/8 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {loading === entry.name ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
                    : image ? <ImageIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    : <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{zipEntryLabel(entry.name)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatBytes(entry.size)}{viewable ? '' : ' · sem visualização no navegador'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
