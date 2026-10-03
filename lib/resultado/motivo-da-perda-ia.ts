/**
 * A chamada de IA do motivo da perda — o EMISSOR do ponto `loss_reason_classify`.
 *
 * Passa por `runModelCall`: mesma chave (da empresa ou da plataforma), mesmo
 * teto de gasto e mesmo registro em `llm_calls` de qualquer outra chamada. Teto
 * atingido ou chave ausente LANÇAM daqui — quem chama interrompe a análise e
 * conta o porquê na tela, em vez de engolir.
 */
import type pg from "pg";

import { runModelCall, type LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/run-model-call";

import { lerResposta, montarPedido, type DepsDaAnalise } from "./motivo-da-perda";

export function depsReaisDaAnalise(pool: pg.Pool, cfg: LlmEdgeConfig, organizationId: string): DepsDaAnalise {
  return {
    async inferir(conversa, mensagens) {
      const chamada = await runModelCall(pool, cfg, {
        tenantId: organizationId,
        leadId: conversa.contatoId,
        jobId: null,
        purpose: "loss_reason_classify",
        messages: [{ role: "user", content: montarPedido(mensagens) }],
      });
      const lido = lerResposta(chamada.result.text ?? "");
      return lido ? { ...lido, modelo: chamada.model ?? null } : null;
    },
  };
}
