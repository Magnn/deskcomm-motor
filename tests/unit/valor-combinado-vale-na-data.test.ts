/**
 * O VALOR COMBINADO VALE NA DATA.
 *
 * Quem fecha por um degrau da negociação e só pode pagar em outra data é agendado. Semanas
 * depois, as reclamações que liberaram o degrau já saíram da janela de histórico: a contagem
 * volta a zero, o bloco de preço voltaria ao valor de venda e a trava de promessas vetaria o
 * valor que a própria agente combinou. Estes testes seguram as três pontas do conserto: o valor
 * é LIDO da conversa pelo código, GUARDADO com o retorno, e DEVOLVIDO ao turno da data.
 */
import type pg from "pg";
import { describe, expect, it } from "vitest";

import { applyScheduleFollowup } from "@/lib/agent-engine/agent/schedule-followup";
import { agendaRetorno, type PayloadDoRetorno, type RetornoDb } from "@/lib/followup/retorno";
import { blocoDePreco } from "@/lib/preco/bloco-do-prompt";
import { combinadoEmVigor, precoPermitidoAgora, valorCombinadoNaConversa } from "@/lib/preco/estado-da-negociacao";
import { pricingSchema } from "@/lib/preco/tipos";

const cfg = pricingSchema.parse({
  enabled: true,
  list_price_cents: 13_000,
  steps: [
    { price_cents: 10_000, product_links: [{ name: "Abertura do Coração", url: "https://pay.exemplo.test/coracao_100" }] },
    { price_cents: 9_000, payment_url: "https://pay.exemplo.test/tudo_90" },
  ],
});

const nossa = (body: string) => ({ direction: "outbound", body });
const dela = (body: string) => ({ direction: "inbound", body });

describe("valorCombinadoNaConversa — o último valor da escada que a agente disse", () => {
  it("fechou por um degrau: é ele", () => {
    expect(
      valorCombinadoNaConversa(cfg, [nossa("O trabalho custa R$ 130."), dela("tá caro"), dela("não tenho"), nossa("Fica R$ 100. Fica bom assim?"), dela("só dia 30")]),
    ).toBe(10_000);
  });

  it("ainda no valor de venda, ou sem preço dito: não há combinado a guardar", () => {
    expect(valorCombinadoNaConversa(cfg, [nossa("O trabalho custa R$ 130."), dela("só dia 30")])).toBeNull();
    expect(valorCombinadoNaConversa(cfg, [dela("oi"), nossa("Boa noite.")])).toBeNull();
  });

  it("referência de mercado e parcela NÃO são o preço — só conta valor que é da escada", () => {
    expect(
      valorCombinadoNaConversa(cfg, [nossa("Custa de R$ 380 a R$ 600 por aí. Pra você, R$ 100, ou 12x de menos de R$ 15.")]),
    ).toBe(10_000);
    expect(valorCombinadoNaConversa(cfg, [nossa("Fica R$ 100."), nossa("Uma pergunta nova são R$ 15.")])).toBe(10_000);
  });

  it("vale o valor MAIS RECENTE: desceu de novo, é o de baixo", () => {
    expect(valorCombinadoNaConversa(cfg, [nossa("Fica R$ 100."), dela("não dá"), nossa("Esse é o menor: R$ 90,00.")])).toBe(9_000);
  });

  it("valor escrito pela PESSOA não conta", () => {
    expect(valorCombinadoNaConversa(cfg, [nossa("O trabalho custa R$ 130."), dela("faz por R$ 90?")])).toBeNull();
  });
});

describe("combinadoEmVigor — o guardado só vale se ainda é um degrau", () => {
  it("é degrau da escada em vigor: vale", () => {
    expect(combinadoEmVigor(cfg, 10_000)).toBe(10_000);
  });

  it("⭐ o dono mudou os valores depois: o combinado antigo não fura o piso novo", () => {
    expect(combinadoEmVigor(cfg, 6_700)).toBeNull();
    expect(combinadoEmVigor(cfg, 13_000)).toBeNull();
    expect(combinadoEmVigor(cfg, null)).toBeNull();
  });
});

describe("o bloco de preço na data — semanas depois, com a contagem zerada", () => {
  it("⭐ com valor combinado, o bloco manda cobrar ESSE valor com o link dele, e não volta ao de venda", () => {
    // A janela de histórico já não tem as reclamações: reclamacoes === 0.
    const b = blocoDePreco(cfg, { reclamacoes: 0, combinadoCents: 10_000 });
    expect(b).toContain("VALOR COMBINADO: esta pessoa já combinou com você R$ 100");
    expect(b).toContain("NÃO volte ao valor de venda");
    expect(b).toContain("https://pay.exemplo.test/coracao_100");
    expect(b).not.toContain("NÃO ofereça desconto, NÃO fale de valor menor");
    // E o piso que a trava usaria neste turno deixa o valor combinado sair.
    expect(Math.min(precoPermitidoAgora(cfg, 0), 10_000)).toBe(10_000);
  });

  it("sem valor combinado, nada muda: a escada conta como sempre", () => {
    expect(blocoDePreco(cfg, { reclamacoes: 0 })).toBe(blocoDePreco(cfg, { reclamacoes: 0, combinadoCents: null }));
    expect(blocoDePreco(cfg, { reclamacoes: 0 })).not.toContain("VALOR COMBINADO");
  });

  it("a pessoa seguiu reclamando e a escada desceu ALÉM do combinado: vale a escada", () => {
    const b = blocoDePreco(cfg, { reclamacoes: 3, combinadoCents: 10_000 });
    expect(b).not.toContain("VALOR COMBINADO");
    expect(b).toContain("Ofereça SÓ R$ 90");
  });

  it("combinado que não é mais degrau é ignorado pelo bloco", () => {
    expect(blocoDePreco(cfg, { reclamacoes: 0, combinadoCents: 6_700 })).not.toContain("VALOR COMBINADO");
  });
});

describe("o valor é guardado com o retorno", () => {
  const JANELA = { minAheadMs: 30 * 60_000, maxAheadMs: 30 * 86_400_000, staggerWindowMs: 60_000 };
  const AGORA = new Date("2026-10-08T12:00:00Z");

  function dbFalso() {
    const inseridos: PayloadDoRetorno[] = [];
    const db: RetornoDb = {
      buscaRetornoVivo: async () => null,
      insere: async (_org, input) => {
        inseridos.push(input.payload);
        return {
          id: "r1",
          contactId: input.contactId,
          quando: input.quando.toISOString(),
          prometidoPara: input.payload.promised_at,
          situacao: "agendado",
          motivo: input.payload.reason,
          promessa: input.payload.promise,
          canceladoEm: null,
          motivoDoCancelamento: null,
        };
      },
      buscaPorId: async () => null,
      marcaCancelado: async () => false,
      lista: async () => [],
    };
    return { db, inseridos };
  }

  const pedido = { motivo: "só paga dia 30", prometidoPara: "2026-10-30T13:00:00Z", promessa: "voltar dia 30 com o link" };

  it("com valor combinado: vai no payload do retorno", async () => {
    const { db, inseridos } = dbFalso();
    await agendaRetorno(db, { agora: AGORA, janela: JANELA }, { orgId: "o", contactId: "c" }, { ...pedido, valorCombinadoCents: 10_000 });
    expect(inseridos[0]?.agreed_price_cents).toBe(10_000);
  });

  it("sem valor (ou valor que não é número inteiro positivo): o payload sai como sempre", async () => {
    for (const valor of [null, undefined, 0, -5, 99.5]) {
      const { db, inseridos } = dbFalso();
      await agendaRetorno(db, { agora: AGORA, janela: JANELA }, { orgId: "o", contactId: "c" }, { ...pedido, valorCombinadoCents: valor });
      expect(inseridos[0]).not.toHaveProperty("agreed_price_cents");
    }
  });

  it("⭐ a tool do agente guarda o valor do RUNTIME — e o modelo não consegue ditar um", async () => {
    const payloads: Record<string, unknown>[] = [];
    const pool = {
      async query(sql: string, params?: unknown[]) {
        if (/insert into cron_jobs/i.test(sql)) {
          payloads.push(params?.[2] as Record<string, unknown>);
          return { rows: [{ id: "cron-novo", next_run_at: new Date("2026-10-30T13:00:00Z") }] };
        }
        return { rows: [] };
      },
    } as unknown as pg.Pool;
    const cfgDaTool = { clock: () => AGORA, knobs: JANELA };
    const ids = { tenantId: "o", leadId: "c" };
    const valido = { reason: "só paga dia 30", promised_at: "2026-10-30T13:00:00Z", promise: "voltar dia 30", context_snapshot: null };

    expect((await applyScheduleFollowup(pool, cfgDaTool, ids, valido, { valorCombinadoCents: 10_000 })).ok).toBe(true);
    expect(payloads[0]?.agreed_price_cents).toBe(10_000);

    // Campo forjado pelo modelo é recusado pela whitelist — nada é agendado.
    const forjado = await applyScheduleFollowup(pool, cfgDaTool, ids, { ...valido, agreed_price_cents: 100 });
    expect(forjado.ok).toBe(false);
    expect(payloads).toHaveLength(1);
  });
});
