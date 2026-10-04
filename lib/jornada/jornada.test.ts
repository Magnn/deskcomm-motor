/**
 * A jornada: o schema recusa o que não dá para contar, o código conta a etapa sobre o histórico, o bloco
 * mostra só a etapa atual e a catraca veta preço e link antes da hora.
 */
import { describe, expect, it } from "vitest";

import { blocoDaJornada } from "./bloco-do-prompt";
import { estadoDaJornada, extrairData, vetoDaJornada } from "./estado";
import { jornadaSchema, lerJornada, type JornadaConfig } from "./tipos";

const JORNADA: JornadaConfig = jornadaSchema.parse({
  enabled: true,
  etapas: [
    { id: "acolhida", nome: "Acolhida", objetivo: "Dar boas-vindas e perguntar se pode começar.", saida: "resposta" },
    {
      id: "dados",
      nome: "Dados",
      objetivo: "Pedir nome e data de nascimento.",
      saida: "campos",
      campos: [
        { chave: "nome", rotulo: "Nome", tipo: "texto" },
        { chave: "nascimento", rotulo: "Data de nascimento", tipo: "data" },
      ],
    },
    {
      id: "escolha",
      nome: "Escolha",
      objetivo: "Pedir 3 números de 1 a 22.",
      saida: "campos",
      campos: [{ chave: "numeros", rotulo: "Números escolhidos", tipo: "numeros", quantidade: 3, minimo: 1, maximo: 22 }],
    },
    { id: "oferta", nome: "Oferta", objetivo: "Apresentar o serviço e o valor.", saida: "resposta", libera: ["oferta", "preco", "link"] },
  ],
});

const lead = (body: string) => ({ direction: "inbound", body });
const agente = (body: string) => ({ direction: "outbound", body });

describe("schema", () => {
  it("recusa etapa que termina por campos sem campo, número sem intervalo e ids repetidos", () => {
    const etapa = { id: "a", nome: "A", objetivo: "x", saida: "campos" };
    expect(jornadaSchema.safeParse({ enabled: true, etapas: [etapa] }).success).toBe(false);
    const semIntervalo = { ...etapa, campos: [{ chave: "n", rotulo: "N", tipo: "numeros", quantidade: 3 }] };
    expect(jornadaSchema.safeParse({ enabled: true, etapas: [semIntervalo] }).success).toBe(false);
    const ok = { id: "a", nome: "A", objetivo: "x", saida: "resposta" };
    expect(jornadaSchema.safeParse({ enabled: true, etapas: [ok, ok] }).success).toBe(false);
  });

  it("lerJornada: desligada, ausente ou quebrada vira null — o turno segue sem jornada", () => {
    expect(lerJornada({ journey: { ...JORNADA, enabled: false } })).toBeNull();
    expect(lerJornada({})).toBeNull();
    expect(lerJornada({ journey: { enabled: true, etapas: "x" } })).toBeNull();
    expect(lerJornada({ journey: JORNADA })?.etapas).toHaveLength(4);
  });
});

describe("extrairData", () => {
  it("aceita dd/mm/aaaa, ano curto e por extenso; recusa data impossível", () => {
    expect(extrairData("nasci em 12/03/1990")).toBe("12/03/1990");
    expect(extrairData("5-7-85")).toBe("05/07/1985");
    expect(extrairData("12 de março de 1990")).toBe("12/03/1990");
    expect(extrairData("31/02/1990")).toBeNull();
    expect(extrairData("tenho 3 filhos")).toBeNull();
  });
});

describe("estadoDaJornada", () => {
  it("começa na primeira etapa e anda quando a pessoa responde depois de a agente falar", () => {
    expect(estadoDaJornada(JORNADA, [lead("oi")]).indice).toBe(0);
    const e = estadoDaJornada(JORNADA, [lead("oi"), agente("Bem-vinda! Vamos começar?"), lead("sim")]);
    expect(e.indice).toBe(1);
    expect(e.agenteJaFalou).toBe(false);
  });

  it("os 3 números mandados picados em 3 mensagens contam juntos (o defeito medido em produção)", () => {
    const e = estadoDaJornada(JORNADA, [
      lead("oi"),
      agente("Vamos começar?"),
      lead("sim"),
      agente("Me diga seu nome e nascimento"),
      lead("Ana, 12/03/1990"),
      agente("Escolha 3 números de 1 a 22"),
      lead("3"),
      lead("6"),
    ]);
    expect(e.etapa.id).toBe("escolha");
    expect(e.parciais.numeros).toEqual([3, 6]);
    const depois = estadoDaJornada(JORNADA, [
      lead("oi"), agente("Vamos começar?"), lead("sim"), agente("Nome e nascimento?"), lead("Ana, 12/03/1990"),
      agente("Escolha 3 números de 1 a 22"), lead("3"), lead("6"), lead("9"),
    ]);
    expect(depois.etapa.id).toBe("oferta");
    expect(depois.valores.numeros).toBe("3, 6, 9");
  });

  it("números ditos ANTES do pedido não são escolha; repetidos e fora do intervalo não contam", () => {
    const antes = estadoDaJornada(JORNADA, [
      lead("oi"), agente("Vamos?"), lead("sim"), agente("Nome e nascimento?"), lead("Ana, 12/03/1990, tenho 3 filhos e 10 gatos"),
    ]);
    expect(antes.etapa.id).toBe("escolha");
    expect(antes.parciais.numeros).toBeUndefined();
    const ruins = estadoDaJornada(JORNADA, [
      lead("oi"), agente("Vamos?"), lead("sim"), agente("Nome e nascimento?"), lead("Ana 12/03/1990"),
      agente("3 números de 1 a 22"), lead("7 7 30 0 15"),
    ]);
    expect(ruins.parciais.numeros).toEqual([7, 15]);
  });

  it("dados adiantados não são perguntados de novo: a data na resposta da acolhida já vale", () => {
    const e = estadoDaJornada(JORNADA, [lead("oi"), agente("Vamos começar?"), lead("sim! nasci em 12/03/1990")]);
    expect(e.etapa.id).toBe("dados");
    expect(e.valores.nascimento).toBe("12/03/1990");
    expect(e.faltam.map((c) => c.chave)).toEqual(["nome"]);
  });

  it("nome e data na mesma mensagem: o texto fica sem a data", () => {
    const e = estadoDaJornada(JORNADA, [
      lead("oi"), agente("Vamos?"), lead("sim"), agente("Nome e nascimento?"), lead("Ana, 12/03/1990"),
    ]);
    expect(e.valores).toMatchObject({ nome: "Ana", nascimento: "12/03/1990" });
    const extenso = estadoDaJornada(JORNADA, [
      lead("oi"), agente("Vamos?"), lead("sim"), agente("Nome e nascimento?"), lead("Sou a Ana, 12 de Março de 1990."),
    ]);
    expect(extenso.valores).toMatchObject({ nome: "Sou a Ana", nascimento: "12/03/1990" });
  });

  it("a última etapa não termina, e liberar é cumulativo", () => {
    const final = estadoDaJornada(JORNADA, [
      lead("oi"), agente("Vamos?"), lead("sim"), agente("Nome e nascimento?"), lead("Ana 12/03/1990"),
      agente("3 números de 1 a 22"), lead("1 2 3"), agente("O serviço é R$ 130"), lead("ok"), agente("?"), lead("ok"),
    ]);
    expect(final.ultima).toBe(true);
    expect([...final.liberado].sort()).toEqual(["link", "oferta", "preco"]);
    expect(estadoDaJornada(JORNADA, [lead("oi")]).liberado.size).toBe(0);
  });
});

describe("blocoDaJornada", () => {
  it("mostra só a etapa atual, o que falta, o que já sabemos e o que ainda não pode ser dito", () => {
    const e = estadoDaJornada(JORNADA, [
      lead("oi"), agente("Vamos?"), lead("sim"), agente("Nome e nascimento?"), lead("Ana 12/03/1990"),
      agente("3 números de 1 a 22"), lead("4"),
    ]);
    const b = blocoDaJornada(JORNADA, e);
    expect(b).toContain('ETAPA 3 DE 4: "Escolha"');
    expect(b).toContain("já disse: 4 — falta(m) 2");
    expect(b).toContain("Data de nascimento: 12/03/1990");
    expect(b).toContain('a próxima é "Oferta"');
    expect(b).toContain("Ainda NÃO fale de: a oferta (o produto ou serviço à venda); o preço; o link de pagamento");
    // O objetivo da etapa seguinte não vaza para o prompt.
    expect(b).not.toContain("Apresentar o serviço");
  });

  it("sem jornada, nada", () => {
    expect(blocoDaJornada(null, null)).toBe("");
  });
});

describe("vetoDaJornada", () => {
  it("veta valor em dinheiro e link antes da etapa que os libera, e solta depois", () => {
    const cedo = estadoDaJornada(JORNADA, [lead("oi")]);
    expect(vetoDaJornada(cedo, "Custa R$ 130")).toContain("o preço");
    expect(vetoDaJornada(cedo, "paga aqui https://pay.exemplo/x")).toContain("um link");
    expect(vetoDaJornada(cedo, "Seja bem-vinda! Vamos começar?")).toBeNull();
    const tarde = estadoDaJornada(JORNADA, [
      lead("oi"), agente("Vamos?"), lead("sim"), agente("Nome e nascimento?"), lead("Ana 12/03/1990"),
      agente("3 números de 1 a 22"), lead("1 2 3"),
    ]);
    expect(vetoDaJornada(tarde, "São R$ 130: https://pay.exemplo/x")).toBeNull();
  });
});
