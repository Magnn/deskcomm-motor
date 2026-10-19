/**
 * A PERGUNTA PAGA ABRE UMA RODADA NOVA DA LEITURA (medido em 19/10/2026: com a leitura grátis encerrada, o motor
 * dizia "NUNCA revele outra carta" enquanto a cobrança paga mandava abrir as cartas; a agente se perdia).
 */
import { describe, expect, it } from "vitest";

import { abreLeitura, perguntaPagaRecente } from "@/lib/preco/extras";
import type { Extra } from "@/lib/preco/tipos";

import { blocoDaLeitura } from "./bloco-do-prompt";
import { passoDaLeitura } from "./estado-da-leitura";

const sai = (body: string, sent_at: string) => ({ direction: "outbound", body, sent_at });
const chega = (body: string, sent_at: string) => ({ direction: "inbound", body, sent_at });

/** A leitura grátis inteira (pedido, números, 3 cartas, causa raiz), de manhã. */
const LEITURA_GRATIS = [
  sai("Estou com as 22 cartas na mesa. Escolhe 3 números diferentes, de 1 a 22.", "2026-10-19T12:00:00Z"),
  chega("3 9 14", "2026-10-19T12:01:00Z"),
  sai("CARTA 1: O Mago\nVocê tem as ferramentas.", "2026-10-19T12:02:00Z"),
  chega("nossa", "2026-10-19T12:03:00Z"),
  sai("CARTA 2: A Lua\nO que não se vê.", "2026-10-19T12:04:00Z"),
  chega("sim", "2026-10-19T12:05:00Z"),
  sai("CARTA 3: O Sol\nClareza chegando.", "2026-10-19T12:06:00Z"),
  chega("faz sentido", "2026-10-19T12:07:00Z"),
  sai("A causa raiz é o medo de perder.", "2026-10-19T12:08:00Z"),
  chega("e agora?", "2026-10-19T12:09:00Z"),
  sai("Posso te mostrar o caminho.", "2026-10-19T12:10:00Z"),
];
const PAGOU_AS = new Date("2026-10-19T20:13:00Z");
const DEPOIS_DO_PAGAMENTO = [
  sai("O seu pagamento caiu. Me manda 3 números diferentes, de 1 a 22, pra abrir a mesa dessa pergunta.", "2026-10-19T20:14:00Z"),
  chega("5 7 22", "2026-10-19T20:15:00Z"),
];

const EXTRAS = [
  { name: "Pergunta nova", when: "x", price_cents: 500 },
  { name: "Sinastria Amorosa", when: "x", price_cents: 3700 },
  { name: "Acompanhamento do mês", when: "x", price_cents: 6000, valid_days: 30 },
] as unknown as Extra[];

describe("pergunta paga: rodada própria da leitura", () => {
  it("controle: sem a rodada paga, a leitura grátis está encerrada e proíbe carta nova", () => {
    const passo = passoDaLeitura("org:lead", [...LEITURA_GRATIS, ...DEPOIS_DO_PAGAMENTO]);
    expect(passo?.passo).toBe("encerrada");
    expect(blocoDaLeitura(passo)).toContain("NUNCA revele outra carta");
  });

  it("⭐ contada a partir do pagamento: os números novos abrem a CARTA 1 da pergunta paga", () => {
    const passo = passoDaLeitura("org:lead:paga", [...LEITURA_GRATIS, ...DEPOIS_DO_PAGAMENTO], PAGOU_AS);
    expect(passo).toMatchObject({ passo: "revelar_carta", indice: 1 });
    const bloco = blocoDaLeitura(passo, { nome: "Pergunta nova" });
    expect(bloco).toContain("PERGUNTA PAGA (*Pergunta nova*) — REVELE A CARTA 1");
    expect(bloco).toContain("mesmo que o roteiro diga");
    expect(bloco).not.toContain("NUNCA revele outra carta");
  });

  it("antes de ela escolher os números da rodada paga, não há passo (nada proíbe pedir os números)", () => {
    const passo = passoDaLeitura("org:lead:paga", [...LEITURA_GRATIS, DEPOIS_DO_PAGAMENTO[0]!], PAGOU_AS);
    expect(passo).toBeNull();
  });

  it("depois das 3 cartas pagas: a resposta da pergunta, sem trabalho; depois, outra pergunta é cobrança nova", () => {
    const cartasPagas = [
      sai("CARTA 1: A Estrela\n…", "2026-10-19T20:16:00Z"),
      chega("ok", "2026-10-19T20:17:00Z"),
      sai("CARTA 2: A Torre\n…", "2026-10-19T20:18:00Z"),
      chega("ok", "2026-10-19T20:19:00Z"),
      sai("CARTA 3: O Mundo\n…", "2026-10-19T20:20:00Z"),
      chega("e então?", "2026-10-19T20:21:00Z"),
    ];
    const resposta = passoDaLeitura("org:lead:paga", [...LEITURA_GRATIS, ...DEPOIS_DO_PAGAMENTO, ...cartasPagas], PAGOU_AS);
    expect(resposta?.passo).toBe("causa_raiz");
    expect(blocoDaLeitura(resposta, { nome: "Pergunta nova" })).toContain("RESPONDA a pergunta que ela pagou");
    const fim = passoDaLeitura(
      "org:lead:paga",
      [...LEITURA_GRATIS, ...DEPOIS_DO_PAGAMENTO, ...cartasPagas, sai("As cartas mostram…", "2026-10-19T20:22:00Z"), chega("obrigada", "2026-10-19T20:23:00Z"), sai("De nada", "2026-10-19T20:24:00Z")],
      PAGOU_AS,
    );
    expect(fim?.passo).toBe("encerrada");
    expect(blocoDaLeitura(fim, { nome: "Pergunta nova" })).toContain("cobre de novo");
  });

  it("quem abre leitura: a pergunta (pelo nome ou explícito); sinastria e acompanhamento não", () => {
    expect(abreLeitura({ name: "Pergunta nova" })).toBe(true);
    expect(abreLeitura({ name: "Sinastria Amorosa" })).toBe(false);
    expect(abreLeitura({ name: "Consulta extra", opens_reading: true })).toBe(true);
    expect(abreLeitura({ name: "Pergunta escrita em PDF", opens_reading: false })).toBe(false);
  });

  it("a pergunta paga recente vale por um dia; a mais recente vence; período e outros extras não contam", () => {
    const agora = new Date("2026-10-19T20:30:00Z");
    const r = perguntaPagaRecente(EXTRAS, [{ slug: "pergunta-nova", hora: "15:13", dia: "19/10", minutosAtras: 17, diasAtras: 0 }], agora);
    expect(r?.extra.name).toBe("Pergunta nova");
    expect(r!.pagoEm.getTime()).toBe(agora.getTime() - 18 * 60_000);
    expect(perguntaPagaRecente(EXTRAS, [{ slug: "pergunta-nova", hora: "10:00", dia: "18/10", minutosAtras: 1700, diasAtras: 1 }], agora)).toBeNull();
    expect(perguntaPagaRecente(EXTRAS, [{ slug: "sinastria-amorosa", hora: "15:13", minutosAtras: 5, diasAtras: 0 }], agora)).toBeNull();
  });
});
