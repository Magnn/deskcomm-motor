"use client";
/**
 * O MAPA ASTRAL COMPLETO na área (aba Você › "Só para você"): data, hora e cidade do nascimento → a roda do mapa
 * (AstroChart, MIT) e a lista dos planetas com signo, grau e casa, mais o Ascendente e o Meio do Céu.
 *
 * O cálculo é do servidor (`/mapa`, `lib/relatorio/mapa-natal.ts`); a cidade vem da busca (`/mapa/cidades`), com o
 * fuso de cada uma. O que a pessoa digitou fica só neste aparelho (localStorage), para o mapa abrir pronto na
 * próxima visita — nada disso vai para o cadastro.
 */
import * as React from "react";

import type { Cidade } from "@/lib/area-do-cliente/cidades";
import type { MapaNatal } from "@/lib/relatorio/mapa-natal";

import { type TextosDaArea } from "./_client";
import { LeituraDoMapa, type LeituraDoMapaInicial, type TextosDaLeituraDoMapa } from "./_leitura-do-mapa";
import { CARTAO_NOTURNO, SERIF } from "./_tema";

export interface TextosDoMapa {
  convite: string;
  data: string;
  hora: string;
  naoSeiAHora: string;
  semHora: string;
  cidade: string;
  cidadeDica: string;
  nenhumaCidade: string;
  ver: string;
  calculando: string;
  erro: string;
  ascendente: string;
  meioDoCeu: string;
  casa: string;
  retrogrado: string;
  editar: string;
  fonteDasCidades: string;
  /** Os nomes dos planetas e dos signos, já traduzidos (chave = o nome em português). */
  nomes: Record<string, string>;
}

const GUARDA = "area-mapa-natal";
type Guardado = { data: string; hora: string | null; cidade: Cidade };

function lerGuardado(): Guardado | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(GUARDA) ?? "null") as Guardado | null;
    return v?.cidade?.id ? v : null;
  } catch {
    return null;
  }
}

/** A roda: a AstroChart desenha num <div> pelo id, só no navegador. */
function Roda({ mapa }: { mapa: MapaNatal }) {
  const id = React.useId().replace(/:/g, "");
  React.useEffect(() => {
    let vivo = true;
    void import("@astrodraw/astrochart").then(({ Chart }) => {
      const el = document.getElementById(id);
      if (!vivo || !el) return;
      el.innerHTML = "";
      const lado = Math.min(el.clientWidth || 340, 480);
      const roda = new Chart(id, lado, lado, {
        COLOR_BACKGROUND: "transparent",
        POINTS_COLOR: "#f6e3a8",
        SIGNS_COLOR: "#e9dcff",
        CIRCLE_COLOR: "#6f6290",
        LINE_COLOR: "#6f6290",
        CUSPS_FONT_COLOR: "#9d94b2",
        SYMBOL_AXIS_FONT_COLOR: "#f6e3a8",
        COLORS_SIGNS: ["#3a2340", "#23352c", "#2e2a46", "#1f2f45", "#3a2340", "#23352c", "#2e2a46", "#1f2f45", "#3a2340", "#23352c", "#2e2a46", "#1f2f45"],
      });
      const planets = Object.fromEntries(mapa.planetas.map((p) => [p.corpo, [p.longitude, p.retrogrado ? -1 : 1]]));
      // Sem a hora não há casas: a roda mostra só os signos (divisões de 30° a partir de Áries).
      const cusps = mapa.cuspides ?? Array.from({ length: 12 }, (_, i) => i * 30);
      const radix = roda.radix({ planets, cusps });
      if (mapa.cuspides) radix.aspects();
    });
    return () => {
      vivo = false;
    };
  }, [id, mapa]);
  return <div id={id} className="mx-auto aspect-square w-full max-w-[480px]" data-testid="area-mapa-roda" />;
}

export function MapaAstral({
  slug,
  cor,
  tm,
  nascimento,
  tx,
  tl,
  leitura,
}: {
  slug: string;
  cor: string;
  tm: TextosDoMapa;
  nascimento: string | null;
  tx: TextosDaArea;
  tl: TextosDaLeituraDoMapa;
  /** A leitura paga do mapa (0959), quando a empresa a ligou; `null` = só o mapa grátis. */
  leitura: LeituraDoMapaInicial | null;
}) {
  const [data, setData] = React.useState(nascimento ?? "");
  const [hora, setHora] = React.useState("");
  const [semHora, setSemHora] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  /** A última resposta da busca e o texto a que ela responde. */
  const [achadas, setAchadas] = React.useState<{ q: string; lista: Cidade[] }>({ q: "", lista: [] });
  const [cidade, setCidade] = React.useState<Cidade | null>(null);
  const [mapa, setMapa] = React.useState<MapaNatal | null>(null);
  /** O nascimento do mapa que está na tela (a leitura é deste mapa). */
  const [doMapa, setDoMapa] = React.useState<Guardado | null>(null);
  const [estado, setEstado] = React.useState<"livre" | "calculando" | "erro">("livre");
  const nome = (s: string) => tm.nomes[s] ?? s;

  const calcular = React.useCallback(
    async (g: Guardado) => {
      setEstado("calculando");
      try {
        const r = await fetch(`/api/v1/area/publica/${slug}/mapa`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: g.data, hora: g.hora, cidade_id: g.cidade.id }),
        });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { data: { mapa: MapaNatal } };
        setMapa(j.data.mapa);
        setDoMapa(g);
        setEstado("livre");
        try {
          window.localStorage.setItem(GUARDA, JSON.stringify(g));
        } catch {
          /* aparelho sem armazenamento: o mapa só não abre pronto da próxima vez */
        }
      } catch {
        setEstado("erro");
      }
    },
    [slug],
  );

  // Quem já fez o mapa neste aparelho abre com ele pronto.
  React.useEffect(() => {
    const g = lerGuardado();
    if (!g) return;
    setData(g.data);
    setHora(g.hora ?? "");
    setSemHora(g.hora === null);
    setCidade(g.cidade);
    setBusca(`${g.cidade.nome}, ${g.cidade.estado}`);
    void calcular(g);
  }, [calcular]);

  // A busca de cidade, 250 ms depois da última tecla.
  const buscando = !cidade && busca.trim().length >= 2;
  React.useEffect(() => {
    if (!buscando) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/v1/area/publica/${slug}/mapa/cidades?q=${encodeURIComponent(busca)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((j: { data: Cidade[] }) => setAchadas({ q: busca, lista: j.data }))
        .catch(() => {
          if (!ctl.signal.aborted) setAchadas({ q: busca, lista: [] });
        });
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [busca, buscando, slug]);
  /** `null` = a busca deste texto ainda não respondeu. */
  const cidades = !buscando ? [] : achadas.q === busca ? achadas.lista : null;

  const pronto = /^\d{4}-\d{2}-\d{2}$/.test(data) && (semHora || /^\d{2}:\d{2}$/.test(hora)) && cidade !== null;
  const campo = "mt-1 h-12 w-full rounded-xl border border-white/10 bg-[#120d22] px-4 text-[16px] text-[#efe7f7] outline-hidden focus:border-[#c9a54e]/60";

  if (mapa && estado !== "calculando") {
    const sol = mapa.planetas[0]!;
    const lua = mapa.planetas[1]!;
    return (
      <div className="space-y-5" data-testid="area-mapa">
        <Roda mapa={mapa} />
        <p className={`${SERIF} text-center text-xl leading-snug text-[#f6e3a8]`}>
          ☉ {nome(sol.signo)} · ☾ {nome(lua.signo)}
          {mapa.ascendente ? ` · ↑ ${nome(mapa.ascendente.signo)}` : ""}
        </p>
        {!mapa.ascendente ? <p className="text-center text-sm text-[#9d94b2]">{tm.semHora}</p> : null}
        <ul className={`${CARTAO_NOTURNO} divide-y divide-white/5 rounded-2xl px-4`} data-testid="area-mapa-lista">
          {mapa.ascendente ? (
            <li className="flex justify-between py-2.5 text-[15px]">
              <span className="font-semibold">{tm.ascendente}</span>
              <span>
                {nome(mapa.ascendente.signo)} {Math.floor(mapa.ascendente.grau)}°
              </span>
            </li>
          ) : null}
          {mapa.meioDoCeu ? (
            <li className="flex justify-between py-2.5 text-[15px]">
              <span className="font-semibold">{tm.meioDoCeu}</span>
              <span>
                {nome(mapa.meioDoCeu.signo)} {Math.floor(mapa.meioDoCeu.grau)}°
              </span>
            </li>
          ) : null}
          {mapa.planetas.map((p) => (
            <li key={p.corpo} className="flex justify-between gap-3 py-2.5 text-[15px]">
              <span>
                {nome(p.nome)}
                {p.retrogrado ? <span className="ml-1 text-xs text-[#9d94b2]" title={tm.retrogrado}>℞</span> : null}
              </span>
              <span className="text-right">
                {nome(p.signo)} {Math.floor(p.grau)}°{p.casa ? <span className="text-[#9d94b2]"> · {tm.casa} {p.casa}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        {leitura && doMapa ? (
          <LeituraDoMapa
            key={`${doMapa.data}-${doMapa.hora}-${doMapa.cidade.id}`}
            slug={slug}
            cor={cor}
            tx={tx}
            tl={tl}
            nomes={tm.nomes}
            nascimento={{ data: doMapa.data, hora: doMapa.hora, cidade_id: doMapa.cidade.id }}
            inicial={leitura}
          />
        ) : null}
        <button type="button" onClick={() => setMapa(null)} className="mx-auto block text-sm text-[#c3bad3] underline underline-offset-4">
          {tm.editar}
        </button>
        <p className="text-center text-[11px] text-[#6f6290]">{tm.fonteDasCidades}</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      data-testid="area-mapa-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (pronto) void calcular({ data, hora: semHora ? null : hora, cidade: cidade! });
      }}
    >
      <p className="text-[15px] leading-relaxed text-[#c3bad3]">{tm.convite}</p>
      <label className="block text-sm font-semibold">
        {tm.data}
        <input type="date" required value={data} onChange={(e) => setData(e.target.value)} className={campo} />
      </label>
      <div>
        <label className="block text-sm font-semibold">
          {tm.hora}
          <input type="time" value={hora} disabled={semHora} onChange={(e) => setHora(e.target.value)} className={`${campo} disabled:opacity-40`} />
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm text-[#c3bad3]">
          <input type="checkbox" checked={semHora} onChange={(e) => setSemHora(e.target.checked)} className="h-5 w-5" />
          {tm.naoSeiAHora}
        </label>
      </div>
      <div className="relative">
        <label className="block text-sm font-semibold">
          {tm.cidade}
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setCidade(null);
            }}
            placeholder={tm.cidadeDica}
            autoComplete="off"
            className={campo}
            data-testid="area-mapa-cidade"
          />
        </label>
        {!cidade && cidades && cidades.length > 0 ? (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-[#1a1430] shadow-xl" role="listbox">
            {cidades.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full px-4 py-3 text-left text-[15px] hover:bg-white/5"
                  onClick={() => {
                    setCidade(c);
                    setBusca(`${c.nome}, ${c.estado}`);
                  }}
                >
                  {c.nome}
                  <span className="text-[#9d94b2]">
                    {" "}
                    · {c.estado ? `${c.estado}, ` : ""}
                    {c.pais}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {!cidade && busca.trim().length >= 2 && cidades?.length === 0 ? <p className="mt-1 text-xs text-[#9d94b2]">{tm.nenhumaCidade}</p> : null}
      </div>
      {estado === "erro" ? <p className="text-sm text-[#f3a7b8]">{tm.erro}</p> : null}
      <button
        type="submit"
        disabled={!pronto || estado === "calculando"}
        className="h-12 w-full rounded-full text-[15px] font-semibold disabled:opacity-40"
        style={{ background: cor, color: "#1b1433" }}
        data-testid="area-mapa-ver"
      >
        {estado === "calculando" ? tm.calculando : tm.ver}
      </button>
    </form>
  );
}
