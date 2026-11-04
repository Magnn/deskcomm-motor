import { describe, expect, it } from "vitest";

import { conversaFalouDeExtra, ofertaPequenaDeHoje } from "./extras";
import { reclamacoesDeValor, valorQueAPessoaTem } from "./estado-da-negociacao";
import { falaErradaDoPagamento } from "./fala-do-pagamento";
import { blocoDaOfertaAtiva, ofertaAtivaDaConversa, ofertaEmConflito, oportunidadeDeOferta, ouviuOMenorValor, pediuOTrabalho } from "./oferta-ativa";
import type { Extra } from "./tipos";
import { valorErradoDeExtra } from "./valor-do-extra";

const escada = { list_price_cents: 13000, steps: [{ price_cents: 10000 }, { price_cents: 6000 }, { price_cents: 5000 }] } as never;
const pergunta = { name: "Pergunta nova", when: "x", delivery: "x", price_cents: 700, quantity_prices: [{ quantity: 2, price_cents: 1000 }] } as unknown as Extra;
const sinastria = { name: "Sinastria Amorosa", when: "x", delivery: "x", price_cents: 3700, report: { kind: "sinastria", title: "O Código da Conexão" } } as unknown as Extra;
const acompanhamento = { name: "Acompanhamento do mês", when: "x", delivery: "x", price_cents: 6000, valid_days: 30 } as unknown as Extra;
const extras = [pergunta, sinastria, acompanhamento];

const agente = (body: string) => ({ direction: "outbound", body });
const pessoa = (body: string) => ({ direction: "inbound", body });
const confere = (corpo: string, mensagens: Array<{ direction: string; body: string }>, baloesDoTurno: string[] = [], liberado = false) =>
  ofertaEmConflito(escada, extras, { corpo, baloesDoTurno, mensagens, liberado });

describe("a oferta de pé é a última dita", () => {
  it("a pequena, depois do trabalho", () => {
    expect(ofertaAtivaDaConversa(escada, extras, [agente("O trabalho é R$ 130."), agente("Uma pergunta por R$ 7, quer?")])).toEqual({
      tipo: "pequena",
      nome: "Pergunta nova",
      cents: 700,
    });
  });
  it("o trabalho, depois da pequena", () => {
    expect(ofertaAtivaDaConversa(escada, extras, [agente("Uma pergunta por R$ 7."), agente("O trabalho é R$ 130.")])).toEqual({ tipo: "trabalho", cents: 13000 });
  });
  it("referência de mercado não é oferta", () => {
    expect(ofertaAtivaDaConversa(escada, extras, [agente("Uma pergunta por R$ 7."), agente("Por aí sai entre R$ 380 e R$ 600.")])?.tipo).toBe("pequena");
  });
  it("lembrar o combinado da data não tira a pequena de pé", () => {
    expect(ofertaAtivaDaConversa(escada, extras, [agente("Uma pergunta por R$ 7."), agente("O combinado do dia 20 segue, R$ 130.")])?.tipo).toBe("pequena");
  });
  it("oferta de mais de um dia não vale", () => {
    const antiga = { ...agente("Uma pergunta por R$ 7."), sent_at: "2026-11-01T10:00:00Z" };
    expect(ofertaAtivaDaConversa(escada, extras, [antiga], new Date("2026-11-03T10:00:00Z"))).toBeNull();
  });
  it("o acompanhamento de R$ 60 tem o valor de um degrau: quem diz de qual se trata é a frase", () => {
    expect(ofertaAtivaDaConversa(escada, extras, [agente("O seu trabalho fica em R$ 60.")])).toEqual({ tipo: "trabalho", cents: 6000 });
  });
});

describe("as conversas de 01/11/2026", () => {
  it("⭐ Maria José: pagou a pergunta de R$ 7 e ouviu R$ 130 depois da terceira carta", () => {
    const conversa = [agente("São R$ 7 pra eu abrir a mesa."), pessoa("Quero"), agente("CARTA 3: O Hierofante"), pessoa("Ele é assim mesmo")];
    expect(confere("É *R$ 130*, uma vez só, sem cobrança depois.", conversa)).toContain("não pediu o trabalho");
  });
  it("⭐ Thays: pediu outra carta e ouviu os dois valores na mesma resposta", () => {
    const conversa = [agente("O trabalho é R$ 130."), pessoa("Quero outra carta")];
    expect(confere("E se você quer tirar o peso, o trabalho é outro caminho, R$ 130.", conversa, ["Isso é pergunta nova, e é R$ 7."])).toContain("Uma oferta por resposta");
    expect(confere("Isso é pergunta nova, e é R$ 7.", conversa, ["O trabalho é R$ 130, e fica de pé."])).toContain("Uma oferta por resposta");
  });
  it("⭐ Raiane: o lembrete não volta ao valor do trabalho depois da pergunta", () => {
    expect(confere("Raiane, o seu trabalho continua em *R$ 130*.", [agente("Tenho um passo pequeno, uma pergunta por R$ 7.")])).toContain("não pediu o trabalho");
  });
  it("ela pediu o trabalho: pode dizer o valor", () => {
    expect(confere("O trabalho é R$ 130.", [agente("Uma pergunta por R$ 7."), pessoa("E o trabalho, quanto é?")])).toBeNull();
    expect(pediuOTrabalho([pessoa("quero a Abertura do Coração")], ["Abertura do Coração"])).toBe(true);
  });
  it("turno com motivo próprio (data, entrada, retorno) passa", () => {
    expect(confere("O seu valor fica em R$ 130.", [agente("Uma pergunta por R$ 7."), pessoa("só recebo dia 8")], [], true)).toBeNull();
  });
  it("o combinado com a pergunta de hoje, a decisão de 31/10, segue valendo", () => {
    expect(confere("E pra hoje, uma *Pergunta nova* por R$ 7. Quer?", [pessoa("só dia 8")], ["Combinado: dia 8 eu te chamo, e o seu valor fica em R$ 130."])).toBeNull();
  });
  it("resposta sem valor do trabalho passa", () => {
    expect(confere("Entendo, meu bem. Fica com Deus.", [agente("Uma pergunta por R$ 7.")])).toBeNull();
  });
  it("⭐ Antonino: a pequena não vem antes de R$ 100 e R$ 60", () => {
    expect(confere("Existe um passo pequeno, de R$ 7.", [agente("O trabalho é R$ 130."), pessoa("Tô sem dinheiro")])).toContain("Ainda não é hora");
    expect(confere("O *Código da Conexão* é R$ 37.", [agente("Te conto o que vi."), pessoa("Entendi")])).toContain("Ainda não é hora");
  });
  it("depois do menor valor, ou se ela perguntar, a pequena pode", () => {
    expect(confere("Uma pergunta por R$ 7.", [agente("Fica em R$ 50."), pessoa("Não consigo")])).toBeNull();
    expect(confere("Isso é pergunta nova, R$ 7.", [agente("O trabalho é R$ 130."), pessoa("Ele vai voltar")])).toBeNull();
  });
  it("⭐ Hilvania: Código da Conexão a R$ 130 é recusado, na frase e no balão seguinte", () => {
    const nomes = ["Abertura do Coração"];
    expect(valorErradoDeExtra("Isso está no *Código da Conexão*, e são R$ 130, uma vez só.", extras, nomes)).toContain("R$ 37");
    expect(valorErradoDeExtra("São R$ 130, uma vez só. Quer?", extras, nomes, "No *Código da Conexão* você vê.")).toContain("R$ 37");
    expect(valorErradoDeExtra("O *Código da Conexão* é R$ 37.", extras, nomes)).toBeNull();
    expect(valorErradoDeExtra("São R$ 130, uma vez só.", extras, nomes, "Conseguiu copiar a chave?")).toBeNull();
  });
  it("oferecer o Código da Conexão pelo título já abre o bloco das cobranças", () => {
    expect(conversaFalouDeExtra([agente("Isso está no *Código da Conexão*.")], extras)).toBe(true);
  });
  it("⭐ Karla: 'se arruma uns 20' é valor que ela tem", () => {
    const conversa = [agente("O trabalho é R$ 130."), pessoa("Se arruma uns 20")];
    expect(valorQueAPessoaTem(conversa)).toBe(2000);
    expect(reclamacoesDeValor(conversa)).toBe(0);
  });
});

describe("o bloco do turno", () => {
  it("só aparece com a pequena de pé e sem motivo para falar do trabalho", () => {
    const ativa = { tipo: "pequena", nome: "Pergunta nova", cents: 700 } as const;
    expect(blocoDaOfertaAtiva(ativa, false)).toContain("R$ 7");
    expect(blocoDaOfertaAtiva(ativa, true)).toBe("");
    expect(blocoDaOfertaAtiva({ tipo: "trabalho", cents: 13000 }, false)).toBe("");
  });
});

describe("o que a agente diz do pagamento", () => {
  it("link só de cartão, sistema que não avisa, chave que não é código", () => {
    expect(falaErradaDoPagamento("No link você paga no Pix ou no cartão.", [])).toContain("cartão");
    expect(falaErradaDoPagamento("Assim que cair o sistema me avisa na hora.", [])).toContain("comprovante");
    expect(falaErradaDoPagamento("Conseguiu copiar o código do Pix?", [])).toContain("chave");
  });
  it("texto certo passa, e depois de um copia e cola 'código' é a palavra certa", () => {
    expect(falaErradaDoPagamento("Conseguiu copiar a chave?", [])).toBeNull();
    expect(falaErradaDoPagamento("Conseguiu copiar o código?", [agente("00020126360014br.gov.bcb.pix")])).toBeNull();
    expect(falaErradaDoPagamento("Esse é o Código da Conexão.", [])).toBeNull();
  });
});

describe("o relatório do casal quando ela já deu as duas datas (04/11/2026)", () => {
  const datas = pessoa("1-Valeria de Sousa gomes 15/10/1999 2-fred Silva Mendonça 06/10/2000");
  const ate60 = [datas, agente("Aqui o seu trabalho é *R$ 130*."), pessoa("não tenho"), agente("Consegui deixar por *R$ 60*, uma vez só."), pessoa("não consigo"), agente("Entendo, meu bem."), agente("Fica comigo."), agente("Sem pressa."), agente("Tô aqui.")];

  it("⭐ depois do menor valor, a porta aberta sobre ele oferece a Sinastria, não a pergunta", () => {
    expect(oportunidadeDeOferta(escada, extras, [...ate60, pessoa("será que ele ainda me ama?")])?.name).toBe("Sinastria Amorosa");
    expect(ouviuOMenorValor(escada, ate60)).toBe(true);
    expect(ofertaPequenaDeHoje(extras, ate60, true)?.nome).toBe("Sinastria Amorosa");
  });

  it("sem as duas datas, antes do menor valor, ou com a Sinastria já oferecida: segue a pergunta", () => {
    const semDatas = ate60.slice(1);
    expect(oportunidadeDeOferta(escada, extras, [...semDatas, pessoa("será que ele ainda me ama?")])?.name).toBe("Pergunta nova");
    expect(ofertaPequenaDeHoje(extras, ate60, false)?.nome).toBe("Pergunta nova");
    const jaOfereceu = [...ate60.slice(0, 5), agente("Eu faço o *Código da Conexão* de vocês dois."), ...ate60.slice(5)];
    expect(oportunidadeDeOferta(escada, extras, [...jaOfereceu, pessoa("será que ele ainda me ama?")])?.name).toBe("Pergunta nova");
  });
});
