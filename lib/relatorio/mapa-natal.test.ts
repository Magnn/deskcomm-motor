/**
 * O mapa natal contra uma referência independente: os valores abaixo saíram da circular-natal-horoscope-js 1.1.0
 * (efemérides e casas próprias, outra implementação) em 05/11/2026, para os mesmos nascimentos. Tolerância de 0,2°:
 * casa nenhuma muda de signo por isso, e a Lua anda 0,5° por hora.
 */
import { describe, expect, it } from "vitest";

import { calcularMapaNatal, casaDe, instanteDoNascimento } from "./mapa-natal";

const REF = [
  { n: { data: "1990-01-15", hora: "14:30", latitude: -23.55, longitude: -46.633, fuso: "America/Sao_Paulo" }, utc: "1990-01-15T16:30:00.000Z",
    asc: 41.34, mc: 313.26, casas: [41.34, 70.57, 101.22, 133.26, 165.41, 195.18, 221.34, 250.57, 281.22, 313.26, 345.41, 15.18], sol: 295.27, lua: 169.83, plutao: 227.43 },
  { n: { data: "1985-07-04", hora: "06:10", latitude: -27.1, longitude: -52.615, fuso: "America/Sao_Paulo" }, utc: "1985-07-04T09:10:00.000Z",
    asc: 84.91, mc: 7.85, casas: [84.91, 117.76, 153.54, 187.85, 217.14, 241.96, 264.91, 297.76, 333.54, 7.85, 37.14, 61.96], sol: 102.33, lua: 306.57, plutao: 211.94 },
  { n: { data: "1978-11-23", hora: "22:45", latitude: 38.717, longitude: -9.133, fuso: "Europe/Lisbon" }, utc: "1978-11-23T22:45:00.000Z",
    asc: 135.63, mc: 37, casas: [135.63, 157.67, 184.55, 217, 252.42, 286.07, 315.63, 337.67, 4.55, 37, 72.42, 106.07], sol: 241.29, lua: 162.9, plutao: 198.24 },
  { n: { data: "2001-03-09", hora: "03:05", latitude: 19.433, longitude: -99.133, fuso: "America/Mexico_City" }, utc: "2001-03-09T09:05:00.000Z",
    asc: 284.54, mc: 206.14, casas: [284.54, 318.09, 353.39, 26.14, 54.31, 79.43, 104.54, 138.09, 173.39, 206.14, 234.31, 259.43], sol: 348.86, lua: 164, plutao: 255.26 },
];

const perto = (a: number, b: number, tol = 0.2) => expect(Math.abs(((a - b + 540) % 360) - 180)).toBeLessThan(tol);

describe("mapa natal", () => {
  it.each(REF)("$n.fuso $n.data $n.hora: instante, ângulos, casas e planetas batem com a referência", (r) => {
    const m = calcularMapaNatal(r.n);
    expect(m.instante).toBe(r.utc);
    expect(m.sistema).toBe("placidus");
    perto(m.ascendente!.longitude, r.asc);
    perto(m.meioDoCeu!.longitude, r.mc);
    m.cuspides!.forEach((c, i) => perto(c, r.casas[i]!));
    perto(m.planetas[0]!.longitude, r.sol);
    perto(m.planetas[1]!.longitude, r.lua);
    perto(m.planetas[9]!.longitude, r.plutao);
  });

  it("o horário de verão antigo do Brasil entra: 15/01/1990 em São Paulo era UTC−2, não −3", () => {
    expect(instanteDoNascimento("1990-01-15", "14:30", "America/Sao_Paulo").toISOString()).toBe("1990-01-15T16:30:00.000Z");
    expect(instanteDoNascimento("1990-07-15", "14:30", "America/Sao_Paulo").toISOString()).toBe("1990-07-15T17:30:00.000Z");
  });

  it("sem a hora: planetas do meio-dia, sem Ascendente, Meio do Céu nem casas", () => {
    const m = calcularMapaNatal({ ...REF[0]!.n, hora: null });
    expect(m.ascendente).toBeNull();
    expect(m.cuspides).toBeNull();
    expect(m.planetas.every((p) => p.casa === null)).toBe(true);
    expect(m.planetas).toHaveLength(10);
  });

  it("acima de 66° de latitude usa casas iguais a partir do Ascendente", () => {
    const m = calcularMapaNatal({ data: "1990-06-21", hora: "12:00", latitude: 69.65, longitude: 18.96, fuso: "Europe/Oslo" });
    expect(m.sistema).toBe("iguais");
    perto(m.cuspides![1]!, m.ascendente!.longitude + 30, 0.01);
  });

  it("casa de um planeta: a casa vai da cúspide dela até a próxima, atravessando 0° de Áries", () => {
    const c = REF[0]!.casas;
    expect(casaDe(41.34, c)).toBe(1);
    expect(casaDe(10, c)).toBe(11); // entre 345,41 (11) e 15,18 (12), passando por 0°
    expect(casaDe(300, c)).toBe(9);
  });
});
