import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EntradaDeMensagem } from "@/lib/channels/pos-entrada";

/**
 * UM NÚMERO, UM DONO.
 *
 * O dono escolhe, por número, quem responde: um fluxo (sem IA), o agente de IA,
 * ou só gente. A promessa é ISOLAMENTO — número de fluxo não acorda o agente, e
 * número de agente não entra em fluxo. Aqui se mede a mensagem que chega: o que
 * foi chamado e, principalmente, o que NÃO foi.
 */

const enrollFollowupFlow = vi.fn();
const loggerError = vi.fn();

vi.mock("@/lib/followup/enroll", () => ({ enrollFollowupFlow: (...a: unknown[]) => enrollFollowupFlow(...a) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/leads/nascimento-do-lead", () => ({
  garantirLeadDaConversa: vi.fn(async () => ({ criado: true, leadId: "lead-1" })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: (...a: unknown[]) => loggerError(...a) },
}));
vi.mock("@/lib/dev/kick-local-pipeline", () => ({
  acelerarPipelineDeEventos: vi.fn(async () => {}),
  kickLocalPipeline: vi.fn(async () => {}),
}));
vi.mock("@/lib/escalacao/numero-interno-de-aviso", () => ({ ehContatoDoNumeroInterno: vi.fn(async () => false) }));

const FLUXO = "22222222-2222-4222-8222-222222222222";

let metadataDoNumero: Record<string, unknown> | null = null;
let inscricaoViva: { id: string } | null = null;
let eventos: string[] = [];

/** Builder encadeável: só `channel_sessions` e `followup_enrollments` respondem. */
function consulta(tabela: string): unknown {
  const resposta = () =>
    tabela === "channel_sessions"
      ? { data: metadataDoNumero === null ? null : { metadata: metadataDoNumero }, error: null }
      : tabela === "followup_enrollments"
        ? { data: inscricaoViva, error: null }
        : { data: null, count: 0, error: null };
  const alvo: Record<string, unknown> = {};
  return new Proxy(alvo, {
    get(_t, prop) {
      if (prop === "maybeSingle" || prop === "single") return async () => resposta();
      if (prop === "then") return (resolve: (v: unknown) => void) => Promise.resolve(resposta()).then(resolve);
      return () => consulta(tabela);
    },
  });
}

const admin = {
  from: (tabela: string) => consulta(tabela),
  async rpc(_nome: string, args: Record<string, unknown>) {
    eventos.push(String(args.p_event_type));
    return { error: null };
  },
} as never;

const ENTRADA: EntradaDeMensagem = {
  organizationId: "org-1",
  contactId: "contato-1",
  conversationId: "conversa-1",
  messageId: "msg-1",
  channelSessionId: "sessao-1",
  texto: "oi",
  nomeDoContato: "Cliente",
  requestId: "req-1",
  origem: "canal_de_teste",
};

async function chega() {
  const { aplicarEfeitosPosEntrada } = await import("@/lib/channels/pos-entrada");
  await aplicarEfeitosPosEntrada(admin, ENTRADA);
}

const agenteFoiChamado = () => eventos.includes("ai_agent.dispatch_requested");

beforeEach(() => {
  metadataDoNumero = null;
  inscricaoViva = null;
  eventos = [];
  enrollFollowupFlow.mockReset();
  enrollFollowupFlow.mockResolvedValue({ ok: true, enrollment: {} });
  loggerError.mockClear();
});

describe("um número, um dono", () => {
  it("número sem configuração: é do agente de IA, e nenhum fluxo é tocado", async () => {
    await chega();
    expect(agenteFoiChamado()).toBe(true);
    expect(enrollFollowupFlow).not.toHaveBeenCalled();
  });

  it("número de FLUXO: o contato entra no fluxo e o agente NÃO é chamado", async () => {
    metadataDoNumero = { handling_mode: "flow", default_flow_pointer_id: FLUXO };
    await chega();
    expect(enrollFollowupFlow).toHaveBeenCalledTimes(1);
    expect(enrollFollowupFlow.mock.calls[0]![1]).toMatchObject({
      organizationId: "org-1",
      pointerId: FLUXO,
      contactId: "contato-1",
    });
    expect(agenteFoiChamado()).toBe(false);
  });

  it("número de FLUXO, contato já dentro do fluxo: não inscreve de novo, e o agente segue fora", async () => {
    metadataDoNumero = { handling_mode: "flow", default_flow_pointer_id: FLUXO };
    inscricaoViva = { id: "insc-1" };
    await chega();
    expect(enrollFollowupFlow).not.toHaveBeenCalled();
    expect(agenteFoiChamado()).toBe(false);
  });

  it("fluxo do número não roda (desativado): fica mudo e AVISA no log — não vaza para o agente", async () => {
    metadataDoNumero = { handling_mode: "flow", default_flow_pointer_id: FLUXO };
    enrollFollowupFlow.mockResolvedValue({ ok: false, code: "flow_not_active", message: "x", status: 422 });
    await chega();
    expect(agenteFoiChamado()).toBe(false);
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining("ninguém responde"),
      expect.objectContaining({ flowId: FLUXO, code: "flow_not_active" }),
    );
  });

  it("a inscrição ESTOURA: número de fluxo continua isolado — o agente não é o plano B", async () => {
    metadataDoNumero = { handling_mode: "flow", default_flow_pointer_id: FLUXO };
    enrollFollowupFlow.mockRejectedValue(new Error("banco fora"));
    await chega();
    expect(agenteFoiChamado()).toBe(false);
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining("agente NÃO acionado"),
      expect.objectContaining({ flowId: FLUXO }),
    );
  });

  it("número só de gente: nem fluxo, nem agente", async () => {
    metadataDoNumero = { handling_mode: "human" };
    await chega();
    expect(enrollFollowupFlow).not.toHaveBeenCalled();
    expect(agenteFoiChamado()).toBe(false);
  });

  it("devolvido ao agente (modo IA): o fluxo que sobrou guardado NÃO roda", async () => {
    metadataDoNumero = { handling_mode: "ai", default_flow_pointer_id: FLUXO };
    await chega();
    expect(enrollFollowupFlow).not.toHaveBeenCalled();
    expect(agenteFoiChamado()).toBe(true);
  });
});
