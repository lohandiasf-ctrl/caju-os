'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { usePathname } from 'next/navigation';
import { KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { needsProfileSetup } from '@/lib/profile';
import { browserStorage, isValidPin, markPinOffered, pinLoginAvailable, readPinDevice, registerPinDevice, savePinDevice, wasPinOffered } from '@/lib/pin-device';

type Profile = { email: string; displayName: string | null; photoUrl: string | null };

/**
 * Oferece o PIN de acesso rápido uma vez por aparelho/conta, depois do login
 * (e depois do ProfileSetupGate, que é obrigatório e vem primeiro). Quem
 * cadastra passa a entrar só com o PIN neste aparelho (login/pin/unlock); quem
 * pula continua na senha e pode cadastrar depois em Configurações.
 */
export function PinSetupOffer() {
  const { user, role, loading } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const blockedRoute = pathname === '/login' || pathname === '/acesso-negado';
  useEffect(() => {
    const email = user?.email;
    if (loading || !email || !role || blockedRoute) return;
    const storage = browserStorage();
    if (readPinDevice(storage, email) || wasPinOffered(storage, email)) return;
    let active = true;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const [response, available] = await Promise.all([
          fetch('/api/colleagues', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }),
          pinLoginAvailable(token),
        ]);
        if (!response.ok || !available) return;
        const payload = (await response.json()) as { colleagues?: Profile[] };
        const profile = payload.colleagues?.find((item) => item.email.toLowerCase() === email.toLowerCase()) ?? null;
        // Só oferece depois que o perfil (nome/foto) já estiver completo, para
        // não empilhar dois diálogos: se ainda faltar, tenta de novo na próxima carga.
        if (active && !needsProfileSetup(profile)) setOpen(true);
      } catch {
        /* sem rede agora: oferece na próxima vez que o app abrir */
      }
    })();
    return () => { active = false; };
  }, [blockedRoute, loading, role, user]);

  function dismiss() {
    if (user?.email) markPinOffered(browserStorage(), user.email);
    setOpen(false);
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!isValidPin(pin)) { setError('Digite 4 números.'); return; }
    if (pin !== confirm) { setError('Os PINs digitados são diferentes.'); return; }
    if (!user?.email) return;
    setSaving(true);
    try {
      const device = await registerPinDevice(await user.getIdToken(), pin);
      savePinDevice(browserStorage(), user.email, device);
      markPinOffered(browserStorage(), user.email);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível cadastrar o PIN.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) dismiss(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound aria-hidden="true" className="size-5 text-primary" />Entrar mais rápido da próxima vez</DialogTitle>
          <DialogDescription>
            Cadastre um PIN de 4 dígitos para reabrir o Caju OS neste aparelho sem digitar a senha. Vale só para este aparelho — em outro, a senha continua sendo pedida.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void register(event)} className="grid gap-3" noValidate>
          <label className="text-xs font-semibold text-muted-foreground" htmlFor="pin-offer-pin">
            PIN (4 números)
            <input id="pin-offer-pin" className="field mt-1.5 h-11 w-full text-center text-lg tracking-[0.5em]" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} autoFocus />
          </label>
          <label className="text-xs font-semibold text-muted-foreground" htmlFor="pin-offer-confirm">
            Confirme o PIN
            <input id="pin-offer-confirm" className="field mt-1.5 h-11 w-full text-center text-lg tracking-[0.5em]" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off" value={confirm} onChange={(event) => setConfirm(event.target.value.replace(/\D/g, '').slice(0, 4))} />
          </label>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
          <div className="mt-1 flex items-center justify-between gap-2">
            <button type="button" onClick={dismiss} disabled={saving} className="min-h-10 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60">Agora não</button>
            <Button type="submit" disabled={saving || pin.length !== 4 || confirm.length !== 4}>{saving && <Loader2 aria-hidden="true" className="animate-spin" />}{saving ? 'Cadastrando…' : 'Cadastrar PIN'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
