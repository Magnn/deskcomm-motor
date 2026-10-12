/**
 * O CÁLCULO DE DOIS MAPAS — posições reais dos planetas em duas datas e os aspectos entre elas.
 *
 * É o que separa um relatório de sinastria de um texto de signo: o modelo de linguagem NÃO calcula nada. Ele
 * recebe estas posições e só pode interpretar os aspectos que estão aqui.
 *
 * Sem hora de nascimento usa-se o meio-dia do fuso informado, e o que depende da hora é marcado: a Lua anda ~13°
 * por dia e pode trocar de signo; Ascendente e casas não são calculados (exigem hora e cidade).
 *
 * Longitude eclíptica geocêntrica, zodíaco tropical, pela `astronomy-engine` (JS puro, sem rede).
 */
import * as Astronomy from "astronomy-engine";

export const SIGNOS = ["Áries", "Touro", "Gêmeos", "Câncer", "Leão", "Virgem", "Libra", "Escorpião", "Sagitário", "Capricórnio", "Aquário", "Peixes"] as const;
const CORPOS = [
  ["Sol", "Sun"],
  ["Lua", "Moon"],
  ["Mercúrio", "Mercury"],
  ["Vênus", "Venus"],
  ["Marte", "Mars"],
  ["Júpiter", "Jupiter"],
  ["Saturno", "Saturn"],
] as const;
export type Planeta = (typeof CORPOS)[number][0];

export interface Posicao {
  longitude: number;
  signo: string;
  grau: number;
  /** O signo é o mesmo do começo ao fim do dia? Falso = sem a hora ele é incerto. */
  signoCerto: boolean;
  noComecoDoDia: string;
  noFimDoDia: string;
  andaNoDia: number;
}
export type Mapa = Record<Planeta, Posicao>;

export interface Aspecto {
  de: Planeta;
  para: Planeta;
  aspecto: "conjunção" | "sextil" | "quadratura" | "trígono" | "oposição";
  orbe: number;
  /** Continua valendo mesmo com a incerteza da hora. */
  firme: boolean;
}

const norm = (lon: number): number => ((lon % 360) + 360) % 360;
const signoDe = (lon: number): string => SIGNOS[Math.floor(norm(lon) / 30)]!;

function longitude(corpo: string, quando: Date): number {
  if (corpo === "Sun") return Astronomy.SunPosition(quando).elon;
  if (corpo === "Moon") return Astronomy.EclipticGeoMoon(quando).lon;
  return Astronomy.Ecliptic(Astronomy.GeoVector(corpo as Astronomy.Body, quando, true)).elon;
}

/** "AAAA-MM-DD" válido e plausível para um nascimento. */
export function dataDeNascimentoValida(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return ano >= 1900 && d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia && d.getTime() < Date.now();
}

/** "04/02/1982", "4-2-82" ou "04 02 1982" → "1982-02-04". `null` = não é data de nascimento. */
export function dataEmIso(texto: string): string | null {
  const m = /^\s*(\d{1,2})\s*[/.\-\s]\s*(\d{1,2})\s*[/.\-\s]\s*(\d{2}|\d{4})\s*$/.exec(texto);
  if (!m) return null;
  const ano = m[3]!.length === 2 ? (Number(m[3]) > 30 ? 1900 + Number(m[3]) : 2000 + Number(m[3])) : Number(m[3]);
  const iso = `${ano}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return dataDeNascimentoValida(iso) ? iso : null;
}

/** O mapa do dia, ao meio-dia de um fuso (padrão: UTC−3). */
export function mapaDoDia(iso: string, fusoEmHoras = -3): Mapa {
  const inicio = new Date(`${iso}T00:00:00Z`).getTime() - fusoEmHoras * 3_600_000;
  const [ini, meio, fim] = [new Date(inicio), new Date(inicio + 12 * 3_600_000), new Date(inicio + 24 * 3_600_000)];
  const out = {} as Mapa;
  for (const [pt, en] of CORPOS) {
    const l = longitude(en, meio);
    const l0 = longitude(en, ini);
    const l1 = longitude(en, fim);
    out[pt] = {
      longitude: Number(norm(l).toFixed(2)),
      signo: signoDe(l),
      grau: Number((norm(l) % 30).toFixed(1)),
      signoCerto: signoDe(l0) === signoDe(l1),
      noComecoDoDia: signoDe(l0),
      noFimDoDia: signoDe(l1),
      andaNoDia: Number(norm(l1 - l0).toFixed(1)),
    };
  }
  return out;
}

const ANGULOS = [
  ["conjunção", 0],
  ["sextil", 60],
  ["quadratura", 90],
  ["trígono", 120],
  ["oposição", 180],
] as const;

/** Os aspectos entre os dois mapas, do mais exato para o mais largo. */
export function aspectosEntre(a: Mapa, b: Mapa): Aspecto[] {
  const lista: Aspecto[] = [];
  for (const [pa] of CORPOS) {
    for (const [pb] of CORPOS) {
      let d = Math.abs(a[pa].longitude - b[pb].longitude) % 360;
      if (d > 180) d = 360 - d;
      for (const [nome, angulo] of ANGULOS) {
        const orbe = Math.abs(d - angulo);
        const teto = pa === "Sol" || pa === "Lua" || pb === "Sol" || pb === "Lua" ? 7 : 5;
        if (orbe > teto) continue;
        // A Lua pode estar até meio dia de caminho antes ou depois da posição do meio-dia.
        const incerteza = (pa === "Lua" ? a[pa].andaNoDia / 2 : 0) + (pb === "Lua" ? b[pb].andaNoDia / 2 : 0);
        lista.push({ de: pa, para: pb, aspecto: nome, orbe: Number(orbe.toFixed(1)), firme: orbe + incerteza <= teto });
      }
    }
  }
  return lista.sort((x, y) => x.orbe - y.orbe);
}

export interface Sinastria {
  a: { nome: string; data: string; mapa: Mapa };
  b: { nome: string; data: string; mapa: Mapa };
  aspectos: Aspecto[];
}

export function calcularSinastria(a: { nome: string; data: string }, b: { nome: string; data: string }): Sinastria {
  const ma = mapaDoDia(a.data);
  const mb = mapaDoDia(b.data);
  return { a: { ...a, mapa: ma }, b: { ...b, mapa: mb }, aspectos: aspectosEntre(ma, mb) };
}

/** As posições e os aspectos em texto, do jeito que o modelo recebe. */
export function sinastriaEmTexto(s: Sinastria): string {
  const pessoa = (p: Sinastria["a"]): string =>
    `${p.nome} (nascimento ${p.data.split("-").reverse().join("/")}):\n` +
    (Object.entries(p.mapa) as [Planeta, Posicao][])
      .map(([nome, v]) => `- ${nome}: ${v.signoCerto ? `${v.signo} ${Math.floor(v.grau)}°` : `INCERTO sem a hora (${v.noComecoDoDia} de manhã, ${v.noFimDoDia} à noite)`}`)
      .join("\n");
  const aspectos = s.aspectos
    .map((x) => `- ${x.de} de ${s.a.nome} em ${x.aspecto} com ${x.para} de ${s.b.nome} (orbe ${String(x.orbe).replace(".", ",")}°)${x.firme ? "" : " — INCERTO sem a hora"}`)
    .join("\n");
  return `${pessoa(s.a)}\n\n${pessoa(s.b)}\n\nASPECTOS ENTRE OS DOIS MAPAS (do mais exato ao mais largo):\n${aspectos}`;
}
