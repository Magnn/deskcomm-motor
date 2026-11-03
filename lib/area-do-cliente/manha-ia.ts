/**
 * A IA DA MANHÃ — o emissor do ponto `area_manha`.
 *
 * Passa por `runModelCall`, como o sonho (`sonho-ia.ts`): mesma chave, mesmo teto de gasto, mesmo registro em
 * `llm_calls`. Uma chamada por pessoa por dia; quem chama guarda o resultado em `area_manhas` (0956).
 */
import type pg from "pg";

import { runModelCall, type LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/run-model-call";
import { instrucaoDeIdioma, type IdiomaDaArea } from "@/lib/i18n/area";

import { REGRAS_DE_TOM } from "./circulo-ia";
import { lerManha, pedidoDaManha, type DadosDaManha, type ManhaDela } from "./manha";

export type ResultadoDaManha = { ok: true; manha: ManhaDela; modelo: string | null } | { ok: false };

export async function escreverManha(
  pool: pg.Pool,
  cfg: LlmEdgeConfig,
  d: { organizationId: string; contactId: string; empresa: string; dados: DadosDaManha; idioma?: IdiomaDaArea },
): Promise<ResultadoDaManha> {
  const chamada = await runModelCall(pool, cfg, {
    tenantId: d.organizationId,
    leadId: d.contactId,
    jobId: null,
    purpose: "area_manha",
    maxOutputTokens: 1500,
    messages: [{ role: "user", content: pedidoDaManha(d.empresa, d.dados, REGRAS_DE_TOM) + instrucaoDeIdioma(d.idioma) }],
  });
  const manha = lerManha(chamada.result.text ?? "");
  return manha ? { ok: true, manha, modelo: chamada.model ?? null } : { ok: false };
}
