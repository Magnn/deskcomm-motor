import { describe, expect, it } from "vitest";

import { BLOCOS_DO_TURNO } from "@/lib/agent-engine/agent/blocos-do-turno";

import { BARALHO, CARTA_POR_ID, TAMANHO_DO_BARALHO } from "@/lib/leitura/baralho";
import { blocoDaLeitura } from "@/lib/leitura/bloco-do-prompt";
import { passoDaLeitura } from "@/lib/leitura/estado-da-leitura";
import { extrairNumerosEscolhidos, sortearCartas } from "@/lib/leitura/sorteio";

const msg = (direction: "inbound" | "outbound", body: string) => ({ direction, body });

/** O pedido do baralho fechado, como o prompt manda a agente escrever. A escolha só vale DEPOIS dele. */
const PEDIDO = msg("outbound", "Tenho 22 cartas embaralhadas agora, viradas pra baixo. Escolhe 3 números diferentes, de 1 a 22.");

describe("o baralho", () => {
  it("tem 22 cartas, ids 1..22, sem repetir", () => {
    expect(BARALHO.length).toBe(TAMANHO_DO_BARALHO);
    const ids = new Set(BARALHO.map((c) => c.id));
    expect(ids.size).toBe(22);
    for (let i = 1; i <= 22; i++) expect(ids.has(i)).toBe(true);
  });

  it("toda carta tem nome, símbolos e os 4 ângulos de sentido", () => {
    for (const c of BARALHO) {
      expect(c.nome.length).toBeGreaterThan(0);
      expect(c.simbolos.length).toBeGreaterThanOrEqual(2);
      expect(c.sentido.geral.length).toBeGreaterThan(20);
      expect(c.sentido.amor.length).toBeGreaterThan(20);
      expect(c.sentido.dinheiro.length).toBeGreaterThan(20);
      expect(c.sentido.saude.length).toBeGreaterThan(20);
    }
  });

  it("CARTA_POR_ID acha a mesma carta do array", () => {
    expect(CARTA_POR_ID.get(17)?.nome).toBe("A Torre");
  });
});

describe("extrairNumerosEscolhidos — o que a pessoa escreveu vira 3 números", () => {
  it("aceita formatos comuns", () => {
    expect(extrairNumerosEscolhidos("3, 7 e 15")).toEqual([3, 7, 15]);
    expect(extrairNumerosEscolhidos("quero a 3, a 8 e a 22")).toEqual([3, 8, 22]);
    expect(extrairNumerosEscolhidos("4 12 7")).toEqual([4, 12, 7]);
    expect(extrairNumerosEscolhidos("acho que a número 1, a 2 e a 3")).toEqual([1, 2, 3]);
  });

  it("recusa fora do baralho (1..22) e fora de 3 números distintos", () => {
    expect(extrairNumerosEscolhidos("3 e 8")).toBeNull(); // só 2
    expect(extrairNumerosEscolhidos("3, 8, 15 e 20")).toBeNull(); // 4
    expect(extrairNumerosEscolhidos("30, 40, 50")).toBeNull(); // fora do baralho
    expect(extrairNumerosEscolhidos("oi, tudo bem?")).toBeNull(); // nenhum número
    expect(extrairNumerosEscolhidos("3, 3 e 8")).toBeNull(); // repetido não conta como 3º distinto
  });
});

describe("sortearCartas — o sorteio real, feito pelo código", () => {
  it("é determinístico: mesma pessoa, mesmos números, sempre as mesmas 3 cartas", () => {
    const a = sortearCartas("lead-1", [3, 8, 15]);
    const b = sortearCartas("lead-1", [3, 8, 15]);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it("a ordem dos números escolhidos não muda o resultado (semente ordena antes)", () => {
    const a = sortearCartas("lead-1", [3, 8, 15]);
    const b = sortearCartas("lead-1", [15, 3, 8]);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it("pessoas diferentes com os mesmos números tendem a sair diferente (não é uma tabela pública)", () => {
    const a = sortearCartas("lead-1", [3, 8, 15]);
    const b = sortearCartas("lead-2", [3, 8, 15]);
    expect(a.map((c) => c.id)).not.toEqual(b.map((c) => c.id));
  });

  it("nunca repete carta dentro da mesma leitura", () => {
    const [x, y, z] = sortearCartas("lead-3", [1, 2, 3]);
    expect(new Set([x.id, y.id, z.id]).size).toBe(3);
  });

  it("recusa entrada que não seja exatamente 3 números", () => {
    expect(() => sortearCartas("lead-1", [1, 2])).toThrow();
  });

  it("é bem distribuído o bastante: 200 leads distintos não caem todos na mesma 1ª carta", () => {
    const primeiras = new Set(
      Array.from({ length: 200 }, (_, i) => sortearCartas(`lead-${i}`, [1, 2, 3])[0].id),
    );
    expect(primeiras.size).toBeGreaterThan(5);
  });
});

describe("passoDaLeitura — o passo da conversa, contado pelo código", () => {
  it("sem escolha nenhuma no histórico, não há passo (bloco fica vazio)", () => {
    expect(passoDaLeitura("lead-1", [msg("inbound", "oi, quero uma leitura")])).toBeNull();
    expect(blocoDaLeitura(null)).toBe("");
  });

  it("com a escolha, mas nenhuma carta revelada ainda: passo é revelar a carta 1", () => {
    const p = passoDaLeitura("lead-1", [PEDIDO, msg("inbound", "escolho 3, 8 e 15")]);
    expect(p?.passo).toBe("revelar_carta");
    if (p?.passo === "revelar_carta") expect(p.indice).toBe(1);
  });

  it("depois de 1 carta revelada (marcador no histórico), passo é a carta 2", () => {
    const p = passoDaLeitura("lead-1", [
      PEDIDO,
      msg("inbound", "escolho 3, 8 e 15"),
      msg("outbound", "CARTA 1: A Torre\nsentiu isso?"),
      msg("inbound", "nossa, senti sim"),
    ]);
    expect(p?.passo).toBe("revelar_carta");
    if (p?.passo === "revelar_carta") expect(p.indice).toBe(2);
  });

  it("depois das 3 reveladas, passo é causa_raiz", () => {
    const p = passoDaLeitura("lead-1", [
      PEDIDO,
      msg("inbound", "escolho 3, 8 e 15"),
      msg("outbound", "CARTA 1: X"),
      msg("outbound", "CARTA 2: Y"),
      msg("outbound", "CARTA 3: Z"),
    ]);
    expect(p?.passo).toBe("causa_raiz");
  });

  it("a escolha depois do pedido é achada, com o que vier de conversa no meio", () => {
    const p = passoDaLeitura("lead-1", [
      PEDIDO,
      msg("inbound", "não entendi"),
      msg("outbound", "Escolhe 3 números, de 1 a 22."),
      msg("inbound", "quero a 4, a 9 e a 20"),
    ]);
    expect(p?.passo).toBe("revelar_carta");
  });
});

describe("blocoDaLeitura — o molde que vai pro prompt", () => {
  it("revelar carta: leva o marcador CARTA N, o nome sorteado e os 4 ângulos, sem entregar a próxima", () => {
    const p = passoDaLeitura("lead-1", [PEDIDO, msg("inbound", "1, 2 e 3")]);
    const b = blocoDaLeitura(p);
    expect(b).toContain("REVELE A CARTA 1 DE 3");
    expect(b).toContain('CARTA 1: ');
    expect(b).toContain("Não revele a próxima carta");
    // as 3 cartas foram sorteadas (determinístico pra este seed), mas só a 1ª
    // pode aparecer nomeada no molde — as outras duas não vazam.
    const cartas = sortearCartas("lead-1", [1, 2, 3]);
    expect(b).toContain(cartas[0].nome);
    expect(b).not.toContain(cartas[1].nome);
    expect(b).not.toContain(cartas[2].nome);
  });

  it("causa raiz: cita as 3 cartas, pede extensão a saúde/dinheiro/relacionamento e liga no trabalho certo", () => {
    const p = passoDaLeitura("lead-1", [
      PEDIDO,
      msg("inbound", "1, 2 e 3"),
      msg("outbound", "CARTA 1: X"),
      msg("outbound", "CARTA 2: Y"),
      msg("outbound", "CARTA 3: Z"),
    ]);
    const b = blocoDaLeitura(p);
    expect(b).toContain("CAUSA RAIZ");
    expect(b).toContain("saúde");
    expect(b).toContain("dinheiro");
    expect(b).toContain("relacionamento");
    expect(b).toContain("já tentou");
    const cartas = sortearCartas("lead-1", [1, 2, 3]);
    for (const c of cartas) expect(b).toContain(c.nome);
  });
});

describe("passoDaLeitura — o sorteio só dispara com a escolha DEPOIS do pedido do baralho", () => {
  it("três números soltos, sem a agente ter oferecido o baralho, não disparam nada", () => {
    expect(passoDaLeitura("lead-1", [msg("inbound", "tenho 3 filhos, moro há 10 anos, ele saiu dia 15")])).toBeNull();
  });

  it("números ditos ANTES do pedido não valem; só a escolha que vem depois", () => {
    const antes = [
      msg("inbound", "tenho 3 filhos, moro há 10 anos, ele saiu dia 15"),
      PEDIDO,
      msg("inbound", "tarot"),
    ];
    expect(passoDaLeitura("lead-1", antes)).toBeNull();

    const p = passoDaLeitura("lead-1", [...antes, msg("inbound", "4, 9 e 17")]);
    expect(p?.passo).toBe("revelar_carta");
    if (p?.passo === "revelar_carta") expect(p.carta.id).toBe(sortearCartas("lead-1", [4, 9, 17])[0].id);
  });

  it("o pedido conta em qualquer das três formas do molde", () => {
    for (const pedido of ["Tenho 22 cartas viradas.", "Escolhe de 1 a 22.", "Me diz 3 números."]) {
      const p = passoDaLeitura("lead-1", [msg("outbound", pedido), msg("inbound", "2, 5 e 11")]);
      expect(p?.passo, pedido).toBe("revelar_carta");
    }
  });

  it("resposta ao pedido sem 3 números válidos não conta", () => {
    expect(passoDaLeitura("lead-1", [PEDIDO, msg("inbound", "não entendi")])).toBeNull();
    expect(passoDaLeitura("lead-1", [PEDIDO, msg("inbound", "7 e 12")])).toBeNull();
  });
});

describe("passoDaLeitura — depois que a causa raiz é dita, a leitura acabou", () => {
  const tresCartas = [
    PEDIDO,
    msg("inbound", "1, 2 e 3"),
    msg("outbound", "CARTA 1: X"),
    msg("inbound", "senti"),
    msg("outbound", "CARTA 2: Y"),
    msg("inbound", "sim"),
    msg("outbound", "CARTA 3: Z"),
  ];

  it("logo depois da 3ª carta, sem a pessoa ter respondido, ainda é a causa raiz", () => {
    expect(passoDaLeitura("lead-1", tresCartas)?.passo).toBe("causa_raiz");
  });

  it("a pessoa respondeu à 3ª carta e a agente ainda não respondeu: é o turno da causa raiz", () => {
    expect(passoDaLeitura("lead-1", [...tresCartas, msg("inbound", "faz sentido")])?.passo).toBe("causa_raiz");
  });

  it("mais bolhas do MESMO turno da 3ª carta (sem a pessoa no meio) não encerram a leitura", () => {
    const p = passoDaLeitura("lead-1", [...tresCartas, msg("outbound", "segunda bolha da mesma carta")]);
    expect(p?.passo).toBe("causa_raiz");
  });

  it("a agente já disse a causa raiz e a pessoa respondeu: o bloco some e o fluxo segue", () => {
    const depois = [
      ...tresCartas,
      msg("inbound", "faz sentido"),
      msg("outbound", "O que eu vejo é um peso que você carrega há tempo. Você se reconhece nisso?"),
      msg("inbound", "me reconheço"),
    ];
    expect(passoDaLeitura("lead-1", depois)).toBeNull();
    expect(blocoDaLeitura(passoDaLeitura("lead-1", depois))).toBe("");
  });
});

describe("passoDaLeitura — o histórico colado no painel de Teste vira conversa", () => {
  it("as cartas 2 e 3 e a causa raiz passam a ser testáveis no painel", () => {
    const colado = (ultimaDaPessoa: string, extra = "") =>
      [
        msg(
          "inbound",
          [
            "[Histórico da conversa]",
            "Lead: quero saber se minha ex volta",
            "Esmeralda: Tenho 22 cartas embaralhadas agora, viradas pra baixo. Escolhe 3 números diferentes, de 1 a 22.",
            "Lead: 4, 9 e 17",
            extra,
            `Lead: ${ultimaDaPessoa}`,
          ]
            .filter((l) => l !== "")
            .join("\n"),
        ),
      ];

    const c1 = passoDaLeitura("lead-1", colado("4, 9 e 17").slice(0, 1));
    expect(c1?.passo).toBe("revelar_carta");

    const c2 = passoDaLeitura("lead-1", colado("senti sim", "Esmeralda: CARTA 1: X"));
    expect(c2?.passo).toBe("revelar_carta");
    if (c2?.passo === "revelar_carta") expect(c2.indice).toBe(2);
  });

  it("os números escritos pela AGENTE no histórico colado não viram escolha da pessoa", () => {
    const p = passoDaLeitura("lead-1", [
      msg("inbound", "[Histórico]\nLead: tarot\nEsmeralda: Tenho 22 cartas viradas. Escolhe 3 números, de 1 a 22.\nLead: não sei"),
    ]);
    expect(p).toBeNull();
  });
});

describe("a fiação no turno", () => {
  it("o turno computa o passo e anexa o bloco da leitura antes do preço e da entrega", async () => {
    const { readFileSync } = await import("node:fs");
    const turno = readFileSync("lib/agent-engine/agent/inbound-turn.ts", "utf8");
    expect(turno).toContain("passoDaLeitura(`${tenantId}:${leadId}`, openingContext.context.messages)");
    expect(turno).toContain("blocoDaLeitura(passoDaLeituraNoTurno)");
    // O contexto do anúncio (informativo) abre a fila; os três blocos DIRETIVOS seguem na mesma
    // ordem — leitura, depois preço, depois entrega.
    expect(BLOCOS_DO_TURNO.indexOf("anuncio")).toBe(0);
    expect(BLOCOS_DO_TURNO.indexOf("leitura")).toBeLessThan(BLOCOS_DO_TURNO.indexOf("preco"));
    expect(BLOCOS_DO_TURNO.indexOf("preco")).toBeLessThan(BLOCOS_DO_TURNO.indexOf("entrega"));
    // A ligação de cada chave ao seu bloco é afirmada por inteiro em `blocos-do-turno.test.ts`.
    expect(turno).toContain("leitura: blocoDaLeituraDoTurno");
  });
});
