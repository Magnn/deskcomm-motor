import { beforeEach, describe, expect, it, vi } from "vitest";

const ingestMetaInbound = vi.fn();
const ingestMetaEcho = vi.fn();
vi.mock("./ingest", () => ({
  ingestMetaInbound: (...a: unknown[]) => ingestMetaInbound(...a),
  ingestMetaEcho: (...a: unknown[]) => ingestMetaEcho(...a),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { aplicarEventoDaMeta, DESFECHO_PASSAGEIRO, ehFalhaPassageira, pedeReentrega } from "./aplicar-evento";
import type { MetaWebhookSession } from "./session";
import type { MetaWebhookEvent } from "./webhook";

const sessao = { organizationId: "org-1" } as unknown as MetaWebhookSession;
const recebida = {
  kind: "inbound_message",
  externalId: "wamid.A",
  phoneNumberId: "123",
} as unknown as MetaWebhookEvent;
const admin = {} as never;

// O motivo que a ingestão devolveu em produção em 11/10/2026.
const SEM_CONEXAO = "conversa: Timed out acquiring connection from connection pool.";

beforeEach(() => {
  vi.useFakeTimers();
  ingestMetaInbound.mockReset();
  ingestMetaEcho.mockReset();
});

async function aplicar() {
  const andamento = aplicarEventoDaMeta(admin, recebida, sessao, "2026-10-11T12:55:00.000Z");
  await vi.runAllTimersAsync();
  return andamento;
}

describe("ehFalhaPassageira", () => {
  it.each([
    SEM_CONEXAO,
    "contato: fetch failed",
    "mensagem: canceling statement due to statement timeout",
    "conversa: remaining connection slots are reserved — too many clients already",
  ])("⭐ pede nova tentativa: %s", (motivo) => {
    expect(ehFalhaPassageira(motivo)).toBe(true);
  });

  it.each([
    'mensagem: null value in column "body" violates not-null constraint',
    "contato: sem id",
    "sessao_do_numero",
    'conversa: new row violates row-level security policy for table "conversations"',
  ])("o que não tem conserto não entra em loop: %s", (motivo) => {
    expect(ehFalhaPassageira(motivo)).toBe(false);
  });
});

describe("aplicarEventoDaMeta — mensagem que chega quando o banco não atende", () => {
  it("⭐ tenta de novo e a mensagem entra", async () => {
    ingestMetaInbound
      .mockResolvedValueOnce({ status: "failed", reason: SEM_CONEXAO })
      .mockResolvedValueOnce({ status: "ingested", messageId: "m1", conversationId: "c1" });

    expect(await aplicar()).toBe("ingested");
    expect(ingestMetaInbound).toHaveBeenCalledTimes(2);
  });

  it("⭐ esgotadas as tentativas, pede a re-entrega em vez de dar a mensagem por recebida", async () => {
    ingestMetaInbound.mockResolvedValue({ status: "failed", reason: SEM_CONEXAO });

    const desfecho = await aplicar();
    expect(desfecho).toBe(DESFECHO_PASSAGEIRO);
    expect(ingestMetaInbound).toHaveBeenCalledTimes(3);
    expect(pedeReentrega(["ingested", desfecho as string])).toBe(true);
  });

  it("falha definitiva não é tentada de novo nem pede re-entrega", async () => {
    ingestMetaInbound.mockResolvedValue({ status: "failed", reason: "contato: sem id" });

    const desfecho = await aplicar();
    expect(desfecho).toBe("failed");
    expect(ingestMetaInbound).toHaveBeenCalledTimes(1);
    expect(pedeReentrega([desfecho as string])).toBe(false);
  });

  it("mensagem que entra de primeira não espera nada", async () => {
    ingestMetaInbound.mockResolvedValue({ status: "duplicate" });

    expect(await aplicar()).toBe("duplicate");
    expect(ingestMetaInbound).toHaveBeenCalledTimes(1);
  });
});
