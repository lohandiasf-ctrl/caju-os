"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Car,
  LayoutDashboard,
  Map,
  MapPin,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
declare global {
  interface Window {
    google: any;
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
    gm = useRef<any>(null),
    marks = useRef<any[]>([]);
  const [data, setData] = useState<C[]>([]),
    [q, setQ] = useState(""),
    [uf, setUf] = useState("Todos"),
    [sel, setSel] = useState<C | null>(null),
    [directory, setDirectory] = useState<Technician[]>([]),
    [ready, setReady] = useState(false),
    [menu, setMenu] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch("/data/technician-map.json").then((r) => r.json() as Promise<C[]>),
      fetch("/api/maps-config").then(
        (r) => r.json() as Promise<{ key: string }>,
      ),
    ])
      .then(([d, c]) => {
        if (!mounted) return;
        setData(d);
        if (!c.key) throw Error("Chave do mapa não configurada");
        if (typeof window.google?.maps?.Map === "function") {
          setReady(true);
          return;
        }
        const s = document.createElement("script");
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(c.key)}&v=weekly`;
        s.async = true;
        s.onload = () => {
          if (!mounted) return;
          if (typeof window.google?.maps?.Map === "function") setReady(true);
          else setError("Google Maps carregou sem a biblioteca de mapas");
        };
        s.onerror = () => { if (mounted) setError("Falha ao carregar o Google Maps"); };
        document.head.appendChild(s);
      })
      .catch((e: unknown) =>
        mounted && setError(e instanceof Error ? e.message : "Falha ao carregar o mapa"),
      );
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
  const nearby = useMemo(() => {
    if (!targetCity) return [];
    return directory
      .map((technician) => ({ ...technician, distance: distanceKm(targetCity, technician) }))
      .filter((technician) => technician.distance <= 55.0001)
      .sort((left, right) => left.distance - right.distance || left.name.localeCompare(right.name, 'pt-BR'));
  }, [directory, targetCity]);
  const localTechnicians = targetCity ? nearby.filter((technician) => normalize(technician.city) === normalize(targetCity.city) && technician.uf.toUpperCase() === targetCity.uf.toUpperCase()) : [];
  const nearbyTechnicians = nearby.filter((technician) => !localTechnicians.includes(technician));
  useEffect(() => {
    if (!ready || !el.current) return;
    try {
      if (typeof window.google?.maps?.Map !== "function") throw Error("Biblioteca do Google Maps indisponível");
      if (!gm.current)
        gm.current = new window.google.maps.Map(el.current, {
          center: { lat: -14.5, lng: -44 },
          zoom: 5,
          mapId: "DEMO_MAP_ID",
          disableDefaultUI: true,
          zoomControl: true,
        });
      marks.current.forEach((x) => x.setMap(null));
      marks.current = show.map((c) => {
        const m = new window.google.maps.Marker({
          map: gm.current,
          position: { lat: c.lat, lng: c.lng },
          title: `${c.city}/${c.uf}`,
          label: c.technicians
            ? {
                text: String(c.technicians),
                color: "#fff",
                fontSize: "10px",
                fontWeight: "700",
              }
            : undefined,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: c.technicians ? 10 : 5,
            fillColor: c.technicians ? "#e56223" : "#64748b",
            fillOpacity: 0.9,
            strokeColor: "#fff",
            strokeWeight: 1,
          },
        });
        m.addListener("click", () => setSel(c));
        return m;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao iniciar o mapa");
    }
  }, [ready, show]);
  const total = show.reduce((s, x) => s + x.technicians, 0),
    onboard = show.reduce((s, x) => s + x.onboarded, 0),
    vehicles = show.reduce((s, x) => s + x.vehicles, 0);
  return (
    <main className="min-h-screen text-foreground">
      <aside
        className={`cockpit-sidebar fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col overflow-hidden border-r border-sidebar-border px-4 py-5 transition-transform lg:translate-x-0 ${menu ? "translate-x-0" : "-translate-x-full"}`}
      >
        <a href="/?view=overview" className="flex h-12 shrink-0 items-center gap-3 px-2">
          <span className="cockpit-brand grid size-10 place-items-center overflow-hidden rounded-xl"><img src="/caju-tech-emblem.png" alt="Caju Tech" className="size-9 object-contain" /></span>
          <div>
            <b>Caju OS</b>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Comando operacional
            </p>
          </div>
        </a>
        <nav className="mt-8 min-h-0 flex-1 space-y-1 overflow-y-auto pb-4">
          <p className="px-3 text-[10px] font-bold uppercase text-muted-foreground">
            Cobertura técnica
          </p>
          <a
            href="/?view=overview"
            className="flex h-10 items-center gap-3 px-3 text-sm text-muted-foreground"
          >
            <LayoutDashboard className="size-4" />
            Visão geral
          </a>
          <div className="flex h-10 items-center gap-3 rounded-lg bg-sidebar-accent px-3 text-sm shadow-[inset_3px_0_0_var(--primary)]">
            <Map className="size-4 text-primary" />
            Mapa operacional
          </div>
          <a href="/?view=technicians" className="flex h-10 items-center gap-3 px-3 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
            <Users className="size-4" />
            Técnicos
          </a>
        </nav>
        <a href="/?view=settings" className="flex shrink-0 items-center gap-3 border-t border-sidebar-border px-3 pt-4 text-sm text-muted-foreground hover:text-foreground">
          <Settings className="size-4" />
          Configurações
        </a>
      </aside>
      {menu && (
        <button
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setMenu(false)}
        />
      )}
      <section className="lg:pl-[252px]">
        <header className="flex h-[68px] items-center border-b border-border px-4 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
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
            Diretório operacional · {data.length || 425} cidades
          </Badge>
        </header>
        <div className="p-4 lg:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                Distribuição nacional
              </p>
              <h1 className="mt-1 text-3xl font-extrabold">
                Mapa operacional de técnicos
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Cobertura cruzada com cadastro e qualificação.
              </p>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="w-64 pl-9"
                  placeholder="Buscar cidade..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <select
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
          {targetCity && (
            <section className="surface-panel mt-5 rounded-2xl p-5" aria-live="polite">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-widest text-primary">Cobertura em até 55 km</p><h2 className="mt-1 text-xl font-extrabold">{targetCity.city}/{targetCity.uf}</h2></div>
                <Badge variant="outline" className="border-emerald-400/25 bg-emerald-400/10 text-emerald-300">{nearby.length} técnico{nearby.length === 1 ? '' : 's'}</Badge>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <TechnicianGroup title={`Na cidade (${localTechnicians.length})`} technicians={localTechnicians} empty="Nenhum técnico cadastrado nesta cidade." />
                <TechnicianGroup title={`Técnicos próximos (${nearbyTechnicians.length})`} technicians={nearbyTechnicians} empty="Nenhum técnico adicional no raio de 55 km." />
              </div>
            </section>
          )}
          <div className="relative mt-5 overflow-hidden rounded-xl border border-border bg-card">
            <div ref={el} className="h-[650px] w-full bg-[#17201c]" />
            {error && (
              <div className="absolute inset-0 grid place-items-center bg-card text-amber-300">
                {error}
              </div>
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
      <p className="mt-3 text-2xl font-black">{v}</p>
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

function TechnicianGroup({ title, technicians, empty }: { title: string; technicians: Array<Technician & { distance: number }>; empty: string }) {
  return <div className="cockpit-inset min-w-0 rounded-xl p-4"><h3 className="text-xs font-bold text-muted-foreground">{title}</h3><div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">{technicians.map((technician) => <div key={`${technician.name}-${technician.city}-${technician.uf}`} className="flex items-center gap-3 border-b border-border pb-2 last:border-0 last:pb-0"><span className="grid size-9 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 text-[11px] font-bold text-primary">{initials(technician.name)}</span><span className="min-w-0"><b className="block truncate text-sm">{technician.name}</b><small className="text-xs text-muted-foreground">{technician.city}/{technician.uf}{technician.vehicle ? ' · Com veículo' : ''}</small></span><small className="ml-auto whitespace-nowrap text-xs font-semibold text-emerald-300">{technician.distance < 1 ? 'na cidade' : `${technician.distance.toFixed(1)} km`}</small></div>)}{!technicians.length && <p className="py-4 text-xs text-muted-foreground">{empty}</p>}</div></div>;
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
