/**
 * IA genérica do construtor de fluxo (lote 1, comparativo ChatbotX/AcassIA/
 * Desk) — uma ÚNICA chamada de modelo pelo seam agnóstico (runModelCall),
 * MESMO padrão de `followup-flow-classify.ts` (classificador/planejador):
 * generaliza o prompt em vez de classificar/planejar. Reaproveita o mesmo
 * mecanismo de custo/auditoria que `ai_classify` já usa — `llm_calls`, ponto
 * `followup_generic_ai` (lib/ai/pontos/registro.ts).
 *
 * Quem decide o que fazer com o resultado é a PONTE (lib/followup/turn-bridge.ts,
 * via callback injetado em followup-turn.ts) — este módulo só chama o modelo,
 * nunca escreve no enrollment nem no lead.
 */
import type pg from "pg";

import type { LeadContext } from "../edge/crm/get-lead-context";
import type { ProviderRegistry } from "../edge/llm/providers";
import { runModelCall, type LlmEdgeConfig } from "../edge/llm/run-model-call";
import type { Logger } from "../obs/logger";

const GENERIC_AI_INSTRUCTION =
  "Você é um assistente auxiliar de um fluxo de automação (NÃO responde ao lead " +
  "diretamente — o texto que você escrever vai para um campo interno do cadastro). " +
  "Siga a instrução abaixo usando o contexto do lead como referência. Responda em " +
  "texto simples, sem formatação markdown e sem aspas em volta, direto ao ponto — a " +
  "resposta é usada exatamente como você escrever.";

function buildGenericAiMessage(prompt: string, context: LeadContext): string {
  return [
    GENERIC_AI_INSTRUCTION,
    "",
    "## Instrução do fluxo",
    prompt,
    "",
    "## Contexto do lead (contato + últimas mensagens)",
    JSON.stringify(context),
  ].join("\n");
}

/**
 * Roda o prompt livre do nó `ai_generic` e devolve o texto do modelo, já
 * aparado e com um teto de segurança pro campo de destino. Nunca devolve
 * string vazia — sem texto reconhecível, lança (o job re-tenta pela fila,
 * mesma doutrina "sem preguiça" de `classifyFollowupReply`).
 */
export async function runGenericAiNode(
  db: pg.Pool,
  cfg: LlmEdgeConfig,
  ids: { tenantId: string; leadId: string; jobId: string },
  args: { prompt: string; context: LeadContext; model?: string },
  deps: { registry?: ProviderRegistry; log: Logger },
): Promise<string> {
  const call = await runModelCall(
    db,
    cfg,
    {
      tenantId: ids.tenantId,
      leadId: ids.leadId,
      jobId: ids.jobId,
      purpose: "followup_generic_ai",
      ...(args.model !== undefined ? { model: args.model } : {}),
      messages: [{ role: "user", content: buildGenericAiMessage(args.prompt, args.context) }],
    },
    { registry: deps.registry, log: deps.log },
  );
  const text = call.result.text.trim();
  if (!text) {
    throw new Error("IA genérica do fluxo: o modelo devolveu resposta vazia — turno re-tentado pela fila");
  }
  return text.slice(0, 4000);
}
