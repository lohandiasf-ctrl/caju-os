"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Box,
  Clock3,
  LayoutDashboard,
  MapPin,
  Menu,
  PackageCheck,
  PackageOpen,
  Search,
  Settings,
  Truck,
  UserRound,
  Warehouse,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type S = {
  status: string;
  fsa: string;
  city: string;
  equipment: string;
  tracking: string;
  delivery: string;
  technician: string;
  service: string;
  note: string;
  supplier: string;
};
function parse(t: string) {
  const a: string[][] = [];
  let r: string[] = [],
    v = "",
    q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '"') {
      if (q && t[i + 1] === '"') {
        v += '"';
        i++;
      } else q = !q;
    } else if (c === "," && !q) {
      r.push(v);
      v = "";
    } else if ((c === "\n" || c === "\r") && !q) {
      if (c === "\r" && t[i + 1] === "\n") i++;
      r.push(v);
      if (r.some((x) => x.trim())) a.push(r);
      r = [];
      v = "";
    } else v += c;
  }
  return a;
}
const c = (x = "") => x.trim().replace(/\s+/g, " "),
  done = ["FINALIZADO", "ENCERRADO", "FECHADO", "CANCELADO"];
export default function Page() {
  const [all, setAll] = useState<S[]>([]),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("ATIVOS"),
    [selected, setSelected] = useState<S | null>(null),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    fetch("/data/spares.csv")
      .then((x) => x.text())
      .then((t) => {
        const d = parse(t)
          .slice(3)
          .map((r) => ({
            status: c(r[0]) || "SEM STATUS",
            fsa: c(r[1]),
            city: c(r[2]),
            equipment: c(r[3]),
            tracking: c(r[4]),
            delivery: c(r[5]),
            technician: c(r[6]),
            service: c(r[7]),
            note: c(r[8]),
            supplier: c(r[10]),
          }))
          .reverse();
        setAll(d);
        setSelected(d[0]);
      });
  }, []);
  const active = useMemo(
      () => all.filter((x) => !done.includes(x.status)),
      [all],
    ),
    rows = useMemo(() => {
      const b =
          filter === "ATIVOS"
            ? active
            : filter === "TODOS"
              ? all
              : all.filter((x) => x.status === filter),
        q = query.toLowerCase();
      return b.filter((x) =>
        [x.fsa, x.city, x.equipment, x.technician, x.tracking].some((v) =>
          v.toLowerCase().includes(q),
        ),
      );
    }, [all, active, filter, query]);
  const n = (s: string[]) => active.filter((x) => s.includes(x.status)).length;
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
            Logística
          </p>
          <a
            href="/"
            className="flex h-10 items-center gap-3 px-3 text-sm text-muted-foreground"
          >
            <LayoutDashboard className="size-4" />
            Visão geral
          </a>
          <div className="flex h-10 items-center gap-3 rounded-lg bg-sidebar-accent px-3 text-sm shadow-[inset_3px_0_0_var(--primary)]">
            <PackageOpen className="size-4 text-primary" />
            Spares
          </div>
          <div className="flex h-10 items-center gap-3 px-3 text-sm text-muted-foreground">
            <Warehouse className="size-4" />
            Estoque
          </div>
          <div className="flex h-10 items-center gap-3 px-3 text-sm text-muted-foreground">
            <Truck className="size-4" />
            Expedições
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
        <header className="sticky top-0 z-20 flex h-[68px] items-center border-b border-border bg-background/90 px-4 backdrop-blur-xl lg:px-8">
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
            Planilha · {all.length || 347} itens
          </Badge>
        </header>
        <div className="mx-auto max-w-[1700px] p-4 lg:p-8">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Peças e equipamentos
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">Central de Spares</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhamento do pedido à entrega e ao atendimento técnico.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Card t="Pendentes" v={n(["PENDENTE"])} i={Clock3} />
            <Card
              t="Em trânsito"
              v={n(["ENVIADO", "COMPRADO", "DIRECIONADO"])}
              i={Truck}
            />
            <Card
              t="Recebidos / agendados"
              v={n(["RECEBIDO", "AGENDADO"])}
              i={PackageCheck}
            />
            <Card
              t="Sem rastreio"
              v={active.filter((x) => !x.tracking).length}
              i={Box}
            />
          </div>
          <div className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_.6fr]">
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar FSA, cidade, equipamento ou técnico..."
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    "ATIVOS",
                    "PENDENTE",
                    "ENVIADO",
                    "RECEBIDO",
                    "AGENDADO",
                    "TODOS",
                  ].map((x) => (
                    <Button
                      size="sm"
                      variant={filter === x ? "secondary" : "ghost"}
                      onClick={() => setFilter(x)}
                      key={x}
                    >
                      {x}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="max-h-[610px] overflow-auto">
                {rows.map((x, i) => (
                  <button
                    key={x.fsa + x.equipment + i}
                    onClick={() => setSelected(x)}
                    className={`grid w-full grid-cols-[1fr_auto] border-b border-border p-4 text-left hover:bg-muted/40 ${selected === x ? "bg-primary/8" : ""}`}
                  >
                    <div>
                      <div className="flex gap-2">
                        <b className="font-mono text-xs text-primary">
                          FSA-{x.fsa}
                        </b>
                        <Badge variant="outline">{x.status}</Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {x.supplier}
                        </span>
                      </div>
                      <h3 className="mt-2 text-sm font-bold">{x.equipment}</h3>
                      <p className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                        <span className="flex gap-1">
                          <MapPin className="size-3" />
                          {x.city}
                        </span>
                        <span className="flex gap-1">
                          <UserRound className="size-3" />
                          {x.technician}
                        </span>
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
            <aside className="h-fit rounded-xl border border-border bg-card p-5 xl:sticky xl:top-[92px]">
              {selected ? (
                <>
                  <b className="font-mono text-xs text-primary">
                    FSA-{selected.fsa}
                  </b>
                  <h2 className="mt-2 text-xl font-extrabold">
                    {selected.equipment}
                  </h2>
                  <Badge variant="outline" className="mt-3">
                    {selected.status}
                  </Badge>
                  <div className="mt-6 space-y-4">
                    <D l="Cidade" v={selected.city} />
                    <D l="Técnico responsável" v={selected.technician} />
                    <D l="Fornecedor" v={selected.supplier} />
                    <D
                      l="Código de rastreio"
                      v={selected.tracking || "Ainda não informado"}
                    />
                    <D
                      l="Previsão de entrega"
                      v={selected.delivery || "Sem previsão"}
                    />
                    <D
                      l="Atendimento"
                      v={selected.service || "Sem agendamento"}
                    />
                    {selected.note && (
                      <div className="rounded-lg border border-amber-400/20 bg-amber-400/8 p-4 text-sm">
                        {selected.note}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <Box />
              )}
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
function Card({ t, v, i: I }: { t: string; v: number; i: typeof Box }) {
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
function D({ l, v }: { l: string; v: string }) {
  return (
    <div className="border-b border-border pb-3">
      <p className="text-xs font-bold uppercase text-muted-foreground">
        {l}
      </p>
      <p className="mt-1 text-sm font-semibold">{v}</p>
    </div>
  );
}
