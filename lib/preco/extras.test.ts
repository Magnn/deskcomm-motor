/**
 * COBRANÇAS AVULSAS — a marca, o bloco, a troca pelo Pix e a trava de valor mínimo.
 *
 * O que não pode acontecer:
 *   1. a marca crua `[[PIX: …]]` chegar à pessoa (cobrança que não saiu, nome desconhecido, turno sem extras);
 *   2. o valor do extra ser vetado pelo piso do produto principal — era por isso que o agente não cobrava;
 *   3. liberar o extra abrir o piso: "faço o trabalho por R$ 20" continua vetado.
 */
import { describe, expect, it, vi } from "vitest";

import { pixDoExtraNoLugarDaMarca } from "@/lib/agent-engine/agent/pix-do-extra-no-envio";
import { ehCodigoDoPix, splitIntoBubbles } from "@/lib/agent-engine/agent/split-message";
import { decidePromise } from "@/lib/agent-engine/guardrails/promise/engine";
import { ErroDaStripe } from "@/lib/pagamentos/stripe";

import { tabelaDoTurno } from "./estado-da-negociacao";
import { blocoDosExtras, corpoComPixDoExtra, extrasDaConfig, marcaDeExtraNoCorpo, referenciaDoExtra, slugDoExtra } from "./extras";
import { pricingSchema } from "./tipos";

const PERGUNTA = { name: "Pergunta nova", price_cents: 1500, when: "a pessoa pede outra pergunta depois da leitura gratuita." };
const ACOMPANHAMENTO = { name: "Acompanhamento próximo", price_cents: 2900, when: "a pessoa quer falar todos os dias sem ter comprado." };
const EXTRAS = [PERGUNTA, ACOMPANHAMENTO];
const CODIGO = "00020101021226740014br.gov.bcb.pix2552pix.exemplo.com/qr/v2/ABC5204000053039865802BR5925Empresa de Pagamentos6009SAO PAULO6304ABCD";

describe("a marca de cobrança", () => {
  it("o nome vira um identificador estável, sem acento nem espaço", () => {
    expect(slugDoExtra("Pergunta nova")).toBe("pergunta-nova");
    expect(slugDoExtra("  Acompanhamento Próximo! ")).toBe("acompanhamento-proximo");
  });

  it("⭐ reconhece a marca do extra, com a variação de escrita que o modelo faz", () => {
    expect(marcaDeExtraNoCorpo("Fica R$ 15.\n\n[[PIX: Pergunta nova]]", EXTRAS)).toMatchObject({ tipo: "uma", extra: PERGUNTA });
    expect(marcaDeExtraNoCorpo("[[ pix : pergunta NOVA ]]", EXTRAS)).toMatchObject({ tipo: "uma", extra: PERGUNTA });
    expect(marcaDeExtraNoCorpo("Me conta mais.", EXTRAS)).toEqual({ tipo: "nenhuma" });
  });

  it("nome desconhecido, duas marcas e turno sem extras são erro com o motivo", () => {
    expect(marcaDeExtraNoCorpo("[[PIX: Consulta]]", EXTRAS).tipo).toBe("invalida");
    expect(marcaDeExtraNoCorpo("[[PIX: Pergunta nova]]\n\n[[PIX: Acompanhamento próximo]]", EXTRAS).tipo).toBe("invalida");
    expect(marcaDeExtraNoCorpo("[[PIX: Pergunta nova]]", []).tipo).toBe("invalida");
  });

  it("a troca põe a instrução com o valor e o código sozinho, e o código sai num balão só", () => {
    const corpo = "A pergunta nova fica R$ 15.\n\n[[PIX: Pergunta nova]]\n\nConseguiu copiar o código?";
    const marca = marcaDeExtraNoCorpo(corpo, EXTRAS);
    if (marca.tipo !== "uma") throw new Error("era para achar a marca");
    const trocado = corpoComPixDoExtra(corpo, marca, CODIGO);
    expect(trocado).not.toContain("[[");
    expect(trocado).toContain("*R$ 15*");
    const baloes = splitIntoBubbles(trocado, 300);
    expect(baloes.filter(ehCodigoDoPix)).toEqual([CODIGO]);
    expect(baloes.at(-1)).toBe("Conseguiu copiar o código?");
  });

  it("a referência é a mesma na mesma hora e muda com o extra", () => {
    const a = referenciaDoExtra("c", PERGUNTA, new Date("2026-10-12T12:05:00Z"));
    expect(referenciaDoExtra("c", PERGUNTA, new Date("2026-10-12T12:55:00Z"))).toBe(a);
    expect(referenciaDoExtra("c", ACOMPANHAMENTO, new Date("2026-10-12T12:05:00Z"))).not.toBe(a);
  });
});

describe("blocoDosExtras", () => {
  it("lista cada cobrança com valor, quando cobrar e a marca; sem extras não há bloco", () => {
    const bloco = blocoDosExtras(EXTRAS);
    expect(bloco).toContain("*Pergunta nova* — R$ 15");
    expect(bloco).toContain("[[PIX: Pergunta nova]]");
    expect(bloco).toContain("NÃO atenda de graça");
    expect(bloco).not.toContain("PAGO:");
    expect(blocoDosExtras([])).toBe("");
  });

  it("⭐ o pagamento recente vira a ordem de entregar o que foi pago, sem cobrar de novo", () => {
    const bloco = blocoDosExtras(EXTRAS, [{ slug: "pergunta-nova", hora: "14:32" }]);
    expect(bloco).toContain("PAGO: ela pagou *Pergunta nova* às 14:32");
    expect(blocoDosExtras(EXTRAS, [{ slug: "outro", hora: "14:32" }])).not.toContain("PAGO:");
  });

  it("configuração desligada não cobra nada à parte", () => {
    expect(extrasDaConfig(pricingSchema.parse({ enabled: false, list_price_cents: 13000, extras: EXTRAS }))).toEqual([]);
    expect(extrasDaConfig(pricingSchema.parse({ enabled: true, list_price_cents: 13000, extras: EXTRAS }))).toHaveLength(2);
  });
});

describe("pixDoExtraNoLugarDaMarca", () => {
  const base = {
    extras: EXTRAS,
    organizationId: "org",
    contactId: "contato",
    conversationId: "conversa",
    supabase: {} as never,
    log: { info: vi.fn(), warn: vi.fn() },
    lerConexao: async () => ({ id: "c", organizationId: "org", chave: "sk_x", segredoDoAviso: "w" }),
    agora: new Date("2026-10-12T12:00:00Z"),
  };
  const pix = { id: "pi_1", copiaECola: CODIGO, qrPng: null, expiraEm: null };

  it("⭐ cria o Pix do valor do extra, com `extra` nos metadados, e troca a marca", async () => {
    const criarPix = vi.fn(async (_c: unknown, _p: unknown) => pix);
    const saida = await pixDoExtraNoLugarDaMarca({ ...base, corpo: "Fica R$ 15.\n\n[[PIX: Pergunta nova]]", criarPix });
    expect("corpo" in saida && saida.corpo).toContain(CODIGO);
    expect(criarPix.mock.calls[0]![1]).toMatchObject({
      valorCentavos: 1500,
      metadados: { contact_id: "contato", organization_id: "org", extra: "pergunta-nova", produto: "Pergunta nova" },
    });
  });

  it("sem marca, o corpo passa intacto e ninguém é chamado", async () => {
    const criarPix = vi.fn();
    expect(await pixDoExtraNoLugarDaMarca({ ...base, corpo: "Me conta mais.", criarPix })).toEqual({ corpo: "Me conta mais." });
    expect(criarPix).not.toHaveBeenCalled();
  });

  it("⭐ a marca crua nunca passa: provedor fora, sem conta, nome desconhecido e turno sem extras recusam o envio", async () => {
    const corpo = "[[PIX: Pergunta nova]]";
    const fora = await pixDoExtraNoLugarDaMarca({ ...base, corpo, criarPix: async () => { throw new ErroDaStripe("indisponivel", "x"); } });
    const semConta = await pixDoExtraNoLugarDaMarca({ ...base, corpo, lerConexao: async () => null, criarPix: vi.fn() });
    const desconhecida = await pixDoExtraNoLugarDaMarca({ ...base, corpo: "[[PIX: Consulta]]", criarPix: vi.fn() });
    const semExtras = await pixDoExtraNoLugarDaMarca({ ...base, extras: [], corpo, criarPix: vi.fn() });
    for (const saida of [fora, semConta, desconhecida, semExtras]) expect("recusa" in saida).toBe(true);
  });
});

describe("a trava de valor mínimo com cobrança avulsa", () => {
  const tabela = tabelaDoTurno({ minPriceCents: 3500 }, 13000, undefined, [1500, 2900])!;

  it("⭐ o valor exato do extra passa, mesmo abaixo do piso do produto principal", () => {
    expect(decidePromise({ candidate: "A pergunta nova fica R$ 15.", table: tabela }).allow).toBe(true);
    expect(decidePromise({ candidate: "O acompanhamento é 29 reais.", table: tabela }).allow).toBe(true);
  });

  it("⭐ liberar o extra não abre o piso: outro valor baixo continua vetado", () => {
    expect(decidePromise({ candidate: "Faço o trabalho por R$ 20.", table: tabela }).allow).toBe(false);
    expect(decidePromise({ candidate: "Fica R$ 100.", table: tabela }).allow).toBe(false);
  });

  it("sem extras no turno, a tabela é a de sempre", () => {
    expect(tabelaDoTurno({ minPriceCents: 3500 }, 13000)).toEqual({ minPriceCents: 13000 });
    expect(decidePromise({ candidate: "Fica R$ 15.", table: { minPriceCents: 13000 } }).allow).toBe(false);
  });
});
