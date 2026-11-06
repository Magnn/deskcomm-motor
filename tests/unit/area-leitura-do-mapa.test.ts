/**
 * A leitura do mapa astral (migration 0959): as posições vêm do cálculo, a IA só escreve; sem a hora o Ascendente
 * sai; resposta com parte faltando é recusada; antes de pagar só o Sol abre; o pedido leva as posições prontas.
 */
import { describe, expect, it } from "vitest";

import {
  configDaLeituraDoMapa,
  lerLeituraDoMapa,
  leituraDoMapaNaTela,
  posicoesDoMapa,
} from "@/lib/area-do-cliente/leitura-do-mapa";
import { pedidoDoMapa } from "@/lib/area-do-cliente/leitura-do-mapa-ia";
import { calcularMapaNatal } from "@/lib/relatorio/mapa-natal";

const SP = { latitude: -23.5475, longitude: -46.63611, fuso: "America/Sao_Paulo" };
const comHora = calcularMapaNatal({ data: "1990-01-15", hora: "14:30", ...SP });
const semHora = calcularMapaNatal({ data: "1990-01-15", hora: null, ...SP });

const resposta = (partes: string[]) =>
  "```json\n" + JSON.stringify({ partes: Object.fromEntries(partes.map((p) => [p, `leitura de ${p}`])), sintese: "o todo", passo: "um passo" }) + "\n```";

describe("leitura do mapa astral", () => {
  it("desligada por padrão, R$ 19 sem preço", () => {
    expect(configDaLeituraDoMapa(undefined)).toEqual({ ativo: false, preco_cents: 1900 });
    expect(configDaLeituraDoMapa({ ativo: true, preco_cents: 2700 })).toEqual({ ativo: true, preco_cents: 2700 });
  });

  it("⭐ as posições saem do cálculo: Sol em Capricórnio; sem a hora, nada de Ascendente nem casa", () => {
    const p = posicoesDoMapa(comHora);
    expect(p.map((x) => x.parte)).toEqual(["sol", "lua", "ascendente", "venus", "marte"]);
    expect(p[0]).toMatchObject({ parte: "sol", signo: "Capricórnio" });
    expect(p.find((x) => x.parte === "sol")!.casa).toBeGreaterThanOrEqual(1);
    const s = posicoesDoMapa(semHora);
    expect(s.map((x) => x.parte)).toEqual(["sol", "lua", "venus", "marte"]);
    expect(s.every((x) => x.casa === null)).toBe(true);
  });

  it("⭐ lê a resposta da IA mantendo as posições do cálculo; parte faltando ou JSON quebrado é recusado", () => {
    const pos = posicoesDoMapa(comHora);
    const l = lerLeituraDoMapa(resposta(["sol", "lua", "ascendente", "venus", "marte"]), pos);
    expect(l?.partes.map((x) => [x.parte, x.signo])).toEqual(pos.map((x) => [x.parte, x.signo]));
    expect(l?.sintese).toBe("o todo");
    expect(lerLeituraDoMapa(resposta(["sol", "lua", "venus", "marte"]), pos)).toBeNull();
    expect(lerLeituraDoMapa("não sei", pos)).toBeNull();
  });

  it("⭐ antes de pagar só o Sol abre; as outras mostram a posição sem a leitura", () => {
    const pos = posicoesDoMapa(comHora);
    const l = lerLeituraDoMapa(resposta(pos.map((x) => x.parte)), pos)!;
    const fechada = leituraDoMapaNaTela(l, false);
    expect(fechada.partes.filter((x) => x.leitura !== null).map((x) => x.parte)).toEqual(["sol"]);
    expect(fechada.partes[1]).toMatchObject({ parte: "lua", leitura: null });
    expect(fechada.partes[1]!.signo).toBeTruthy();
    expect(fechada.sintese).toBeNull();
    expect(leituraDoMapaNaTela(l, true).partes.every((x) => x.leitura !== null)).toBe(true);
  });

  it("o pedido leva as posições prontas e, sem a hora, proíbe falar de Ascendente", () => {
    const p = pedidoDoMapa("Casa", "Ana", posicoesDoMapa(comHora));
    expect(p).toContain("Sol em Capricórnio");
    expect(p).toContain('"ascendente"');
    expect(pedidoDoMapa("Casa", "Ana", posicoesDoMapa(semHora))).toContain("não fale de Ascendente");
  });
});
