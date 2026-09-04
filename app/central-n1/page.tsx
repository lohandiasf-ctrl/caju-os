'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function CentralN1Redirect() {
  useEffect(() => {
    window.location.replace('/?view=central');
  }, []);

  return <main className="grid min-h-screen place-items-center bg-background text-foreground"><div className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="size-5 animate-spin" />Abrindo a fila real da Central N1...</div></main>;
}
