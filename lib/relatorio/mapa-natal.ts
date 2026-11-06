/**
 * O MAPA NATAL COMPLETO — os dez planetas, o Ascendente, o Meio do Céu e as doze casas (Placidus), a partir da data,
 * da hora e da cidade do nascimento.
 *
 * `astrologia.ts` faz o mapa do DIA (sem hora: Sol a Saturno ao meio-dia). Aqui a hora e o lugar fixam o instante e
 * o horizonte, e o que depende deles passa a existir: Ascendente, Meio do Céu e casas.
 *
 * - O instante: a hora é a do relógio da cidade, convertida para UTC pelo fuso IANA da cidade (GeoNames) com o `Intl`
 *   do Node, que traz o histórico de cada fuso (o horário de verão antigo do Brasil, por exemplo).
 * - Planetas: longitude eclíptica geocêntrica aparente, zodíaco tropical (`astronomy-engine`).
 * - Ângulos e casas: tempo sidéreo aparente do `astronomy-engine` + obliquidade média; casas Placidus por iteração.
 *   Acima de 66° de latitude Placidus não existe para todo o zodíaco: usa casas iguais a partir do Ascendente.
 */
import * as Astronomy from "astronomy-engine";

import { SIGNOS } from "./astrologia";

export const PLANETAS_DO_MAPA = [
  ["Sol", "Sun"],
  ["Lua", "Moon"],
  ["Mercúrio", "Mercury"],
  ["Vênus", "Venus"],
  ["Marte", "Mars"],
  ["Júpiter", "Jupiter"],
  ["Saturno", "Saturn"],
  ["Urano", "Uranus"],
  ["Netuno", "Neptune"],
  ["Plutão", "Pluto"],
] as const;
export type PlanetaDoMapa = (typeof PLANETAS_DO_MAPA)[number][0];

export interface PontoDoMapa {
  nome: PlanetaDoMapa;
  /** O nome em inglês, que é a chave da roda (AstroChart). */
  corpo: (typeof PLANETAS_DO_MAPA)[number][1];
  longitude: number;
  signo: string;
  grau: number;
  /** 1 a 12; `null` sem a hora do nascimento. */
  casa: number | null;
  retrogrado: boolean;
}

export interface MapaNatal {
  planetas: PontoDoMapa[];
  /** Sem a hora não há Ascendente, Meio do Céu nem casas. */
  ascendente: { longitude: number; signo: string; grau: number } | null;
  meioDoCeu: { longitude: number; signo: string; grau: number } | null;
  /** As 12 cúspides (casa 1 = Ascendente), em graus da eclíptica. */
  cuspides: number[] | null;
  sistema: "placidus" | "iguais" | null;
  /** O instante do nascimento em UTC (ISO). */
  instante: string;
}

const RAD = Math.PI / 180;
const norm = (x: number): number => ((x % 360) + 360) % 360;
const signoDe = (lon: number): string => SIGNOS[Math.floor(norm(lon) / 30)]!;
const posicao = (lon: number) => ({ longitude: Number(norm(lon).toFixed(2)), signo: signoDe(lon), grau: Number((norm(lon) % 30).toFixed(1)) });

/** Quantos minutos o fuso está à frente do UTC naquele instante (Brasília no inverno = −180). */
function deslocamentoDoFuso(utcMs: number, fuso: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const v = (t: string) => Number(partes.find((p) => p.type === t)!.value);
  const comoUtc = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return Math.round((comoUtc - utcMs) / 60_000);
}

/** "1990-01-15" + "14:30" no relógio de `fuso` → o instante UTC. Na hora que o relógio pula (verão), vale a de depois. */
export function instanteDoNascimento(dataIso: string, hora: string, fuso: string): Date {
  const [a, m, d] = dataIso.split("-").map(Number) as [number, number, number];
  const [h, mi] = hora.split(":").map(Number) as [number, number];
  const relogio = Date.UTC(a, m - 1, d, h, mi);
  let utc = relogio - deslocamentoDoFuso(relogio, fuso) * 60_000;
  utc = relogio - deslocamentoDoFuso(utc, fuso) * 60_000; // 2ª passada: o deslocamento certo é o do instante real
  return new Date(utc);
}

function longitudeDe(corpo: string, t: Date): number {
  if (corpo === "Sun") return Astronomy.SunPosition(t).elon;
  if (corpo === "Moon") return Astronomy.EclipticGeoMoon(t).lon;
  return Astronomy.Ecliptic(Astronomy.GeoVector(corpo as Astronomy.Body, t, true)).elon;
}

/** Obliquidade média da eclíptica (graus) — a diferença para a verdadeira (< 0,005°) não muda casa nenhuma. */
function obliquidade(t: Date): number {
  const T = (t.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545.0) / 36_525;
  return 23.439291 - 0.0130042 * T;
}

/** O ponto da eclíptica que tem essa ascensão reta. */
const eclipticaDaAR = (ar: number, eps: number): number => norm(Math.atan2(Math.sin(ar * RAD), Math.cos(ar * RAD) * Math.cos(eps * RAD)) / RAD);

/** Ascendente, Meio do Céu e cúspides (Placidus, ou iguais acima de 66° de latitude). */
export function angulosECasas(t: Date, latitude: number, longitude: number): { asc: number; mc: number; cuspides: number[]; sistema: "placidus" | "iguais" } {
  const eps = obliquidade(t);
  const ramc = norm(Astronomy.SiderealTime(t) * 15 + longitude);
  const fi = latitude * RAD;
  const e = eps * RAD;
  const mc = eclipticaDaAR(ramc, eps);
  const asc = norm(Math.atan2(Math.cos(ramc * RAD), -(Math.sin(ramc * RAD) * Math.cos(e) + Math.tan(fi) * Math.sin(e))) / RAD);

  if (Math.abs(latitude) >= 66) {
    return { asc, mc, cuspides: Array.from({ length: 12 }, (_, i) => norm(asc + 30 * i)), sistema: "iguais" };
  }

  // Placidus: a cúspide divide em terços o arco que o próprio ponto da eclíptica percorre (semiarco diurno acima do
  // horizonte, noturno abaixo). Como o semiarco depende do ponto, itera até parar de mudar.
  const cuspide = (fracao: number, diurno: boolean): number => {
    let lon = diurno ? norm(mc + 90 * fracao) : norm(mc + 180 - 90 * fracao);
    for (let i = 0; i < 50; i++) {
      const dec = Math.asin(Math.sin(e) * Math.sin(lon * RAD));
      const ad = Math.asin(Math.max(-1, Math.min(1, Math.tan(fi) * Math.tan(dec)))) / RAD;
      const ar = diurno ? ramc + (90 + ad) * fracao : ramc + 180 - (90 - ad) * fracao;
      const novo = eclipticaDaAR(norm(ar), eps);
      if (Math.abs(((novo - lon + 540) % 360) - 180) < 1e-7) return novo;
      lon = novo;
    }
    return lon;
  };
  const c11 = cuspide(1 / 3, true);
  const c12 = cuspide(2 / 3, true);
  const c2 = cuspide(2 / 3, false);
  const c3 = cuspide(1 / 3, false);
  const cuspides = [asc, c2, c3, norm(mc + 180), norm(c11 + 180), norm(c12 + 180), norm(asc + 180), norm(c2 + 180), norm(c3 + 180), mc, c11, c12];
  return { asc, mc, cuspides, sistema: "placidus" };
}

/** Em que casa cai uma longitude (a casa vai da sua cúspide até a seguinte, no sentido do zodíaco). */
export function casaDe(lon: number, cuspides: number[]): number {
  for (let i = 0; i < 12; i++) {
    const ini = cuspides[i]!;
    const tam = norm(cuspides[(i + 1) % 12]! - ini);
    if (norm(lon - ini) < tam) return i + 1;
  }
  return 12;
}

export interface NascimentoCompleto {
  data: string;
  /** "HH:MM" no relógio da cidade; `null` = não sabe a hora (mapa do meio-dia, sem Ascendente nem casas). */
  hora: string | null;
  latitude: number;
  longitude: number;
  /** Fuso IANA da cidade, ex.: "America/Sao_Paulo". */
  fuso: string;
}

export function calcularMapaNatal(n: NascimentoCompleto): MapaNatal {
  const t = instanteDoNascimento(n.data, n.hora ?? "12:00", n.fuso);
  const casas = n.hora ? angulosECasas(t, n.latitude, n.longitude) : null;
  const umDiaDepois = new Date(t.getTime() + 86_400_000);
  const planetas = PLANETAS_DO_MAPA.map(([nome, corpo]) => {
    const lon = longitudeDe(corpo, t);
    const anda = ((longitudeDe(corpo, umDiaDepois) - lon + 540) % 360) - 180;
    return { nome, corpo, ...posicao(lon), casa: casas ? casaDe(lon, casas.cuspides) : null, retrogrado: anda < 0 };
  });
  return {
    planetas,
    ascendente: casas ? posicao(casas.asc) : null,
    meioDoCeu: casas ? posicao(casas.mc) : null,
    cuspides: casas ? casas.cuspides.map((c) => Number(c.toFixed(2))) : null,
    sistema: casas?.sistema ?? null,
    instante: t.toISOString(),
  };
}
