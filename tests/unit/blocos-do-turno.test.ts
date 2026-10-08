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
    // todas as combinações de bloco presente/ausente (2^12), com textos que têm quebra de linha, `${}` e
    // acento, que é o que um bloco real carrega. Se este teste um dia divergir, o system dos agentes em
    // produção mudou de texto sem ninguém ter decidido. (Estilo, identidade, oferta, objeções, fluxo,
    // limites e consciência entraram depois: a expressão "antiga" aqui é a fila decidida, escrita por extenso.)
    const textos = {
      identidade: "\n\nIDENTIDADE E TOM — você é a Ana\n",
      oferta: "\n\nOFERTA — use SÓ estes fatos ${z}\n",
      consciencia: "\n\nCONSCIÊNCIA DO LEAD — nível ${c}\n",
      objecoes: "\n\nOBJEÇÕES — responda no sentido de ${w}\n",
      anuncio: "\n\nCONTEXTO DO ANÚNCIO ${x}\n",
      estilo: '\n\nVARIAÇÃO DE ESTILO — não abra com "Entendi"\n',
      fluxo: "\n\nFLUXO — objetivo da etapa ${f}\n",
      leitura: "\n\nLEITURA — REVELE A CARTA 2 DE 3\n",
      preco: "\n\nPREÇO: R$ 130\n",
      combinado: "\n\nRETORNO COMBINADO ${r}\n",
      entrega: "\n\nGUIA DA ENTREGA ${y}\n",
      limites: "\n\nLIMITES — nunca diga ${k}\n",
    };
    for (let mascara = 0; mascara < 4096; mascara++) {
      const b = {
        identidade: mascara & 1 ? textos.identidade : "",
        oferta: mascara & 2 ? textos.oferta : "",
        consciencia: mascara & 4 ? textos.consciencia : "",
        objecoes: mascara & 8 ? textos.objecoes : "",
        anuncio: mascara & 16 ? textos.anuncio : "",
        estilo: mascara & 32 ? textos.estilo : "",
        fluxo: mascara & 64 ? textos.fluxo : "",
        leitura: mascara & 128 ? textos.leitura : "",
        preco: mascara & 256 ? textos.preco : "",
        entrega: mascara & 512 ? textos.entrega : "",
        limites: mascara & 1024 ? textos.limites : "",
        combinado: mascara & 2048 ? textos.combinado : "",
      };
      const antiga = `BASE${b.identidade}${b.oferta}${b.consciencia}${b.objecoes}${b.anuncio}${b.estilo}${b.fluxo}${b.leitura}${b.preco}${b.combinado}${b.entrega}${b.limites}`;
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
    expect([...BLOCOS_DO_TURNO]).toEqual(["identidade", "oferta", "consciencia", "objecoes", "anuncio", "estilo", "fluxo", "leitura", "preco", "combinado", "entrega", "limites"]);
  });

  it("os limites do dono fecham a fila: a proibição vence o funil (leitura, preço e entrega), e não o contrário", () => {
    // O modelo pesa mais o que vem por último. Se um limite ("nunca diga X") conflita com o que o funil manda,
    // o limite tem de ganhar — então ele é o ÚLTIMO bloco, depois dos três diretivos.
    expect(BLOCOS_DO_TURNO.at(-1)).toBe("limites");
    const texto = comporSystemDoTurno("B", todos());
    for (const diretivo of ["leitura", "preco", "entrega"]) {
      expect(texto.indexOf(sentinela(diretivo))).toBeLessThan(texto.indexOf(sentinela("limites")));
    }
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
      consciencia: "blocoDeConscienciaDoTurno",
      objecoes: "blocoDeObjecoesDoTurno",
      anuncio: "blocoDoAnuncioDoTurno",
      estilo: "blocoDeVariacaoDoTurno",
      fluxo: "blocoDoFluxoDoTurno",
      leitura: "blocoDaLeituraDoTurno",
      preco: "blocoDePrecoDoTurno",
      combinado: "blocoDoCombinadoDoTurno",
      entrega: "blocoDaEntrega",
      limites: "blocoDeLimitesDoTurno",
    });
    expect(Object.keys(chavesDaChamada()).sort()).toEqual([...BLOCOS_DO_TURNO].sort());
  });

  it("nenhum bloco é anexado ao system por fora da fila (concatenação solta reabriria a ordem)", () => {
    expect(turno).not.toMatch(/\$\{system\}\$\{/);
    expect(turno).not.toMatch(/system\s*\+\s*bloco/);
  });
});
