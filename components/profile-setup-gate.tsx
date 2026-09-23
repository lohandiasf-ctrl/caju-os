'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { usePathname } from 'next/navigation';
import { Camera, Loader2, LogOut } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { signOutAndForget } from '@/lib/firebase';
import { fullNameError, needsProfileSetup, normalizeName, PROFILE_UPDATED_EVENT } from '@/lib/profile';
import { profilePhotoDataUrl } from '@/lib/profile-photo';

type Profile = { email: string; displayName: string | null; photoUrl: string | null };

/**
 * Cadastro obrigatório de nome e foto, uma vez só. Aparece ao abrir o app
 * para quem ainda não tem os dois salvos no servidor; quem já tem nunca vê.
 * Não fecha sem salvar (a única saída é sair da conta). Se o perfil não puder
 * ser lido (rede, 5xx), não bloqueia ninguém — tenta de novo na próxima vez.
 */
export function ProfileSetupGate() {
  const { user, role, loading } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [nameError, setNameError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameId = useId();
  const photoId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const blockedRoute = pathname === '/login' || pathname === '/acesso-negado';
  useEffect(() => {
    if (loading || !user || !role || blockedRoute) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/colleagues', {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
          cache: 'no-store',
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { colleagues?: Profile[] };
        const email = user.email?.toLowerCase();
        const profile = payload.colleagues?.find((item) => item.email.toLowerCase() === email) ?? null;
        if (!active || !needsProfileSetup(profile)) return;
        setName(profile?.displayName ?? '');
        setPhoto(profile?.photoUrl?.startsWith('data:image/') ? profile.photoUrl : null);
        setOpen(true);
      } catch {
        /* sem perfil legível agora: não bloqueia o trabalho */
      }
    })();
    return () => { active = false; };
  }, [blockedRoute, loading, role, user]);

  async function choosePhoto(file?: File) {
    if (!file) return;
    setPhotoError('');
    setProcessing(true);
    try {
      setPhoto(await profilePhotoDataUrl(file));
    } catch (cause) {
      setPhotoError(cause instanceof Error ? cause.message : 'Não foi possível usar esta imagem.');
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = fullNameError(name);
    setNameError(problem ?? '');
    setPhotoError(photo ? '' : 'Escolha uma foto.');
    setError('');
    if (problem || !photo || !user) return;
    setSaving(true);
    try {
      const displayName = normalizeName(name);
      const response = await fetch('/api/colleagues', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, photoUrl: photo }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar. Tente de novo.');
      window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: { displayName, photoUrl: photo } }));
      window.dispatchEvent(new Event('caju-presence-updated'));
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  const initials = normalizeName(name).split(' ').slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
  return (
    // Sem fechar por fora, Esc ou X: o cadastro é obrigatório.
    <Dialog open disablePointerDismissal onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete seu perfil</DialogTitle>
          <DialogDescription>
            Seu nome e sua foto aparecem para a equipe no chat e na lista de colegas. É só desta vez.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void save(event)} className="grid gap-5" noValidate>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border border-dashed border-input bg-muted text-lg font-semibold text-muted-foreground transition-colors hover:border-primary"
              aria-label={photo ? 'Trocar foto' : 'Escolher foto'}
              aria-describedby={photoError ? `${photoId}-error` : undefined}
            >
              {/* Foto local em data URL (antes de salvar): next/image não ajuda aqui. */}
              {/* oxlint-disable-next-line nextjs/no-img-element */}
              {photo ? <img src={photo} alt="Sua foto" className="size-full object-cover" /> : initials}
              {processing && <span className="absolute inset-0 grid place-items-center bg-background/70"><Loader2 aria-hidden="true" className="size-5 animate-spin" /></span>}
            </button>
            <div className="min-w-0">
              <p className="text-sm font-medium">Foto</p>
              <p className="text-xs text-muted-foreground">Uma foto do rosto, para a equipe te reconhecer.</p>
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => fileRef.current?.click()} disabled={processing}>
                <Camera aria-hidden="true" />{photo ? 'Trocar foto' : 'Escolher foto'}
              </Button>
              <input
                ref={fileRef}
                id={photoId}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => void choosePhoto(event.target.files?.[0])}
              />
            </div>
          </div>
          {photoError && <p id={`${photoId}-error`} role="alert" className="-mt-3 text-xs text-danger">{photoError}</p>}
          <div className="grid gap-1.5">
            <label htmlFor={nameId} className="text-sm font-medium">Nome e sobrenome</label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => { setName(event.target.value); if (nameError) setNameError(''); }}
              placeholder="Ex.: Lohan Dias"
              autoComplete="name"
              maxLength={80}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? `${nameId}-error` : undefined}
            />
            {nameError && <p id={`${nameId}-error`} role="alert" className="text-xs text-danger">{nameError}</p>}
          </div>
          {error && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => void signOutAndForget()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground">
              <LogOut aria-hidden="true" className="size-4" />Sair da conta
            </button>
            <Button type="submit" disabled={saving || processing} aria-busy={saving || undefined}>
              {saving && <Loader2 aria-hidden="true" className="animate-spin" />}
              {saving ? 'Salvando…' : 'Salvar e continuar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
