"use client";
import "leaflet/dist/leaflet.css";
import type * as L from "leaflet";
import { AppNavigation } from "@/components/app-navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Car,
  LayoutDashboard,
  Map,
  MapPin,
  Menu,
  Mail,
  MessageCircle,
  Phone,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { auth } from "@/lib/firebase";
declare global {
  interface Window {
    TECHNICIAN_DIRECTORY?: Technician[];
  }
}
type C = {
  city: string;
  uf: string;
  address: string;
  lat: number;
  lng: number;
  technicians: number;
  onboarded: number;
  vehicles: number;
  avgTools: number;
  avgSpecialties: number;
};
type ApiTechnician = {
  id: number; name: string; phone: string | null; email: string | null;
  city: string | null; state: string | null; status: string | null;
  hasVehicle: string | null; vehicleType: string | null;
  specialties: string | null; availableTools: string | null;
  technicianCode: string | null; reviewAvg?: number | null; reviewCount?: number | null;
};
type Technician = {
  name: string;
  city: string;
  uf: string;
  lat: number;
  lng: number;
  onboarded: boolean;
  vehicle: boolean;
};
export default function Page() {
  const el = useRef<HTMLDivElement>(null),
    gm = useRef<L.Map | null>(null),
    marks = useRef<L.Marker[]>([]),
    originMark = useRef<L.Marker | null>(null);
  const [data, setData] = useState<C[]>([]),
    [q, setQ] = useState(""),
    [uf, setUf] = useState("Todos"),
    [sel, setSel] = useState<C | null>(null),
    [directory, setDirectory] = useState<Technician[]>([]),
    [ready, setReady] = useState(false),
    [menu, setMenu] = useState(false),
    [error, setError] = useState(""),
    [geo, setGeo] = useState<{ lat: number; lng: number; label: string } | null>(null),
    [geoLoading, setGeoLoading] = useState(false),
    [roster, setRoster] = useState<ApiTechnician[]>([]),
    [selected, setSelected] = useState<(Technician & { distance: number }) | null>(null);
  useEffect(() => {
    let mounted = true;
    fetch("/data/technician-map.json")
      .then((r) => r.json() as Promise<C[]>)
      .then((d) => {
        if (!mounted) return;
        setData(d);
        setReady(true);
      })
      .catch(() => mounted && setError("Falha ao carregar o mapa"));
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-technician-directory]');
    const load = () => {
      const unique = new globalThis.Map<string, Technician>();
      for (const technician of window.TECHNICIAN_DIRECTORY ?? []) {
        if (!technician.name || /^apagar\b/i.test(technician.name.trim())) continue;
        unique.set(`${normalize(technician.name)}|${normalize(technician.city)}|${technician.uf.toUpperCase()}`, technician);
      }
      setDirectory([...unique.values()]);
    };
    if (window.TECHNICIAN_DIRECTORY) load();
    else if (existing) existing.addEventListener('load', load, { once: true });
    else {
      const script = document.createElement('script');
      script.src = '/data/technician-directory.js';
      script.async = true;
      script.dataset.technicianDirectory = 'true';
      script.addEventListener('load', load, { once: true });
      document.head.appendChild(script);
    }
    return () => existing?.removeEventListener('load', load);
  }, []);
  const ufs = useMemo(
    () => [
      "Todos",
      ...Array.from(new Set(data.map((x) => x.uf).filter(Boolean))).sort(),
    ],
    [data],
  );
  const show = useMemo(
    () =>
      data.filter(
        (x) =>
          (uf === "Todos" || x.uf === uf) &&
          (!q ||
            [x.city, x.uf, x.address].some((v) =>
              v.toLowerCase().includes(q.toLowerCase()),
            )),
      ),
    [data, q, uf],
  );
  const targetCity = useMemo(() => {
    const needle = normalize(q);
    if (needle.length < 2) return null;
    const candidates = data.filter((city) => normalize(city.city).includes(needle) && (uf === 'Todos' || city.uf === uf));
    return candidates.find((city) => normalize(city.city) === needle) ?? candidates[0] ?? null;
  }, [data, q, uf]);
  // A cidade buscada pode não estar em technician-map.json, que só lista as 425
  // com técnico. Sem isso, procurar por uma cidade descoberta não devolvia nada
  // — nem sequer os técnicos vizinhos. Aqui ela é geocodificada sob demanda.
  useEffect(() => {
    const term = q.trim();
    if (targetCity || term.length < 3) { setGeo(null); return; }
    let active = true;
    const timer = setTimeout(() => {
      setGeoLoading(true);
      void (async () => {
        try {
          const token = await auth.currentUser?.getIdToken();
          if (!token) return;
          const response = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          const payload = await response.json() as { found?: boolean; lat?: number; lng?: number; label?: string };
          if (active) setGeo(payload.found && payload.lat != null && payload.lng != null
            ? { lat: payload.lat, lng: payload.lng, label: payload.label ?? term }
            : null);
        } catch {
          if (active) setGeo(null);
        } finally {
          if (active) setGeoLoading(false);
        }
      })();
    }, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [q, targetCity]);

  // O diretório estático do mapa não tem telefone nem especialidade; o cadastro
  // completo vem do banco e é cruzado por nome + cidade.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const response = await fetch('/api/technicians', { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) return;
        const payload = await response.json() as { technicians?: ApiTechnician[] };
        if (active) setRoster(payload.technicians ?? []);
      } catch { /* detalhe é opcional: a lista continua funcionando sem ele */ }
    })();
    return () => { active = false; };
  }, []);
  const rosterIndex = useMemo(() => {
    const index = new globalThis.Map<string, ApiTechnician>();
    for (const item of roster) index.set(`${normalize(item.name)}|${normalize(item.city ?? '')}`, item);
    return index;
  }, [roster]);
  const selectedDetail = selected ? rosterIndex.get(`${normalize(selected.name)}|${normalize(selected.city)}`) ?? null : null;

  const origin = targetCity ?? geo;
  const originLabel = targetCity ? `${targetCity.city}/${targetCity.uf}` : geo?.label ?? '';
  // Ranking completo por distância; o corte de 55 km vira uma faixa, não um
  // filtro que esconde tudo quando não há ninguém perto.
  const ranked = useMemo(() => {
    if (!origin) return [];
    return directory
      .map((technician) => ({ ...technician, distance: distanceKm(origin, technician) }))
      .sort((left, right) => left.distance - right.distance || left.name.localeCompare(right.name, 'pt-BR'));
  }, [directory, origin]);
  const nearby = ranked.filter((technician) => technician.distance <= 55.0001);
  const localTechnicians = targetCity ? nearby.filter((technician) => normalize(technician.city) === normalize(targetCity.city) && technician.uf.toUpperCase() === targetCity.uf.toUpperCase()) : [];
  const nearbyTechnicians = nearby.filter((technician) => !localTechnicians.includes(technician));
  // Ninguém em 55 km: em vez de tela vazia, os mais próximos que existirem.
  const fallbackTechnicians = useMemo(
    () => (ranked.length && !ranked.some((technician) => technician.distance <= 55.0001) ? ranked.slice(0, 8) : []),
    [ranked],
  );
  useEffect(() => {
    if (!ready || !el.current) return;
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      if (!gm.current) {
        gm.current = L.map(el.current, { zoomControl: true, attributionControl: true })
          .setView([-14.5, -44], 4);
        // Standard OSM tiles: no API key, no quota, no billing. The dark look
        // is applied with a CSS filter on .leaflet-tile (see globals.css) so we
        // do not depend on a keyed dark-basemap provider.
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(gm.current);
      }
      const map = gm.current;
      if (!map) return;
      marks.current.forEach((m) => m.remove());
      marks.current = show.map((c) => {
        const size = c.technicians ? 22 : 11;
        const color = c.technicians ? "#e56223" : "#64748b";
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:1px solid #fff;display:grid;place-items:center;color:#fff;font-size:10px;font-weight:700;box-shadow:0 1px 4px rgb(0 0 0 / 45%)">${c.technicians || ""}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
        const m = L.marker([c.lat, c.lng], { icon, title: `${c.city}/${c.uf}` }).addTo(map);
        m.on("click", () => setSel(c));
        return m;
      });
      // Sem marcadores o mapa ficava no enquadramento inicial (meio do Atlântico)
      // quando a busca não retornava cidade. Centraliza no ponto procurado e,
      // se não houver técnico por perto, abre o suficiente para mostrar o mais
      // próximo junto.
      if (origin) {
        const point = L.latLng(origin.lat, origin.lng);
        originMark.current?.remove();
        originMark.current = L.marker(point, {
          title: originLabel,
          icon: L.divIcon({
            className: "",
            html: `<div style="width:16px;height:16px;border-radius:50%;background:#38bdf8;border:2px solid #fff;box-shadow:0 0 0 4px rgb(56 189 248 / 30%)"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
        }).addTo(map);
        const closest = show.length === 0 ? fallbackTechnicians[0] : undefined;
        if (closest) map.fitBounds(L.latLngBounds([point, L.latLng(closest.lat, closest.lng)]).pad(0.35));
        else map.setView(point, 9);
      } else {
        originMark.current?.remove();
        originMark.current = null;
      }
      map.invalidateSize();
    })().catch(() => setError("Falha ao iniciar o mapa"));
    return () => { cancelled = true; };
  }, [ready, show, origin, originLabel, fallbackTechnicians]);
  const total = show.reduce((s, x) => s + x.technicians, 0),
    onboard = show.reduce((s, x) => s + x.onboarded, 0),
    vehicles = show.reduce((s, x) => s + x.vehicles, 0);
  return (
    <main className="min-h-screen text-foreground">
      <AppNavigation active="map" open={menu} onOpenChange={setMenu} />
      <section className="app-content">
        <header className="flex h-[68px] items-center border-b border-border px-4 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Abrir menu"
            aria-expanded={menu}
            onClick={() => setMenu(true)}
          >
            <Menu />
          </Button>
          <a
            href="/?view=overview"
            className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"
          >
            <ArrowLeft className="size-4" />
            Operação
          </a>
          <Badge
            variant="outline"
            className="ml-auto border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
          >
            Diretório operacional · {data.length} cidades
          </Badge>
        </header>
        <div id="main-content" tabIndex={-1} className="app-main mx-auto max-w-[1600px] px-4 pt-4 pb-36 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                Distribuição nacional
              </p>
              <h1 className="mt-1 text-3xl font-semibold">
                Mapa operacional de técnicos
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Cobertura cruzada com cadastro e qualificação.
              </p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Buscar cidade"
                  className="w-full pl-9 sm:w-64"
                  placeholder="Buscar cidade..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <select
                aria-label="Filtrar por estado"
                className="rounded-md border border-input bg-background px-3 text-sm"
                value={uf}
                onChange={(e) => setUf(e.target.value)}
              >
                {ufs.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Card t="Cidades exibidas" v={show.length} i={MapPin} />
            <Card t="Técnicos vinculados" v={total} i={Users} />
            <Card t="Onboarding concluído" v={onboard} i={ShieldCheck} />
            <Card t="Com veículo" v={vehicles} i={Car} />
          </div>
          {geoLoading && !origin && (
            <p className="surface-panel mt-5 rounded-2xl p-4 text-sm text-muted-foreground">Localizando “{q.trim()}”...</p>
          )}
          {origin && (
            <section className="surface-panel mt-5 rounded-2xl p-5" aria-live="polite">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-primary">{nearby.length ? 'Cobertura em até 55 km' : 'Sem técnico na região'}</p>
                  <h2 className="mt-1 text-xl font-extrabold">{originLabel}</h2>
                  {!targetCity && <p className="mt-0.5 text-xs text-muted-foreground">Cidade sem técnico cadastrado · localizada pelo mapa</p>}
                </div>
                <Badge variant="outline" className={nearby.length ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/25 bg-amber-400/10 text-amber-200'}>
                  {nearby.length ? `${nearby.length} técnico${nearby.length === 1 ? '' : 's'} em 55 km` : 'nenhum em 55 km'}
                </Badge>
              </div>
              {nearby.length > 0 ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <TechnicianGroup title={`Na cidade (${localTechnicians.length})`} technicians={localTechnicians} empty="Nenhum técnico cadastrado nesta cidade." onSelect={setSelected} />
                  <TechnicianGroup title={`Técnicos próximos (${nearbyTechnicians.length})`} technicians={nearbyTechnicians} empty="Nenhum técnico adicional no raio de 55 km." onSelect={setSelected} />
                </div>
              ) : (
                <div className="mt-4">
                  <p className="mb-3 text-xs text-muted-foreground">Nenhum técnico em até 55 km. Estes são os mais próximos, ordenados por distância:</p>
                  <TechnicianGroup title={`Mais próximos (${fallbackTechnicians.length})`} technicians={fallbackTechnicians} empty="Nenhum técnico cadastrado no diretório." onSelect={setSelected} />
                </div>
              )}
            </section>
          )}
          <div className="map-surface relative mt-5 overflow-hidden rounded-xl border border-border bg-card">
            <div ref={el} className="h-[650px] w-full bg-[#17201c]" />
            {error && (
              <div className="absolute inset-0 grid place-items-center bg-card text-amber-300">
                {error}
              </div>
            )}
            {selected && (
            <section className="surface-panel mt-5 rounded-2xl p-5" aria-live="polite">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary/10 text-sm font-bold text-primary">{initials(selected.name)}</span>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-extrabold">{selected.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {selected.city}/{selected.uf}
                      {selected.distance >= 1 && ` · ${selected.distance.toFixed(1)} km de ${originLabel}`}
                      {selectedDetail?.technicianCode ? ` · ${selectedDetail.technicianCode}` : ''}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Fechar</Button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(() => {
                  const link = whatsappLink(selectedDetail?.phone);
                  return link
                    ? <a href={link} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-500/15 px-4 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/25"><MessageCircle className="size-4" />WhatsApp</a>
                    : <span className="inline-flex min-h-10 items-center rounded-lg bg-muted/40 px-4 text-sm text-muted-foreground">Sem telefone cadastrado</span>;
                })()}
                {selectedDetail?.phone && <a href={`tel:${selectedDetail.phone.replace(/\D/g, '')}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold transition hover:bg-muted"><Phone className="size-4" />{selectedDetail.phone}</a>}
                {selectedDetail?.email && <a href={`mailto:${selectedDetail.email}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold transition hover:bg-muted"><Mail className="size-4" />E-mail</a>}
              </div>

              <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <Fact label="Situação" value={selectedDetail?.status ?? '—'} />
                <Fact label="Veículo" value={selected.vehicle ? (selectedDetail?.vehicleType || 'Sim') : 'Não'} />
                <Fact label="Onboarding" value={selected.onboarded ? 'Concluído' : 'Pendente'} />
                <Fact label="Avaliação" value={selectedDetail?.reviewCount ? `${(selectedDetail.reviewAvg ?? 0).toFixed(1)}/5 (${selectedDetail.reviewCount})` : 'Sem avaliações'} />
              </div>

              {(selectedDetail?.specialties || selectedDetail?.availableTools) && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {selectedDetail?.specialties && <div className="cockpit-inset rounded-xl p-3"><p className="text-xs font-bold text-muted-foreground">Especialidades</p><p className="mt-1 text-xs leading-relaxed">{selectedDetail.specialties}</p></div>}
                  {selectedDetail?.availableTools && <div className="cockpit-inset rounded-xl p-3"><p className="text-xs font-bold text-muted-foreground">Ferramentas</p><p className="mt-1 text-xs leading-relaxed">{selectedDetail.availableTools}</p></div>}
                </div>
              )}

              {!selectedDetail && <p className="mt-3 text-xs text-muted-foreground">Cadastro completo não localizado para este técnico — exibindo apenas os dados do mapa.</p>}
            </section>
          )}
          {sel && (
              <aside className="absolute bottom-4 left-4 right-4 rounded-xl border border-border bg-background/95 p-5 shadow-2xl md:left-auto md:top-4 md:w-80">
                <div className="flex justify-between">
                  <div>
                    <p className="text-xs font-bold text-primary">{sel.uf}</p>
                    <h2 className="text-xl font-extrabold">{sel.city}</h2>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSel(null)}
                  >
                    Fechar
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sel.address}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Mini t="Técnicos" v={sel.technicians} />
                  <Mini t="Onboarded" v={sel.onboarded} />
                  <Mini t="Com veículo" v={sel.vehicles} />
                  <Mini t="Média ferramentas" v={sel.avgTools} />
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sel.city + " " + sel.uf)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button className="mt-4 w-full">
                    <MapPin />
                    Abrir no Google Maps
                  </Button>
                </a>
              </aside>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
function Card({ t, v, i: I }: { t: string; v: number; i: typeof Users }) {
  return (
    <div className="cockpit-stat metric-glow rounded-2xl p-4">
      <div className="flex justify-between text-sm text-muted-foreground">
        {t}
        <I className="size-4 text-primary" />
      </div>
      <p className="mt-3 text-2xl font-semibold">{v}</p>
    </div>
  );
}
function Mini({ t, v }: { t: string; v: number }) {
  return (
    <div className="cockpit-inset rounded-lg p-3">
      <p className="text-xs text-muted-foreground">{t}</p>
      <p className="mt-1 text-lg font-black">{v}</p>
    </div>
  );
}

function TechnicianGroup({ title, technicians, empty, onSelect }: { title: string; technicians: Array<Technician & { distance: number }>; empty: string; onSelect: (technician: Technician & { distance: number }) => void }) {
  return <div className="cockpit-inset min-w-0 rounded-xl p-4"><h3 className="text-xs font-bold text-muted-foreground">{title}</h3><div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">{technicians.map((technician) => <button type="button" key={`${technician.name}-${technician.city}-${technician.uf}`} onClick={() => onSelect(technician)} className="flex w-full items-center gap-3 rounded-lg border-b border-border px-1 py-1.5 text-left transition last:border-0 hover:bg-primary/10 focus-visible:bg-primary/10"><span className="grid size-9 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 text-[11px] font-bold text-primary">{initials(technician.name)}</span><span className="min-w-0"><b className="block truncate text-sm">{technician.name}</b><small className="text-xs text-muted-foreground">{technician.city}/{technician.uf}{technician.vehicle ? ' · Com veículo' : ''}</small></span><small className="ml-auto whitespace-nowrap text-xs font-semibold text-emerald-300">{technician.distance < 1 ? 'na cidade' : `${technician.distance.toFixed(1)} km`}</small></button>)}{!technicians.length && <p className="py-4 text-xs text-muted-foreground">{empty}</p>}</div></div>;
}

// Telefones vêm do cadastro em formatos variados; o link do WhatsApp exige só
// dígitos com DDI. Sem telefone utilizável, o botão não é oferecido.
function whatsappLink(phone?: string | null) {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const withCountry = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="cockpit-inset rounded-xl p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></div>;
}

function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function initials(value: string) { return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function distanceKm(origin: Pick<C, 'lat' | 'lng'>, target: Pick<Technician, 'lat' | 'lng'>) {
  const radians = Math.PI / 180;
  const latitude = (target.lat - origin.lat) * radians;
  const longitude = (target.lng - origin.lng) * radians;
  const value = Math.sin(latitude / 2) ** 2 + Math.cos(origin.lat * radians) * Math.cos(target.lat * radians) * Math.sin(longitude / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(value));
}
