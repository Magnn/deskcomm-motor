/**
 * A IA DA VELA — o emissor do ponto `area_intencao`.
 *
 * Passa por `runModelCall`, como o sonho (`sonho-ia.ts`). Uma chamada por vela: ela mesma confere se o texto é uma
 * intenção (e recusa a que deseja o mal de alguém) e escreve a oração. O pedido vai entre marcas e é tratado só como
 * pedido, nunca como instrução.
 */
import type pg from "pg";

import { runModelCall, type LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/run-model-call";
import { instrucaoDeIdioma, type IdiomaDaArea } from "@/lib/i18n/area";

import { REGRAS_DE_TOM } from "./circulo-ia";
import { lerOracao, pedidoDaOracao, type OracaoDaVela, type PedidoDaVela } from "./intencao";

export type ResultadoDaOracao =
  | { ok: true; oracao: OracaoDaVela; modelo: string | null }
  | { ok: false; motivo: "nao_e_pedido" | "resposta_invalida" };

export async function escreverOracao(
  pool: pg.Pool,
  cfg: LlmEdgeConfig,
  d: { organizationId: string; contactId: string; empresa: string; primeiroNome: string; pedido: PedidoDaVela; idioma?: IdiomaDaArea },
): Promise<ResultadoDaOracao> {
  const chamada = await runModelCall(pool, cfg, {
    tenantId: d.organizationId,
    leadId: d.contactId,
    jobId: null,
    purpose: "area_intencao",
    maxOutputTokens: 1200,
    messages: [{ role: "user", content: pedidoDaOracao(d.empresa, d.primeiroNome, d.pedido, REGRAS_DE_TOM) + instrucaoDeIdioma(d.idioma) }],
  });
  const lida = lerOracao(chamada.result.text ?? "");
  if (lida === "nao_e_pedido") return { ok: false, motivo: "nao_e_pedido" };
  if (!lida) return { ok: false, motivo: "resposta_invalida" };
  return { ok: true, oracao: lida, modelo: chamada.model ?? null };
}
