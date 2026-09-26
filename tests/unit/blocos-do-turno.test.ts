import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BLOCOS_DO_TURNO,
  comporSystemDoTurno,
  type BlocosDoTurno,
} from "@/lib/agent-engine/agent/blocos-do-turno";

/**
 * A fila de blocos do system do turno: a ORDEM é dado (`BLOCOS_DO_TURNO`) e é
 * afirmada aqui sobre a FUNÇÃO — não sobre o texto de `inbound-turn.ts`, que é o
 * que fazia cada bloco novo quebrar dois testes que fixavam a linha inteira.
 * A única leitura de código-fonte é a de FIAÇÃO: que cada chave recebe o texto
 * do bloco certo.
 */

/** Um valor que se acha no resultado: `[nome]`, para conferir a posição de cada um. */
const sentinela = (nome: string): string => `[${nome}]`;

const todos = (): BlocosDoTurno =>
  Object.fromEntries(BLOCOS_DO_TURNO.map((n) => [n, sentinela(n)])) as BlocosDoTurno;

describe("comporSystemDoTurno", () => {
  it("põe a base primeiro e cada bloco depois, na ordem da fila", () => {
    const texto = comporSystemDoTurno("BASE", todos());
    expect(texto).toBe("BASE" + BLOCOS_DO_TURNO.map(sentinela).join(""));
  });

  it("produz EXATAMENTE o que a linha antiga de inbound-turn.ts produzia (refactor sem efeito)", () => {
    // Caracterização: a expressão que este módulo substituiu, escrita por extenso, contra a função — em
    // todas as combinações de bloco presente/ausente (2^7), com textos que têm quebra de linha, `${}` e
    // acento, que é o que um bloco real carrega. Se este teste um dia divergir, o system dos agentes em
    // produção mudou de texto sem ninguém ter decidido. (Estilo, identidade e oferta entraram depois: a
    // expressão "antiga" aqui é a fila decidida, escrita por extenso.)
    const textos = {
      identidade: "\n\nIDENTIDADE E TOM — você é a Ana\n",
      oferta: "\n\nOFERTA — use SÓ estes fatos ${z}\n",
      anuncio: "\n\nCONTEXTO DO ANÚNCIO ${x}\n",
      estilo: '\n\nVARIAÇÃO DE ESTILO — não abra com "Entendi"\n',
      leitura: "\n\nLEITURA — REVELE A CARTA 2 DE 3\n",
      preco: "\n\nPREÇO: R$ 130\n",
      entrega: "\n\nGUIA DA ENTREGA ${y}\n",
    };
    for (let mascara = 0; mascara < 128; mascara++) {
      const b = {
        identidade: mascara & 1 ? textos.identidade : "",
        oferta: mascara & 2 ? textos.oferta : "",
        anuncio: mascara & 4 ? textos.anuncio : "",
        estilo: mascara & 8 ? textos.estilo : "",
        leitura: mascara & 16 ? textos.leitura : "",
        preco: mascara & 32 ? textos.preco : "",
        entrega: mascara & 64 ? textos.entrega : "",
      };
      const antiga = `BASE${b.identidade}${b.oferta}${b.anuncio}${b.estilo}${b.leitura}${b.preco}${b.entrega}`;
      expect(comporSystemDoTurno("BASE", b), `combinação ${mascara}`).toBe(antiga);
    }
  });

  it("bloco vazio some, e sem nenhum bloco o system sai idêntico (prefixo cacheável intacto)", () => {
    const vazios = Object.fromEntries(BLOCOS_DO_TURNO.map((n) => [n, ""])) as BlocosDoTurno;
    expect(comporSystemDoTurno("BASE", vazios)).toBe("BASE");
    expect(comporSystemDoTurno("BASE", { ...vazios, preco: "P" })).toBe("BASEP");
  });

  it("um bloco só entra no lugar da fila, qualquer que seja a combinação dos outros", () => {
    // O bloco de preço vem depois da leitura e antes da entrega mesmo quando o do anúncio some.
    const texto = comporSystemDoTurno("B", { ...todos(), anuncio: "" });
    expect(texto.indexOf(sentinela("leitura"))).toBeLessThan(texto.indexOf(sentinela("preco")));
    expect(texto.indexOf(sentinela("preco"))).toBeLessThan(texto.indexOf(sentinela("entrega")));
  });
});

describe("a fila BLOCOS_DO_TURNO", () => {
  it("é a ordem decidida: identidade, anúncio e estilo abrem; leitura, preço e entrega seguem o funil", () => {
    // Trocar a ordem muda quem vence num conflito — o modelo pesa mais o que vem por último. É decisão
    // de produto: se este teste precisar mudar, mude junto o comentário de `blocos-do-turno.ts`.
    expect([...BLOCOS_DO_TURNO]).toEqual(["identidade", "oferta", "anuncio", "estilo", "leitura", "preco", "entrega"]);
  });

  it("não repete nome (um bloco duplicado seria anexado duas vezes)", () => {
    expect(new Set(BLOCOS_DO_TURNO).size).toBe(BLOCOS_DO_TURNO.length);
  });
});

describe("a fiação no turno", () => {
  const turno = readFileSync("lib/agent-engine/agent/inbound-turn.ts", "utf8");

  /** As chaves passadas a `comporSystemDoTurno(system, { chave: variavel, … })`, como aparecem no código. */
  function chavesDaChamada(): Record<string, string> {
    const chamada = /comporSystemDoTurno\(system,\s*\{([^}]*)\}\)/.exec(turno);
    if (chamada === null) {
      throw new Error("inbound-turn.ts não chama comporSystemDoTurno(system, { … }) — a sonda ficou cega");
    }
    return Object.fromEntries([...chamada[1]!.matchAll(/(\w+)\s*:\s*(\w+)/g)].map((m) => [m[1]!, m[2]!]));
  }

  it("chama a composição uma vez e usa o resultado como system dos dois caminhos do modelo", () => {
    expect(turno.match(/comporSystemDoTurno\(/g)).toHaveLength(1);
    expect(turno.match(/system: systemDoTurno,/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("cada chave da fila recebe o texto do SEU bloco (e nenhuma a mais, nenhuma a menos)", () => {
    expect(chavesDaChamada()).toEqual({
      identidade: "blocoDeIdentidadeDoTurno",
      oferta: "blocoDeOfertaDoTurno",
      anuncio: "blocoDoAnuncioDoTurno",
      estilo: "blocoDeVariacaoDoTurno",
      leitura: "blocoDaLeituraDoTurno",
      preco: "blocoDePrecoDoTurno",
      entrega: "blocoDaEntrega",
    });
    expect(Object.keys(chavesDaChamada()).sort()).toEqual([...BLOCOS_DO_TURNO].sort());
  });

  it("nenhum bloco é anexado ao system por fora da fila (concatenação solta reabriria a ordem)", () => {
    expect(turno).not.toMatch(/\$\{system\}\$\{/);
    expect(turno).not.toMatch(/system\s*\+\s*bloco/);
  });
});
