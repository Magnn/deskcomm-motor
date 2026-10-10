/**
 * QUANDO O AGENTE CONCLUI A PERDA, A IA CLASSIFICA O MOTIVO.
 *
 * Antes o card não se movia e um aviso pedia a uma pessoa que informasse o motivo: 319 avisos
 * abertos numa instalação em que a IA atende tudo. Estes testes seguram os três cuidados da
 * classificação: fato antes de inferência, sem segurança sem motivo, e só vocabulário canônico no card.
 */
import type pg from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

const respostaDoModelo = { texto: '{"motivo":"preco","confianca":85}' };
const chamadasAoModelo: Array<Record<string, unknown>> = [];

vi.mock("@/lib/agent-engine/edge/llm/run-model-call", () => ({
  runModelCall: vi.fn(async (_pool: unknown, _cfg: unknown, input: Record<string, unknown>) => {
    chamadasAoModelo.push(input);
    return { provider: "deepseek", model: "deepseek-flash", result: { text: respostaDoModelo.texto } };
  }),
}));

import {
  CONFIANCA_MINIMA,
  classificarPerdaDoAtendimento,
  motivoDoCard,
  parouDeResponder,
} from "@/lib/resultado/motivo-da-perda-do-agente";

const nossa = (body: string) => ({ direction: "outbound", body, conversation_id: "conv-1" });
const dela = (body: string) => ({ direction: "inbound", body, conversation_id: "conv-1" });

function poolCom(mensagens: Array<{ direction: string; body: string; conversation_id: string }>) {
  const escritas: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    async query(sql: string, params: unknown[] = []) {
      if (/from messages/i.test(sql)) return { rows: mensagens };
      escritas.push({ sql, params });
      return { rows: [], rowCount: 1 };
    },
  } as unknown as pg.Pool;
  return { pool, escritas };
}
const ID = { organizationId: "org-1", contactId: "contato-1" };

beforeEach(() => {
  chamadasAoModelo.length = 0;
  respostaDoModelo.texto = '{"motivo":"preco","confianca":85}';
});

describe("o valor que o card aceita", () => {
  it("preço e silêncio têm valor próprio; o resto é `other` — o banco só conhece o canônico", () => {
    expect(motivoDoCard("preco")).toBe("price");
    expect(motivoDoCard("sem_resposta")).toBe("no_response");
    for (const m of ["confianca", "sem_urgencia", "timing", "concorrente", "outro"] as const) {
      expect(motivoDoCard(m)).toBe("other");
    }
  });
});

describe("parouDeResponder — fato, não inferência", () => {
  const AGORA = new Date("2026-10-10T15:00:00Z");
  const ha = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString();
  const em = <T extends object>(m: T, min: number) => ({ ...m, created_at: ha(min) });

  it("a empresa falou por último duas vezes e ela está calada há mais de uma hora: parou", () => {
    expect(parouDeResponder([em(dela("quanto custa?"), 200), em(nossa("R$ 130"), 199), em(nossa("Posso te mandar o link?"), 120)], AGORA)).toBe(true);
  });

  it("⭐ ela ACABOU de falar e o agente respondeu em duas bolhas: NÃO é silêncio, é o turno em curso", () => {
    // O caso real: "realmente não tenho" → duas bolhas de despedida → classificação. Era preço.
    expect(parouDeResponder([em(nossa("R$ 130"), 30), em(dela("realmente não tenho"), 1), em(nossa("Eu entendo."), 0), em(nossa("A porta fica aberta."), 0)], AGORA)).toBe(false);
  });

  it("uma fala só depois da dela ainda é conversa em andamento", () => {
    expect(parouDeResponder([em(dela("quanto custa?"), 300), em(nossa("R$ 130"), 299)], AGORA)).toBe(false);
  });

  it("ela respondeu por último: não parou", () => {
    expect(parouDeResponder([em(nossa("R$ 130"), 300), em(nossa("Posso mandar?"), 299), em(dela("tá caro"), 298)], AGORA)).toBe(false);
  });

  it("quem nunca falou não 'parou de responder'; e sem horário não se afirma silêncio", () => {
    expect(parouDeResponder([em(nossa("Oi"), 300), em(nossa("Tudo bem?"), 299)], AGORA)).toBe(false);
    expect(parouDeResponder([dela("quanto?"), nossa("R$ 130"), nossa("Segue o link")], AGORA)).toBe(false);
  });
});

describe("classificarPerdaDoAtendimento", () => {
  it("⭐ silêncio depois da oferta: `no_response` por REGRA, sem chamar a IA", async () => {
    const ontem = (m: object) => ({ ...m, created_at: new Date(Date.now() - 24 * 3_600_000).toISOString() });
    const { pool, escritas } = poolCom([ontem(dela("quanto?")), ontem(nossa("R$ 130")), ontem(nossa("Segue o link"))] as never);
    const r = await classificarPerdaDoAtendimento(pool, {} as never, ID);
    expect(r).toMatchObject({ motivoDoCard: "no_response", motivo: "sem_resposta", origem: "regra", confianca: 100 });
    expect(chamadasAoModelo).toHaveLength(0);
    // O motivo fino fica no painel de Resultado, com a origem — e sem trecho da conversa.
    expect(escritas).toHaveLength(1);
    expect(escritas[0]!.sql).toContain("insert into conversation_loss_reasons");
    expect(escritas[0]!.sql).toContain("on conflict (conversation_id) do nothing");
    expect(escritas[0]!.params).toEqual(["org-1", "conv-1", "sem_resposta", 100, "regra", null]);
  });

  it("⭐ ela disse por quê: a IA classifica, e o card recebe o valor canônico", async () => {
    const { pool, escritas } = poolCom([nossa("R$ 130"), dela("não tenho esse dinheiro, deixa pra lá")]);
    const r = await classificarPerdaDoAtendimento(pool, {} as never, { ...ID, jobId: "job-1" });
    expect(r).toMatchObject({ motivoDoCard: "price", motivo: "preco", origem: "ia", confianca: 85, modelo: "deepseek-flash" });
    expect(chamadasAoModelo[0]).toMatchObject({ purpose: "loss_reason_classify", tenantId: "org-1", leadId: "contato-1", jobId: "job-1" });
    expect(escritas[0]!.params).toEqual(["org-1", "conv-1", "preco", 85, "ia", "deepseek-flash"]);
  });

  it("⭐ sem segurança, sem motivo: abaixo do mínimo volta null e nada é gravado", async () => {
    respostaDoModelo.texto = `{"motivo":"outro","confianca":${CONFIANCA_MINIMA - 1}}`;
    const { pool, escritas } = poolCom([nossa("R$ 130"), dela("hm")]);
    await expect(classificarPerdaDoAtendimento(pool, {} as never, ID)).resolves.toBeNull();
    expect(escritas).toHaveLength(0);
  });

  it("resposta ilegível do modelo, ou motivo fora do vocabulário: null", async () => {
    const { pool } = poolCom([nossa("R$ 130"), dela("vou pensar")]);
    respostaDoModelo.texto = "acho que foi o preço";
    await expect(classificarPerdaDoAtendimento(pool, {} as never, ID)).resolves.toBeNull();
    respostaDoModelo.texto = '{"motivo":"clima","confianca":99}';
    await expect(classificarPerdaDoAtendimento(pool, {} as never, ID)).resolves.toBeNull();
  });

  it("contato sem conversa nenhuma: null, sem chamar a IA", async () => {
    const { pool } = poolCom([]);
    await expect(classificarPerdaDoAtendimento(pool, {} as never, ID)).resolves.toBeNull();
    expect(chamadasAoModelo).toHaveLength(0);
  });
});
