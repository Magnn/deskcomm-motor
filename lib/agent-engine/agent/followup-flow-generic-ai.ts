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
 *
 * As OPÇÕES do nó (modelo, temperatura, tokens, personalidade, restrições, base de
 * informações) chegam já resolvidas por `followup-turn.ts`; ver `opcoes-do-gpt.ts`.
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

/** Quando o resultado VAI ao cliente (`enviar_resultado_texto`), a instrução muda: é a voz do atendimento. */
const GENERIC_AI_INSTRUCTION_PARA_CLIENTE =
  "Você escreve a próxima mensagem de um fluxo de atendimento; o texto que você " +
  "escrever será ENVIADO ao cliente exatamente como está. Siga a instrução abaixo " +
  "usando o contexto do lead como referência. Responda só com a mensagem, em texto " +
  "simples, sem formatação markdown e sem aspas em volta.";

export interface BlocosDoGpt {
  /** Aba Identidade do agente (quando `ativar_personalidade`). */
  identidade?: string;
  /** Aba Limites do agente (quando `ativar_restricoes`). */
  limites?: string;
  /** Trechos da base de conhecimento do agente (quando `ativar_base_informacoes`). */
  conhecimento?: string[];
}

function buildGenericAiMessage(
  prompt: string,
  context: LeadContext,
  blocos: BlocosDoGpt,
  paraCliente: boolean,
): string {
  const partes: string[] = [paraCliente ? GENERIC_AI_INSTRUCTION_PARA_CLIENTE : GENERIC_AI_INSTRUCTION, ""];
  if (blocos.identidade) partes.push("## Identidade e tom (siga ao escrever)", blocos.identidade.trim(), "");
  if (blocos.limites) partes.push("## Restrições (nunca violar)", blocos.limites.trim(), "");
  if (blocos.conhecimento && blocos.conhecimento.length > 0) {
    partes.push(
      "## Base de informações (use só o que está aqui; se não cobrir, não invente)",
      ...blocos.conhecimento.map((t, i) => `[${i + 1}] ${t.trim()}`),
      "",
    );
  }
  partes.push(
    "## Instrução do fluxo",
    prompt,
    "",
    "## Contexto do lead (contato + últimas mensagens)",
    JSON.stringify(context),
  );
  return partes.join("\n");
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
  ids: { tenantId: string; leadId: string; jobId: string; agentId?: string | null },
  args: {
    prompt: string;
    context: LeadContext;
    model?: string;
    temperature?: number;
    maxOutputTokens?: number;
    blocos?: BlocosDoGpt;
    /** `true` quando o texto será enviado ao cliente (muda a instrução). */
    paraCliente?: boolean;
  },
  deps: { registry?: ProviderRegistry; log: Logger },
): Promise<string> {
  const call = await runModelCall(
    db,
    cfg,
    {
      tenantId: ids.tenantId,
      leadId: ids.leadId,
      jobId: ids.jobId,
      ...(ids.agentId ? { agentId: ids.agentId } : {}),
      purpose: "followup_generic_ai",
      ...(args.model !== undefined ? { model: args.model } : {}),
      ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
      ...(args.maxOutputTokens !== undefined ? { maxOutputTokens: args.maxOutputTokens } : {}),
      messages: [
        {
          role: "user",
          content: buildGenericAiMessage(args.prompt, args.context, args.blocos ?? {}, args.paraCliente === true),
        },
      ],
    },
    { registry: deps.registry, log: deps.log },
  );
  const text = call.result.text.trim();
  if (!text) {
    throw new Error("IA genérica do fluxo: o modelo devolveu resposta vazia — turno re-tentado pela fila");
  }
  return text.slice(0, 4000);
}
