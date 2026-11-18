import { describe, expect, it } from "vitest";

import { escolherPorCapacidade, sortearNumero, type NumeroNoRodizio } from "./rodizio-de-numeros";

describe("sortearNumero", () => {
  it("sem número vivo devolve null (a rota usa o número configurado)", () => {
    expect(sortearNumero([])).toBeNull();
  });

  it("cobre todos os números, nas pontas do sorteio inclusive", () => {
    const numeros = ["556981087471", "556981084871", "556981105076"];
    expect(sortearNumero(numeros, () => 0)).toBe(numeros[0]);
    expect(sortearNumero(numeros, () => 0.5)).toBe(numeros[1]);
    expect(sortearNumero(numeros, () => 0.9999)).toBe(numeros[2]);
    expect(sortearNumero(numeros, () => 1)).toBe(numeros[2]);
  });

  it("divide por igual", () => {
    const numeros = ["a", "b", "c"];
    const conta: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 3000; i++) {
      const n = sortearNumero(numeros, () => i / 3000)!;
      conta[n] = (conta[n] ?? 0) + 1;
    }
    expect(conta).toEqual({ a: 1000, b: 1000, c: 1000 });
  });
});

describe("escolherPorCapacidade", () => {
  const n = (telefone: string, leadsHoje: number, orcamentoHoje: number | null, aCaminho = 0): NumeroNoRodizio => ({
    telefone,
    leadsHoje,
    aCaminho,
    orcamentoHoje,
  });

  it("sem número vivo devolve null", () => {
    expect(escolherPorCapacidade([])).toBeNull();
  });

  it("manda para quem usou a MENOR fração do orçamento, não para quem tem menos leads", () => {
    // 10/50 = 20% contra 5/15 = 33%: o número maior recebe, mesmo com mais leads.
    expect(escolherPorCapacidade([n("novo", 5, 15), n("formado", 10, 50)])).toEqual({ telefone: "formado", transbordo: false });
  });

  it("clique a caminho pesa como lead (rajada não cai toda no mesmo número)", () => {
    expect(escolherPorCapacidade([n("a", 3, 24, 4), n("b", 5, 24)])?.telefone).toBe("b");
  });

  it("número cheio sai da escolha", () => {
    expect(escolherPorCapacidade([n("cheio", 24, 24), n("folgado", 23, 24)])?.telefone).toBe("folgado");
  });

  it("todos cheios: vai para o menos carregado e marca transbordo", () => {
    expect(escolherPorCapacidade([n("a", 30, 24), n("b", 25, 24)])).toEqual({ telefone: "b", transbordo: true });
  });

  it("sem orçamento nunca enche e entra pela régua do maior orçamento", () => {
    // livre: 30/24 = 1,25; limitado está cheio (24/24) e sai — o livre recebe, sem transbordo.
    expect(escolherPorCapacidade([n("limitado", 24, 24), n("livre", 30, null)])).toEqual({ telefone: "livre", transbordo: false });
    // livre 10/24 contra limitado 5/24: o limitado recebe.
    expect(escolherPorCapacidade([n("limitado", 5, 24), n("livre", 10, null)])?.telefone).toBe("limitado");
  });

  it("ninguém com orçamento: divide por igual, como antes", () => {
    const numeros = [n("a", 0, null), n("b", 0, null), n("c", 0, null)];
    const conta: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const escolha = escolherPorCapacidade(numeros, () => 0.5)!;
      conta[escolha.telefone] = (conta[escolha.telefone] ?? 0) + 1;
      const alvo = numeros.find((x) => x.telefone === escolha.telefone)!;
      alvo.leadsHoje += 1;
    }
    expect(conta).toEqual({ a: 10, b: 10, c: 10 });
  });

  it("72 cliques em 3 números de 24: exatamente 24 cada, e o 73º transborda", () => {
    const numeros = [n("a", 0, 24), n("b", 0, 24), n("c", 0, 24)];
    for (let i = 0; i < 72; i++) {
      const escolha = escolherPorCapacidade(numeros, () => 0.3)!;
      expect(escolha.transbordo).toBe(false);
      numeros.find((x) => x.telefone === escolha.telefone)!.leadsHoje += 1;
    }
    expect(numeros.map((x) => x.leadsHoje)).toEqual([24, 24, 24]);
    expect(escolherPorCapacidade(numeros)?.transbordo).toBe(true);
  });

  it("empate é sorteado só entre os empatados", () => {
    const numeros = [n("a", 5, 24), n("b", 1, 24), n("c", 1, 24)];
    expect(escolherPorCapacidade(numeros, () => 0)?.telefone).toBe("b");
    expect(escolherPorCapacidade(numeros, () => 0.99)?.telefone).toBe("c");
  });
});

describe("escolherPorCapacidade — oficial primeiro e nota de saúde", () => {
  const n = (
    telefone: string,
    leadsHoje: number,
    orcamentoHoje: number | null,
    extra: Partial<NumeroNoRodizio> = {},
  ): NumeroNoRodizio => ({ telefone, leadsHoje, aCaminho: 0, orcamentoHoje, ...extra });

  it("oficial com vaga recebe antes do QR, mesmo mais carregado", () => {
    expect(escolherPorCapacidade([n("qr", 0, 24), n("oficial", 20, 24, { oficial: true })])).toEqual({
      telefone: "oficial",
      transbordo: false,
    });
  });

  it("oficial cheio: os de QR viram a reserva", () => {
    expect(escolherPorCapacidade([n("qr", 3, 24), n("oficial", 24, 24, { oficial: true })])?.telefone).toBe("qr");
  });

  it("dia inteiro: 24 no oficial e depois os QR dividem pela capacidade", () => {
    const numeros = [n("oficial", 0, 24, { oficial: true }), n("qr1", 0, 24), n("qr2", 0, 24)];
    for (let i = 0; i < 48; i++) numeros.find((x) => x.telefone === escolherPorCapacidade(numeros, () => 0)!.telefone)!.leadsHoje += 1;
    expect(numeros.map((x) => x.leadsHoje)).toEqual([24, 12, 12]);
  });

  it("nota abaixo de 30 descansa enquanto outro tiver vaga", () => {
    expect(escolherPorCapacidade([n("caindo", 0, 24, { nota: 25 }), n("bom", 20, 24)])?.telefone).toBe("bom");
  });

  it("nota 30–59 recebe metade do orçamento", () => {
    const fraco = n("fraco", 12, 24, { nota: 50 });
    // 12 de 24×0,5 = cheio: o outro recebe mesmo com 20/24.
    expect(escolherPorCapacidade([fraco, n("bom", 20, 24)])?.telefone).toBe("bom");
    fraco.leadsHoje = 5;
    // 5/12 = 42% contra 20/24 = 83%: o fraco ainda recebe enquanto tem metade livre.
    expect(escolherPorCapacidade([fraco, n("bom", 20, 24)])?.telefone).toBe("fraco");
  });

  it("oficial descansando não fura: os de QR recebem", () => {
    expect(escolherPorCapacidade([n("oficial", 0, 24, { oficial: true, nota: 10 }), n("qr", 5, 24)])?.telefone).toBe("qr");
  });

  it("todos descansando: transbordo para o menos carregado, nunca perde o clique", () => {
    expect(escolherPorCapacidade([n("a", 10, 24, { nota: 0 }), n("b", 2, 24, { nota: 20 })])).toEqual({
      telefone: "b",
      transbordo: true,
    });
  });
});
