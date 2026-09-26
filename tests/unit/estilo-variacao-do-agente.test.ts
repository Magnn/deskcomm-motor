import { describe, expect, it } from "vitest";

import { blocoDeVariacao, lerRepeticoesDaAgente } from "@/lib/estilo/variacao-do-agente";
import { passoDaLeitura } from "@/lib/leitura/estado-da-leitura";

/**
 * A camada universal de estilo: o código lê o que a agente já repetiu e lista o que evitar agora.
 *
 * O que estes testes prendem, em ordem de importância:
 *   1. o TURNO DE MOLDE nunca entra na conta — o marcador "CARTA 1:" repete a abertura por
 *      construção, e a máquina de estado da leitura o procura na mensagem. Mandar a agente variá-lo
 *      quebraria o protocolo;
 *   2. sem repetição o bloco é '' (o system do turno segue idêntico — a maioria dos turnos);
 *   3. cada uma das cinco repetições é detectada, e a vizinha inocente NÃO é (controles).
 */

const ela = (body: string) => ({ direction: "outbound", body });
const pessoa = (body: string) => ({ direction: "inbound", body });

/** Uma conversa em turnos: a pessoa fala, ela responde — na ordem em que as duas listas vêm. */
function conversa(pares: ReadonlyArray<readonly [string, string | readonly string[]]>) {
  return pares.flatMap(([p, r]) => [pessoa(p), ...(Array.isArray(r) ? r : [r]).map(ela)]);
}

describe("sem repetição, o bloco é vazio", () => {
  it("uma conversa que varia abertura, fecho e emoji não gera bloco", () => {
    const msgs = conversa([
      ["oi", "Oi! Tudo bem? Me conta o que te trouxe aqui."],
      ["quero saber do valor", "O trabalho custa R$ 130. Cobre a leitura completa."],
      ["e como funciona", "Você escolhe três números e eu mostro o que aparece para cada um."],
      ["ok vou pensar", "Sem pressa. Se quiser, é só chamar."],
    ]);
    expect(lerRepeticoesDaAgente(msgs)).toBeNull();
    expect(blocoDeVariacao(msgs)).toBe("");
  });

  it("com menos de dois turnos dela não há do que reclamar", () => {
    expect(blocoDeVariacao([pessoa("oi"), ela("Entendi!")])).toBe("");
    expect(blocoDeVariacao([])).toBe("");
  });

  it("corpo nulo ou marcador de mídia não quebra nem conta como fala", () => {
    const msgs = [
      pessoa("oi"),
      { direction: "outbound", body: null },
      ela("[áudio]"),
      ela("Olá!"),
      pessoa("tudo bem?"),
      ela("Tudo ótimo por aqui."),
    ];
    expect(() => blocoDeVariacao(msgs)).not.toThrow();
    expect(blocoDeVariacao(msgs)).toBe("");
  });
});

describe("aberturas repetidas", () => {
  it("a mesma primeira palavra em 2 dos 3 últimos turnos é apontada", () => {
    const msgs = conversa([
      ["oi", "Bom dia! Como posso chamar você?"],
      ["Marina", "Entendi, Marina. E o que aconteceu?"],
      ["terminei um namoro", "Entendi. Isso pesa mesmo."],
      ["pois é", "Entendi. Quer conversar sobre isso?"],
    ]);
    const r = lerRepeticoesDaAgente(msgs);
    expect(r?.aberturas).toEqual(["Entendi"]);
    expect(blocoDeVariacao(msgs)).toContain('Não abra de novo com "Entendi"');
  });

  it("os balões do MESMO turno contam como um turno só (3 balões abrindo igual não é repetição)", () => {
    const msgs = conversa([
      ["oi", "Olá!"],
      ["quero a leitura", ["Claro.", "Claro, faço agora.", "Claro que sim."]],
      ["ótimo", "Vamos lá então."],
    ]);
    expect(lerRepeticoesDaAgente(msgs)?.aberturas ?? []).toEqual([]);
  });

  it("palavra de ligação que abre frase (E, Que, Você, Mas) não é tique", () => {
    const msgs = conversa([
      ["a", "E como foi isso?"],
      ["b", "E depois?"],
      ["c", "E ele voltou?"],
      ["d", "Você quer continuar?"],
    ]);
    expect(lerRepeticoesDaAgente(msgs)?.aberturas ?? []).toEqual([]);
  });

  it("emoji e aspas na frente da mensagem não escondem a primeira palavra", () => {
    const msgs = conversa([
      ["a", "🙏 Perfeito, anotei."],
      ["b", "“Perfeito”, vamos seguir."],
      ["c", "Perfeito! E agora?"],
    ]);
    expect(lerRepeticoesDaAgente(msgs)?.aberturas).toEqual(["Perfeito"]);
  });
});

describe("frases feitas de atendente", () => {
  it("'com certeza' em 2 dos 4 últimos turnos é apontada, sem depender de acento ou caixa", () => {
    const msgs = conversa([
      ["a", "Com certeza, posso explicar."],
      ["b", "O valor é R$ 130."],
      ["c", "Podemos começar quando quiser, com CERTEZA absoluta."],
      ["d", "Combinado."],
    ]);
    expect(lerRepeticoesDaAgente(msgs)?.frasesFeitas).toContain("com certeza");
    expect(blocoDeVariacao(msgs)).toContain('"com certeza"');
  });

  it("dita UMA vez é educação, não tique", () => {
    const msgs = conversa([
      ["a", "Com certeza, posso explicar."],
      ["b", "O valor é R$ 130."],
      ["c", "Podemos começar quando quiser."],
    ]);
    expect(lerRepeticoesDaAgente(msgs)?.frasesFeitas ?? []).toEqual([]);
  });

  it("reconhece a forma sem acento e sem pontuação ('fico a disposicao')", () => {
    const msgs = conversa([
      ["a", "Fico à disposição."],
      ["b", "Qualquer coisa, fico a disposicao!"],
      ["c", "Tudo certo."],
    ]);
    expect(lerRepeticoesDaAgente(msgs)?.frasesFeitas).toContain("fico à disposição");
  });
});

describe("fecho repetido", () => {
  it("a mesma pergunta de fecho, quase igual, é citada de volta", () => {
    const msgs = conversa([
      ["a", "O ritual dura sete dias. Quer que eu te explique melhor?"],
      ["b", "Cada dia tem uma etapa curta. Quer que eu explique melhor?"],
      ["c", "Você recebe tudo por escrito. Quer que eu te explique melhor?"],
    ]);
    const r = lerRepeticoesDaAgente(msgs);
    expect(r?.fecho).toBe("Quer que eu te explique melhor?");
    expect(blocoDeVariacao(msgs)).toContain('Não feche de novo com algo como "Quer que eu te explique melhor?"');
  });

  it("fechos diferentes não são repetição", () => {
    const msgs = conversa([
      ["a", "O ritual dura sete dias. Quer que eu explique melhor?"],
      ["b", "Cada dia tem uma etapa curta. Posso te mandar o resumo."],
      ["c", "Você recebe tudo por escrito, no mesmo dia."],
    ]);
    expect(lerRepeticoesDaAgente(msgs)?.fecho ?? null).toBeNull();
  });

  it("o exemplo citado tem teto e nunca leva aspas duplas (ele vai entre aspas no bloco)", () => {
    const longa =
      'Se ficou alguma dúvida sobre "qualquer parte" do processo, me diga agora mesmo, com toda a calma do mundo, e eu explico de novo?';
    const msgs = conversa([
      ["a", `Tudo bem. ${longa}`],
      ["b", `Certo. ${longa}`],
    ]);
    const bloco = blocoDeVariacao(msgs);
    expect(bloco).toContain("Não feche de novo");
    const exemplo = /algo como "([^\n]*)"\. Feche/.exec(bloco)?.[1] ?? "";
    expect(exemplo.length).toBeLessThanOrEqual(81);
    expect(exemplo).not.toContain('"');
  });
});

describe("emoji", () => {
  it("o mesmo emoji em 3 dos 4 últimos turnos é apontado (a pessoa usa emoji, então não é o caso do 'nenhum')", () => {
    const msgs = conversa([
      ["oi 😀", "Que bom te ver por aqui 😊"],
      ["conta 🙏", "Entendi o que você sente 😊"],
      ["sim", "O valor é R$ 130."],
      ["vamos", "Vamos começar hoje 😊"],
    ]);
    const r = lerRepeticoesDaAgente(msgs);
    expect(r?.semEmojiPelaPessoa).toBe(false);
    expect(r?.emojis).toEqual(["😊"]);
    expect(blocoDeVariacao(msgs)).toContain("Não use de novo 😊.");
  });

  it("emoji em quase todo turno com a pessoa sem usar nenhum → 'não use nenhum'", () => {
    const msgs = conversa([
      ["a", "Olá 🌟"],
      ["b", "Conte mais 🙏"],
      ["c", "Entendo ✨"],
      ["d", "Vamos lá 🌙"],
    ]);
    const r = lerRepeticoesDaAgente(msgs);
    expect(r?.semEmojiPelaPessoa).toBe(true);
    expect(blocoDeVariacao(msgs)).toContain("A pessoa não usa emoji: não use nenhum.");
  });

  it("quando a PESSOA usa emoji, usar de volta não é o defeito", () => {
    const msgs = conversa([
      ["oi 😀", "Olá 🌟"],
      ["conta 🙏", "Conte mais 🙏"],
      ["sim ✨", "Entendo ✨"],
      ["vamos 😀", "Vamos lá 🌙"],
    ]);
    expect(lerRepeticoesDaAgente(msgs)?.semEmojiPelaPessoa ?? false).toBe(false);
  });
});

describe("terminar sempre em pergunta", () => {
  it("os 3 últimos turnos terminando em '?' são apontados", () => {
    const msgs = conversa([
      ["a", "Fico feliz em ajudar. Qual é o seu maior desafio hoje?"],
      ["b", "Entendo como isso pesa. Há quanto tempo você sente isso?"],
      ["c", "Faz sentido. Você já tentou algo antes?"],
    ]);
    expect(lerRepeticoesDaAgente(msgs)?.sempreTerminaEmPergunta).toBe(true);
    expect(blocoDeVariacao(msgs)).toContain("Não termine com pergunta desta vez");
  });

  it("um turno que afirma no meio desfaz a sequência", () => {
    const msgs = conversa([
      ["a", "Qual é o seu maior desafio hoje?"],
      ["b", "Entendo. Vou te mostrar como funciona."],
      ["c", "Você já tentou algo antes?"],
    ]);
    expect(lerRepeticoesDaAgente(msgs)?.sempreTerminaEmPergunta ?? false).toBe(false);
  });

  it("emoji depois do '?' não esconde a pergunta", () => {
    const msgs = conversa([
      ["a", "Posso continuar? 😊"],
      ["b", "Faz sentido? 🙏"],
      ["c", "Vamos? ✨"],
    ]);
    expect(lerRepeticoesDaAgente(msgs)?.sempreTerminaEmPergunta).toBe(true);
  });
});

describe("o turno de molde fica FORA da conta", () => {
  const cartas = conversa([
    ["4, 9 e 17", "CARTA 1: A Estrela — esperança depois da queda."],
    ["senti sim", "CARTA 2: O Eremita — você está se recolhendo."],
    ["continua", "CARTA 3: A Força — o que segura você é você."],
  ]);

  it("'CARTA' abrindo 3 turnos seguidos NÃO é apontada — o marcador é a máquina de estado quem lê", () => {
    expect(lerRepeticoesDaAgente(cartas)).toBeNull();
    expect(blocoDeVariacao(cartas)).toBe("");
  });

  it("nem misturada a conversa livre: o marcador nunca aparece na lista do que evitar", () => {
    const msgs = [
      ...conversa([
        ["oi", "Entendi. Me conta o que houve."],
        ["terminei", "Entendi. Isso pesa mesmo."],
      ]),
      ...cartas,
    ];
    const bloco = blocoDeVariacao(msgs);
    expect(bloco).toContain('Não abra de novo com "Entendi"');
    // O rodapé fixo cita "CARTA 1:" para EXPLICAR a regra; o que não pode é o marcador entrar na
    // LISTA do que evitar, que é tudo o que vem antes dele.
    const listaDoQueEvitar = bloco.split("Isto é só estilo.")[0]!;
    expect(listaDoQueEvitar).not.toMatch(/CARTA/);
  });

  it("o bloco não altera o que a máquina de estado da leitura enxerga (módulos independentes)", () => {
    // O passo da leitura sai das mensagens, não do prompt: o estilo não pode mudar a contagem.
    const antes = passoDaLeitura("lead-1", conversa([
      ["tarot", "Tenho 22 cartas viradas. Escolhe 3 números, de 1 a 22."],
      ["4, 9 e 17", "CARTA 1: A Estrela."],
    ]));
    blocoDeVariacao(cartas);
    const depois = passoDaLeitura("lead-1", conversa([
      ["tarot", "Tenho 22 cartas viradas. Escolhe 3 números, de 1 a 22."],
      ["4, 9 e 17", "CARTA 1: A Estrela."],
    ]));
    expect(depois).toEqual(antes);
  });
});

describe("o texto do bloco", () => {
  const msgs = conversa([
    ["a", "Entendi! Com certeza posso ajudar. Quer que eu te explique melhor?"],
    ["b", "Entendi! Com certeza, fica tranquila. Quer que eu explique melhor?"],
    ["c", "Entendi! Vamos seguir. Quer que eu te explique melhor?"],
  ]);

  it("começa com a linha em branco dupla dos outros blocos e diz que molde literal manda", () => {
    const bloco = blocoDeVariacao(msgs);
    expect(bloco.startsWith("\n\nVARIAÇÃO DE ESTILO")).toBe(true);
    expect(bloco).toContain("Isto é só estilo. Qualquer molde literal deste prompt");
    expect(bloco).toContain('marcador como "CARTA 1:"');
  });

  it("é determinístico: as mesmas mensagens dão o mesmo bloco", () => {
    expect(blocoDeVariacao(msgs)).toBe(blocoDeVariacao([...msgs]));
  });

  it("tem tamanho contido, qualquer que seja a repetição (é prompt pago a cada turno)", () => {
    expect(blocoDeVariacao(msgs).length).toBeLessThan(900);
  });

  it("um histórico colado no painel de Teste ('Lead:'/'Esmeralda:') também é lido", () => {
    const colado = [
      pessoa(
        [
          "[Histórico]",
          "Lead: oi",
          "Esmeralda: Entendi! Me conta.",
          "Lead: terminei",
          "Esmeralda: Entendi! Isso pesa.",
          "Lead: pois é",
          "Esmeralda: Entendi! Quer falar?",
        ].join("\n"),
      ),
    ];
    expect(lerRepeticoesDaAgente(colado)?.aberturas).toEqual(["Entendi"]);
  });
});
