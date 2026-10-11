import { describe, expect, it } from "vitest";

import { StaleServiceBoundaryError } from "@/lib/atendimento/fronteira";

import { AgentVersionReplacedError, assertAgentOperationPg } from "./operation";

const CONTEXTO = { organizationId: "org-1", agentId: "agente-1", versionId: "versao-68", revision: "7" };

function banco(linha: Record<string, unknown> | undefined) {
  return { query: async () => ({ rows: linha ? [linha] : [], rowCount: linha ? 1 : 0 }) } as never;
}
const emOperacao = {
  published_version_id: "versao-68",
  operation_revision: "7",
  operation_mode: "automatic",
  paused_at: null,
  archived_at: null,
};

describe("assertAgentOperationPg — o turno ainda vale para o agente de agora?", () => {
  it("mesma versão, mesma revisão, em operação: passa", async () => {
    await expect(assertAgentOperationPg(banco(emOperacao), CONTEXTO)).resolves.toBeUndefined();
  });

  // Medido em produção em 11/10/2026: publicar o roteiro cancelava de vez os turnos em andamento.
  it("⭐ versão publicada trocou no meio do turno: o erro pede que o turno rode de novo", async () => {
    const erro = await assertAgentOperationPg(banco({ ...emOperacao, published_version_id: "versao-69", operation_revision: "8" }), CONTEXTO).catch((e) => e);
    expect(erro).toBeInstanceOf(AgentVersionReplacedError);
    // Continua sendo a recusa que todo o caminho de envio já sabe tratar: nada sai com o roteiro velho.
    expect(erro).toBeInstanceOf(StaleServiceBoundaryError);
  });

  it("só a revisão de operação mudou e o agente segue em operação: também roda de novo", async () => {
    const erro = await assertAgentOperationPg(banco({ ...emOperacao, operation_revision: "8" }), CONTEXTO).catch((e) => e);
    expect(erro).toBeInstanceOf(AgentVersionReplacedError);
  });

  it.each([
    ["pausado", { ...emOperacao, paused_at: "2026-10-11T12:00:00Z" }],
    ["arquivado", { ...emOperacao, archived_at: "2026-10-11T12:00:00Z" }],
    ["fora do automático", { ...emOperacao, operation_mode: "assisted" }],
    ["sem versão publicada", { ...emOperacao, published_version_id: null }],
    ["pausado E com versão nova", { ...emOperacao, published_version_id: "versao-69", paused_at: "2026-10-11T12:00:00Z" }],
  ])("⭐ agente %s: recusa definitiva, o turno NÃO volta para a fila", async (_caso, linha) => {
    const erro = await assertAgentOperationPg(banco(linha), CONTEXTO).catch((e) => e);
    expect(erro).toBeInstanceOf(StaleServiceBoundaryError);
    expect(erro).not.toBeInstanceOf(AgentVersionReplacedError);
  });

  it("agente que não existe: recusa definitiva", async () => {
    const erro = await assertAgentOperationPg(banco(undefined), CONTEXTO).catch((e) => e);
    expect(erro).toBeInstanceOf(StaleServiceBoundaryError);
    expect(erro).not.toBeInstanceOf(AgentVersionReplacedError);
  });
});
