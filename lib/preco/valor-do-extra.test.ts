/**
 * O valor dito de uma cobrança avulsa é o cadastrado — os textos reais de 19/10/2026 em que a agente cobrou
 * R$ 130 por uma pergunta de R$ 5.
 */
import { describe, expect, it } from "vitest";

import type { Extra } from "./tipos";
import {
  falasDesdeAUltimaCobranca,
  palavrasDoExtra,
  quantidadeMenorQueACombinada,
  quantidadesDitas,
  valorErradoDeExtra,
  valoresDitos,
} from "./valor-do-extra";

const EXTRAS = [
  { name: "Pergunta nova", when: "x", price_cents: 500 },
  { name: "Acompanhamento do mês", when: "x", price_cents: 6000, valid_days: 30 },
  { name: "Sinastria Amorosa", when: "x", price_cents: 3700 },
] as unknown as Extra[];

describe("valor dito de cobrança avulsa", () => {
  it("⭐ os textos reais que cobraram R$ 130 por pergunta são recusados", () => {
    for (const texto of [
      "Pra abrir a mesa de novo pra essas perguntas novas, é R$ 130 por pergunta, que é pra firmar a vela no altar.",
      "Calma, meu bem. Cada pergunta nova custa R$ 130, porque é uma mesa aberta e uma vela firmada no altar pra cada uma.",
      "E antes de você decidir, quero corrigir uma coisa que saiu errada aqui: o valor de uma pergunta nova é R$ 130, não os R$ 5 que eu te passei.",
    ]) {
      const motivo = valorErradoDeExtra(texto, EXTRAS);
      expect(motivo, texto).toContain("R$ 5");
      expect(motivo).toContain("R$ 130");
    }
  });

  it("o valor certo, e múltiplos pequenos dele, passam", () => {
    expect(valorErradoDeExtra("Pra abrir a mesa de novo pra essa pergunta é R$ 5 por pergunta.", EXTRAS)).toBeNull();
    expect(valorErradoDeExtra("As três perguntas saem por R$ 15.", EXTRAS)).toBeNull();
    expect(valorErradoDeExtra("A Sinastria Amorosa é R$ 37.", EXTRAS)).toBeNull();
    expect(valorErradoDeExtra("O acompanhamento do mês sai por 60 reais.", EXTRAS)).toBeNull();
  });

  it("⭐ 23/10/2026: o produto principal com palavra em comum com uma simpatia não é recusado", () => {
    const extras = [
      ...EXTRAS,
      { name: "Simpatia de Abertura de Caminhos", when: "x", price_cents: 2700 },
      { name: "Simpatia da Prosperidade", when: "x", price_cents: 2700 },
      { name: "Simpatia de Proteção da Casa", when: "x", price_cents: 2700 },
    ] as unknown as Extra[];
    const principais = ["Abertura do Coração", "Abertura da Prosperidade", "Limpeza e Proteção", "Desbloqueio dos Caminhos"];
    for (const texto of [
      "A Abertura do Coração é R$ 130, um valor único.",
      "É pra isso que existe a Abertura da Prosperidade: são R$ 130, pagamento único.",
      "A abertura fica R$ 130 no Pix.",
      "O Desbloqueio dos Caminhos sai por R$ 130.",
      "Com a proteção firmada, são R$ 130.",
    ]) {
      expect(valorErradoDeExtra(texto, extras, principais), texto).toBeNull();
    }
    // A simpatia continua conferida pela palavra que é só dela.
    expect(valorErradoDeExtra("A simpatia sai por R$ 130.", extras, principais)).toContain("R$ 27");
    expect(valorErradoDeExtra("A simpatia sai por R$ 27.", extras, principais)).toBeNull();
    // E a pergunta, o caso que originou a trava, segue recusada.
    expect(valorErradoDeExtra("Cada pergunta nova custa R$ 130.", extras, principais)).toContain("R$ 5");
  });

  it("frase que compara com o trabalho principal não é cobrança da avulsa", () => {
    expect(valorErradoDeExtra("O trabalho completo é R$ 130, e uma pergunta nova é R$ 5.", EXTRAS)).toBeNull();
  });

  it("frase sem valor, ou valor sem a palavra da cobrança, passa", () => {
    expect(valorErradoDeExtra("Me diz qual das três perguntas você quer ver primeiro?", EXTRAS)).toBeNull();
    expect(valorErradoDeExtra("Aqui o seu fica em R$ 130, uma vez só.", EXTRAS)).toBeNull();
  });

  it("outros valores errados também são pegos: sinastria e acompanhamento", () => {
    expect(valorErradoDeExtra("A sinastria fica R$ 130 pra você.", EXTRAS)).toContain("R$ 37");
    expect(valorErradoDeExtra("O acompanhamento é R$ 99 por mês.", EXTRAS)).toContain("R$ 60");
  });

  it("instrumentos: palavras do nome e valores ditos", () => {
    expect(palavrasDoExtra("Pergunta nova")).toEqual(["pergunta"]);
    expect(palavrasDoExtra("Acompanhamento do mês")).toEqual(["acompanhamento"]);
    expect(valoresDitos("R$ 130, R$5,50, R$ 1.300 e 15 reais")).toEqual([13000, 550, 130000, 1500]);
  });

  describe("a conta fecha com a quantidade (20/10/2026: 6 perguntas cobradas como R$ 35)", () => {
    it("⭐ o texto real é recusado, com a conta certa no motivo", () => {
      const real =
        "São as 6 perguntas: 5 sobre o Almerindo e 1 sobre o Alan. Fica em R$ 35 o pacote, pagamento num código só.\n[[PIX: Pergunta nova x7]]";
      const motivo = valorErradoDeExtra(real, EXTRAS);
      expect(motivo).toContain("6");
      expect(motivo).toContain("x6");
    });

    it("⭐ marca certa e valor do pacote errado: recusa com o total certo", () => {
      const motivo = valorErradoDeExtra("São as 6 perguntas. Fica em R$ 35 o pacote.\n[[PIX: Pergunta nova x6]]", EXTRAS);
      expect(motivo).toContain("R$ 30");
      expect(motivo).toContain("R$ 35");
    });

    it("quantidade dita e valor na mesma frase: só a conta exata passa", () => {
      expect(valorErradoDeExtra("As três perguntas ficam R$ 20.", EXTRAS)).toContain("R$ 15");
      expect(valorErradoDeExtra("As três perguntas ficam R$ 15.", EXTRAS)).toBeNull();
      expect(valorErradoDeExtra("São 6 perguntas, R$ 5 cada, R$ 30 no total.", EXTRAS)).toBeNull();
    });

    it("a resposta certa com a marca passa inteira", () => {
      const certa = "Anotei as 6 perguntas. Fica R$ 30 no total, tudo num Pix só.\n[[PIX: Pergunta nova x6]]\nAssim que o pagamento cair eu vejo aqui.";
      expect(valorErradoDeExtra(certa, EXTRAS)).toBeNull();
    });

    it("comparar com o trabalho principal segue permitido", () => {
      expect(valorErradoDeExtra("O trabalho é R$ 130 e as 2 perguntas ficam R$ 10.\n[[PIX: Pergunta nova x2]]", EXTRAS)).toBeNull();
    });

    it("lê quantidade em número e por extenso", () => {
      expect(quantidadesDitas("as 6 perguntas", "pergunta")).toEqual([6]);
      expect(quantidadesDitas("três novas perguntas", "pergunta")).toEqual([3]);
      expect(quantidadesDitas("uma pergunta", "pergunta")).toEqual([1]);
    });
  });
});

describe("a quantidade combinada antes vale para a marca (30/10/2026)", () => {
  const ela = (body: string) => ({ direction: "inbound" as const, body });
  const nos = (body: string) => ({ direction: "outbound" as const, body });

  // O caso real: duas perguntas anotadas de manhã, Pix de uma à tarde.
  const conversaDoMarcio = [
    ela("quero saber se ela pensa em voltar e se já está com outra pessoa"),
    nos("Duas perguntas boas, Márcio. Anotei as duas aqui."),
    nos("As duas perguntas continuam anotadas aqui comigo."),
    ela("pode mandar o pix"),
  ];

  it("recusa a marca de uma quando a conversa combinou duas, com o total certo", () => {
    const motivo = quantidadeMenorQueACombinada("[[PIX: Pergunta nova]]", EXTRAS, conversaDoMarcio);
    expect(motivo).toContain("[[PIX: Pergunta nova x2]]");
    expect(motivo).toContain("R$ 10");
  });

  it("aceita a marca com a quantidade combinada", () => {
    expect(quantidadeMenorQueACombinada("[[PIX: Pergunta nova x2]]", EXTRAS, conversaDoMarcio)).toBeNull();
  });

  it("aceita uma quando a resposta diz que cobra só uma agora — no próprio balão ou no anterior do turno", () => {
    expect(quantidadeMenorQueACombinada("Cobro só uma agora, a outra fica guardada. [[PIX: Pergunta nova]]", EXTRAS, conversaDoMarcio)).toBeNull();
    expect(
      quantidadeMenorQueACombinada("[[PIX: Pergunta nova]]", EXTRAS, [...conversaDoMarcio, nos("Então a gente começa por uma, como você pediu.")]),
    ).toBeNull();
  });

  it("o 'só uma' de turnos passados não libera a cobrança de agora", () => {
    const conversa = [nos("Por enquanto só uma, tudo bem."), ...conversaDoMarcio];
    expect(quantidadeMenorQueACombinada("[[PIX: Pergunta nova]]", EXTRAS, conversa)).not.toBeNull();
  });

  it("a quantidade de uma cobrança anterior não conta: lê só desde a última mensagem que cobrou", () => {
    const mensagens = [nos("Suas três perguntas ficam R$ 15."), nos("Pra pagar no Pix (*R$ 15*): 000201..."), ela("e agora quero fazer mais uma pergunta")];
    const falas = falasDesdeAUltimaCobranca(mensagens);
    expect(falas.map((f) => f.body)).toEqual(["e agora quero fazer mais uma pergunta"]);
    expect(quantidadeMenorQueACombinada("[[PIX: Pergunta nova]]", EXTRAS, falas)).toBeNull();
  });

  it("cobrança que vale por período não entra na conta", () => {
    expect(quantidadeMenorQueACombinada("[[PIX: Acompanhamento do mês]]", EXTRAS, [nos("são dois acompanhamentos")])).toBeNull();
  });
});
