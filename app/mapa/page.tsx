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
export default function Page() {
  const el = useRef<HTMLDivElement>(null),
    gm = useRef<any>(null),
    marks = useRef<any[]>([]);
  const [data, setData] = useState<C[]>([]),
    [q, setQ] = useState(""),
    [uf, setUf] = useState("Todos"),
    [sel, setSel] = useState<C | null>(null),
    [ready, setReady] = useState(false),
    [menu, setMenu] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      fetch("/data/technician-map.json").then((r) => r.json() as Promise<C[]>),
      fetch("/api/maps-config").then(
        (r) => r.json() as Promise<{ key: string }>,
      ),
    ])
      .then(([d, c]) => {
        setData(d);
        if (!c.key) throw Error("Chave do mapa não configurada");
        const s = document.createElement("script");
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(c.key)}&loading=async`;
        s.async = true;
        s.onload = () => setReady(true);
        s.onerror = () => setError("Falha ao carregar o Google Maps");
        document.head.appendChild(s);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Falha ao carregar o mapa"),
      );
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
  useEffect(() => {
    if (!ready || !el.current) return;
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
  }, [ready, show]);
  const total = show.reduce((s, x) => s + x.technicians, 0),
    onboard = show.reduce((s, x) => s + x.onboarded, 0),
    vehicles = show.reduce((s, x) => s + x.vehicles, 0);
  return (
    <main className="min-h-screen text-foreground">
      <aside
        className={`cockpit-sidebar fixed inset-y-0 left-0 z-40 w-[252px] border-r border-sidebar-border px-4 py-5 transition-transform lg:translate-x-0 ${menu ? "translate-x-0" : "-translate-x-full"}`}
      >
        <a href="/" className="flex h-12 items-center gap-3 px-2">
          <b className="cockpit-brand grid size-10 place-items-center rounded-xl text-lg">
            C
          </b>
          <div>
            <b>Caju OS</b>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Comando operacional
            </p>
          </div>
        </a>
        <nav className="mt-8 space-y-1">
          <p className="px-3 text-[10px] font-bold uppercase text-muted-foreground">
            Cobertura técnica
          </p>
          <a
            href="/"
            className="flex h-10 items-center gap-3 px-3 text-sm text-muted-foreground"
          >
            <LayoutDashboard className="size-4" />
            Visão geral
          </a>
          <div className="flex h-10 items-center gap-3 rounded-lg bg-sidebar-accent px-3 text-sm shadow-[inset_3px_0_0_var(--primary)]">
            <Map className="size-4 text-primary" />
            Mapa operacional
          </div>
          <div className="flex h-10 items-center gap-3 px-3 text-sm text-muted-foreground">
            <Users className="size-4" />
            Técnicos
          </div>
          <div className="flex h-10 items-center gap-3 px-3 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" />
            Qualificações
          </div>
        </nav>
        <div className="absolute bottom-6 flex items-center gap-3 px-3 text-sm text-muted-foreground">
          <Settings className="size-4" />
          Configurações
        </div>
      </aside>
      {menu && (
        <button
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
            href="/"
            className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"
          >
            <ArrowLeft className="size-4" />
            Operação
          </a>
          <Badge
            variant="outline"
            className="ml-auto border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
          >
            Sem dados pessoais · {data.length || 425} cidades
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
