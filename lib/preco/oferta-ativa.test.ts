import { describe, expect, it } from "vitest";

import { cobrancaDoTema, conversaFalouDeExtra, ofertaPequenaDeHoje } from "./extras";
import { reclamacoesDeValor, valorQueAPessoaTem } from "./estado-da-negociacao";
import { falaErradaDoPagamento } from "./fala-do-pagamento";
import { blocoDaOfertaAtiva, blocoDaOportunidade, comOfertasDoPosVenda, extrasPequenos, ofertaAtivaDaConversa, ofertaEmConflito, oportunidadeDaCliente, oportunidadeDeOferta, ouviuOMenorValor, pediuOTrabalho } from "./oferta-ativa";
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
  it("⭐ 24/11/2026: o restante do combinado não vira 6× de uma cobrança de R$ 15", () => {
    const foto = { name: "Sentimento da Fotografia", when: "x", delivery: "x", price_cents: 1500 } as unknown as Extra;
    const conversa = [
      agente("Aqui o seu completo é *R$ 130*, uma vez só."),
      agente("Fechado: você entra com R$ 40 amanhã e o restante de R$ 90 a gente acerta depois."),
      agente("Os R$ 40 combinados pra amanhã, dia 25, e os R$ 90 do restante ficam marcados aqui comigo."),
    ];
    expect(ofertaAtivaDaConversa(escada, [...extras, foto], conversa)).not.toMatchObject({ nome: "Sentimento da Fotografia" });
  });
  it("⭐ 22/11/2026: a entrada de R$ 15 no trabalho é a entrada, não a cobrança de R$ 15", () => {
    const foto = { name: "Sentimento da Fotografia", when: "x", delivery: "x", price_cents: 1500 } as unknown as Extra;
    expect(ofertaAtivaDaConversa(escada, [foto], [agente("O que a gente combinou segue: você entra com os R$ 15 agora no trabalho.")])).toEqual({
      tipo: "pequena",
      nome: "Entrada de hoje",
      cents: 1500,
    });
    expect(ofertaAtivaDaConversa(escada, [foto], [agente("Vou te mandar a chave da entrada de R$ 30 agora, meu bem.")])).toEqual({
      tipo: "pequena",
      nome: "Entrada de hoje",
      cents: 3000,
    });
    expect(ofertaAtivaDaConversa(escada, [foto], [agente("O seu trabalho começa com R$ 15 hoje.")])).toBeNull();
  });
  it("várias unidades contam quando a cobrança é citada", () => {
    const foto = { name: "Sentimento da Fotografia", when: "x", delivery: "x", price_cents: 1500 } as unknown as Extra;
    expect(ofertaAtivaDaConversa(escada, [foto], [agente("Olhar as duas fotos, Sentimento da Fotografia, fica R$ 30.")])).toEqual({
      tipo: "pequena",
      nome: "Sentimento da Fotografia",
      cents: 3000,
    });
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

describe("a cliente da casa que pergunta de novo da outra pessoa (06/11/2026)", () => {
  const AGORA = new Date("2026-11-06T20:00:00Z");
  const em = (iso: string, m: { direction: string; body: string }) => ({ ...m, sent_at: iso });
  const pagou = [em("2026-11-06T07:30:00Z", agente("Recebi os R$ 60, Fabiana. O seu trabalho começa hoje.")), em("2026-11-06T12:00:00Z", agente("Hoje à noite, a Noite 1."))];

  it("⭐ 'será que ele vai sentir minha falta' depois da entrega: o Código da Conexão primeiro, depois a pergunta", () => {
    const rodada = [...pagou, em("2026-11-06T19:59:00Z", pessoa("Será que ele vai sentir minha falta"))];
    expect(oportunidadeDaCliente(escada, extras, rodada, AGORA)?.name).toBe("Sinastria Amorosa");
    const jaOuviu = [em("2026-11-05T10:00:00Z", agente("Eu faço o *Código da Conexão* de vocês dois.")), ...rodada];
    expect(oportunidadeDaCliente(escada, extras, jaOuviu, AGORA)?.name).toBe("Pergunta nova");
  });

  it("uma oferta a cada 12 h, fala do trabalho não é porta, e o bloco gera desejo antes do preço", () => {
    const recente = [...pagou, em("2026-11-06T15:00:00Z", agente("O Código da Conexão de vocês sai por R$ 37.")), em("2026-11-06T16:00:00Z", agente("Tô aqui, meu bem.")), em("2026-11-06T19:59:00Z", pessoa("ela vai me desbloquear??"))];
    expect(oportunidadeDaCliente(escada, extras, recente, AGORA)).toBeNull();
    expect(oportunidadeDaCliente(escada, extras, recente, new Date("2026-11-07T04:00:00Z"))?.name).toBe("Pergunta nova");
    expect(oportunidadeDaCliente(escada, extras, [...pagou, pessoa("quantos dias tem que fazer do trabalho?")], AGORA)).toBeNull();
    const bloco = blocoDaOportunidade(sinastria, true);
    expect(bloco).toContain("O Código da Conexão");
    expect(bloco.indexOf("desejo")).toBeLessThan(bloco.indexOf("Ofereça só"));
  });
});

describe("comOfertasDoPosVenda — a oferta de pós-venda também segura a régua", () => {
  const posVenda = {
    post_sale: {
      enabled: true,
      wait_hours: 0,
      price_cents: 3500,
      product_links: [{ name: "Oração dos Sonhos", url: "https://pay.example/1" }],
      next_offers: [{ wait_hours: 0, price_cents: 4500, product_links: [{ name: "Sons Vocálicos", url: "https://pay.example/2" }] }],
    },
  } as never;

  it("o caso medido: Oração dos Sonhos por R$ 35 é a oferta de pé, não o trabalho", () => {
    const conversa = [agente("O trabalho é R$ 130."), agente("Pra quem deita e a cabeça não desliga, eu tenho a *Oração dos Sonhos*."), agente("É R$ 35, pagamento único. Quer que eu te mande?")];
    expect(ofertaAtivaDaConversa(escada, comOfertasDoPosVenda(extras, posVenda), conversa)).toEqual({ tipo: "pequena", nome: "Oração dos Sonhos", cents: 3500 });
    // Sem o pós-venda na leitura, o R$ 35 não era de ninguém e a régua voltava para a escada do trabalho.
    expect(ofertaAtivaDaConversa(escada, extras, conversa)).toEqual({ tipo: "trabalho", cents: 13000 });
  });

  it("o turno comum usa a mesma lista: oferecer o trabalho por cima da Oração dos Sonhos é recusado", () => {
    const conversa = [agente("Pra quem deita e a cabeça não desliga, eu tenho a *Oração dos Sonhos*."), agente("É R$ 35, pagamento único. Quer que eu te mande?")];
    const comPosVenda = comOfertasDoPosVenda(extras, posVenda);
    expect(ofertaEmConflito(escada, comPosVenda, { corpo: "O seu trabalho continua em *R$ 100*.", baloesDoTurno: [], mensagens: conversa, liberado: false })).not.toBeNull();
    // Sem o pós-venda na lista, o mesmo corpo passava.
    expect(ofertaEmConflito(escada, extras, { corpo: "O seu trabalho continua em *R$ 100*.", baloesDoTurno: [], mensagens: conversa, liberado: false })).toBeNull();
  });

  it("pós-venda desligado não acrescenta nada", () => {
    expect(comOfertasDoPosVenda(extras, { post_sale: { enabled: false } } as never)).toHaveLength(extras.length);
    expect(comOfertasDoPosVenda(extras, posVenda).map((e) => e.name)).toEqual([...extras.map((e) => e.name), "Oração dos Sonhos", "Sons Vocálicos"]);
  });
});

describe("a cobrança do tema dela vence a mais barata (23/11/2026)", () => {
  const recado = { name: "Recado do Coração", when: "x", price_cents: 1500, themes: ["o que eu falo", "mando mensagem"] } as unknown as Extra;
  const filhos = { name: "Proteção dos Filhos", when: "x", price_cents: 4700, themes: ["meu filho", "minha filha"] } as unknown as Extra;
  const casal = { ...sinastria, themes: ["esfriou", "sumiu", "frio comigo"] } as Extra;
  const comTemas = [pergunta, recado, filhos, casal];
  const ouviuPreco = [agente("Aqui o seu trabalho é *R$ 130*."), pessoa("não dá"), agente("Fica comigo."), agente("Sem pressa."), agente("Tô aqui."), agente("Me conta.")];

  it("⭐ ela fala do filho: a porta aberta oferece a Proteção dos Filhos, não a de R$ 7", () => {
    const m = [pessoa("é o meu filho que me preocupa"), ...ouviuPreco, pessoa("será que ele vai sair dessa?")];
    expect(oportunidadeDeOferta(escada, comTemas, m)?.name).toBe("Proteção dos Filhos");
  });

  it("o assunto mais novo vence o do começo, palavra inteira e sem acento", () => {
    const m = [pessoa("meu filho brigou comigo"), pessoa("e ele esfriou do nada, o que será?")];
    expect(cobrancaDoTema(comTemas, m)?.name).toBe("Sinastria Amorosa");
    expect(cobrancaDoTema(comTemas, [pessoa("O QUE EU FALO pra ele?")])?.name).toBe("Recado do Coração");
    expect(cobrancaDoTema(comTemas, [pessoa("fiquei esfriando a cabeça")])).toBeNull();
    expect(cobrancaDoTema(comTemas, [agente("meu filho"), pessoa("oi")])).toBeNull();
  });

  it("sem palavras cadastradas, nada muda: segue a primeira da lista", () => {
    const m = [pessoa("é o meu filho"), ...ouviuPreco, pessoa("será que ele vai sair dessa?")];
    expect(oportunidadeDeOferta(escada, extras, m)?.name).toBe("Pergunta nova");
  });

  it("cliente da casa: o tema primeiro, e o casal já oferecido não volta", () => {
    const AGORA = new Date("2026-11-23T20:00:00Z");
    const em = (iso: string, m: { direction: string; body: string }) => ({ ...m, sent_at: iso });
    const base = [em("2026-11-23T07:00:00Z", agente("Recebi o seu Pix, o trabalho começa hoje."))];
    expect(oportunidadeDaCliente(escada, comTemas, [...base, em("2026-11-23T19:59:00Z", pessoa("e a minha filha, será que ela volta a falar comigo?"))], AGORA)?.name).toBe("Proteção dos Filhos");
    const jaOuviuCasal = [em("2026-11-22T07:00:00Z", agente("Eu faço o *Código da Conexão* de vocês.")), ...base, em("2026-11-23T19:59:00Z", pessoa("ele sumiu de novo, por que ele faz isso?"))];
    expect(oportunidadeDaCliente(escada, comTemas, jaOuviuCasal, AGORA)?.name).toBe("Pergunta nova");
  });

  it("a oferta de hoje é a do tema, e a já falada dá a vez à seguinte", () => {
    expect(ofertaPequenaDeHoje(comTemas, [pessoa("não sei o que eu falo pra ele")])?.nome).toBe("Recado do Coração");
    expect(ofertaPequenaDeHoje(comTemas, [agente("Uma pergunta nova sai por R$ 7."), pessoa("hoje não")])?.nome).toBe("Recado do Coração");
  });
});

describe("a oferta de hoje de quem dá a data (24/11/2026)", () => {
  const foto = { name: "Sentimento da Fotografia", when: "x", price_cents: 1500, themes: ["foto", "na foto"] } as unknown as Extra;
  const casamento = { name: "Reconstrução do Casamento", when: "x", price_cents: 6000, themes: ["meu marido"] } as unknown as Extra;
  const lista = [pergunta, foto, casamento];

  it("⭐ sem tema que case, sai a primeira da lista do operador, não a mais barata que pede foto", () => {
    const m = [pessoa("voltaria com ele"), agente("O seu trabalho é *R$ 130*."), pessoa("só dia 30")];
    expect(ofertaPequenaDeHoje(extrasPequenos(escada, lista), m)?.nome).toBe("Pergunta nova");
  });

  it("⭐ só as pequenas: o tema que casa com uma cobrança do tamanho do trabalho não vira a oferta de hoje", () => {
    const m = [pessoa("é o meu marido"), agente("O seu trabalho é *R$ 130*."), pessoa("só dia 30")];
    expect(extrasPequenos(escada, lista).map((e) => e.name)).not.toContain("Reconstrução do Casamento");
    expect(ofertaPequenaDeHoje(extrasPequenos(escada, lista), m)?.nome).toBe("Pergunta nova");
    expect(ofertaPequenaDeHoje(extrasPequenos(escada, lista), [pessoa("olha essa foto dele"), ...m])?.nome).toBe("Sentimento da Fotografia");
  });
});
