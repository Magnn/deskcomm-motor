/**
 * "NÃO QUERO MAIS SER ATENDIDA" — o pedido de parar o ATENDIMENTO, dito por extenso.
 *
 * Medido em produção em 10/10/2026: a frase da primeira lista não casava regra nenhuma, e a pessoa
 * recebeu mais oito mensagens. A segunda lista é o outro lado, e é o que impede o conserto de virar
 * defeito: num atendimento sobre a vida de quem escreve, "desistir", "parar" e "não quero mais falar
 * com ele" são o assunto da conversa. Todas as frases dela saíram de conversas reais do mesmo dia.
 */
import { describe, expect, it } from "vitest";

import { ehOptOutProvavel, ehPedidoDeOptOut, ehRecusaDaOferta } from "@/lib/opt-out/deteccao";

const PEDE_PARA_PARAR = [
  "não quero mais ser atendida",
  "não quero mais falar com vocês",
  "Por favor por gentileza tem como você sair eu não quero mais falar com vocês e desculpa aí alguma coisa",
  "pode parar o atendimento",
  "quero encerrar o atendimento",
  "parar atendimento",
  "Parar atendimento",
  "não quero continuar a conversa",
  "não quero mais conversar com vc",
  "nao quero atendimento",
];

const ESTA_CONVERSANDO = [
  "não quero mais falar com ele",
  "vou desistir dele",
  "Mas as vezes acho melhor parar",
  "Que não devo desistir",
  "E desistir",
  "Preciso desistir e da chance pra um novo amor",
  "Não, não vou desistir não, porque eu sei que ele gosta de mim, né?",
  "não quero continuar nesse relacionamento",
  "ele parou de falar comigo",
  "não quero mais conversar com meu marido",
  "ele não quer mais falar comigo",
  "ele disse que não quer mais conversa comigo",
  "Mas eu quero muito sair disso",
  "Mas todos dizem Que devo sair pra distrair",
  "como funciona o atendimento?",
  "quero continuar o atendimento",
  "meu atendimento foi ótimo",
  "não quero parar",
  "não quero parar o atendimento",
  "como parar o atendimento depois?",
  "tem como parar a dor?",
  "não tenho interesse nesse plano",
  // 29/10/2026, conversas reais: a cliente falava do homem dela — e a segunda frase gravou `is_blocked`.
  "Mas eu preciso tirar o Gustavo do meu pensamento e parar de insistir no fundo do meu coração",
  "para de insistir nele, amiga",
];

/**
 * RECUSA DA OFERTA — 29/10/2026. "Não tenho mais interesse" estava na lista de cima e silenciou a
 * cliente com "Encerro os envios automáticos deste canal"; quatro minutos depois ela escreveu "não
 * precisa me cancelar, quero continuar fazendo consultas". Recusar o trabalho não é pedir para parar.
 */
const RECUSA_DA_OFERTA = [
  "não tenho mais interesse",
  "eu estou lhe dizendo que não tenho mais interesse a fazer o trabalho",
  "não me interessa mais",
  "já disse que não quero",
  "ya no me interesa",
];

describe("pedido de parar o atendimento, por extenso", () => {
  it.each(PEDE_PARA_PARAR)("⭐ para de responder e chama uma pessoa: %s", (frase) => {
    expect(ehOptOutProvavel(frase)).toBe(true);
  });

  it.each(PEDE_PARA_PARAR)("não BLOQUEIA sozinho — quem silencia para sempre é a pessoa: %s", (frase) => {
    expect(ehPedidoDeOptOut(frase)).toBe(false);
  });

  it.each(RECUSA_DA_OFERTA)("⭐ recusa não encerra a conversa nem bloqueia: %s", (frase) => {
    expect(ehRecusaDaOferta(frase)).toBe(true);
    expect(ehOptOutProvavel(frase)).toBe(false);
    expect(ehPedidoDeOptOut(frase)).toBe(false);
  });

  it("pedido de parar continua parando — recusa não engole opt-out", () => {
    expect(ehOptOutProvavel("não tenho mais interesse, pare de me mandar mensagem")).toBe(true);
    expect(ehPedidoDeOptOut("não tenho mais interesse, pare de me mandar mensagem")).toBe(true);
  });

  it.each(ESTA_CONVERSANDO)("⭐ segue a conversa — a palavra é o assunto, não um pedido: %s", (frase) => {
    expect(ehOptOutProvavel(frase)).toBe(false);
  });
});
