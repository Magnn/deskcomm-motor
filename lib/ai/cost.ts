/**
 * Cost computation for AI invocations.
 *
 * Converte uso de tokens em custo, em *centavos* FRACIONÁRIOS (a coluna
 * `llm_calls.cost_cents` é numeric).
 *
 * ⚠️ Até 09/10/2026 o resultado era arredondado PARA CIMA, "para errar para o lado de cobrar a
 * mais". Numa chamada que custa centésimos de centavo isso não é margem, é outro número: medido
 * em produção, 25.736 leituras de clima custaram US$ 222 na tela (um centavo cada) contra cerca
 * de US$ 5 de verdade — e sozinhas faziam o orçamento do mês aparecer em 494% do limite.
 */

import { costCents } from "@/lib/agent-engine/edge/llm/pricing";
import { createAdminClient } from "@/lib/supabase/admin";

interface PricingRow {
  model: string;
  prompt_cents_per_million_tokens: string | number | null;
  completion_cents_per_million_tokens: string | number | null;
  embedding_cents_per_million_tokens: string | number | null;
}

let _pricingCache: Map<string, PricingRow> | null = null;
let _pricingFetchedAt = 0;
const PRICING_TTL_MS = 5 * 60 * 1000; // 5 minutes — enough for hot reload + cheap if missed.

async function loadPricing(): Promise<Map<string, PricingRow>> {
  const now = Date.now();
  if (_pricingCache && now - _pricingFetchedAt < PRICING_TTL_MS) {
    return _pricingCache;
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_pricing")
    .select(
      "model, prompt_cents_per_million_tokens, completion_cents_per_million_tokens, embedding_cents_per_million_tokens",
    )
    .is("superseded_at", null);

  if (error) {
    // Surface but don't crash — cost will be 0 and the row stays auditable.
    return _pricingCache ?? new Map();
  }

  const map = new Map<string, PricingRow>();
  for (const row of (data ?? []) as PricingRow[]) {
    map.set(row.model, row);
  }
  _pricingCache = map;
  _pricingFetchedAt = now;
  return map;
}

function toNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export interface ComputeCostInput {
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  /** For embedding-only models, treat tokens as embedding tokens. */
  embeddingTokens?: number;
}

/**
 * Preço do catálogo (`ai_models`), a tabela que o cron `sync-model-catalog`
 * mantém e a ÚNICA onde chega preço de modelo da OpenRouter.
 *
 * `ai_pricing` é uma lista curta e escrita à mão, com os ids SEM prefixo de
 * provider. Os workers consultam com prefixo (`anthropic/claude-…`,
 * `meta-llama/llama-3.3-70b-instruct`), então o `get` exato errava sempre e o
 * custo ia 0 para `bot_respond` e para todo modelo OpenRouter — a tela de Uso
 * e a de Execuções mostrando R$ 0,00 com o dinheiro saindo, que é literalmente
 * o sintoma citado pela 0130 como motivo da unificação.
 */
async function precoDoCatalogo(
  modelo: string,
): Promise<{ prompt: number; completion: number } | null> {
  const admin = createAdminClient();
  // Duas formas do mesmo id: como veio, e sem o prefixo de provider. O catálogo
  // guarda `model_id` como o provedor o nomeia — com prefixo na OpenRouter, sem
  // ele na Anthropic/OpenAI.
  const semPrefixo = modelo.includes("/") ? modelo.slice(modelo.indexOf("/") + 1) : modelo;
  const { data } = await admin
    .from("ai_models")
    .select("model_id, input_price_per_million_cents, output_price_per_million_cents")
    .in("model_id", [modelo, semPrefixo])
    .is("deprecated_at", null)
    .limit(2);

  const linhas = (data ?? []) as Array<{
    model_id: string;
    input_price_per_million_cents: number | null;
    output_price_per_million_cents: number | null;
  }>;
  // Preferir a correspondência EXATA: `llama-3.3-70b-instruct` pode existir em
  // mais de um provedor com preços diferentes, e o id completo é quem desempata.
  const linha = linhas.find((l) => l.model_id === modelo) ?? linhas[0];
  if (!linha) return null;
  const prompt = toNumber(linha.input_price_per_million_cents);
  const completion = toNumber(linha.output_price_per_million_cents);
  // Catálogo que conhece o modelo mas não tem preço não é melhor que ausência:
  // devolver 0 aqui seria inventar "de graça".
  if (prompt === 0 && completion === 0) return null;
  return { prompt, completion };
}

/**
 * Returns cost in **cents** (fracionário). Zero when pricing missing.
 */
export async function computeCost(input: ComputeCostInput): Promise<number> {
  // A tabela do motor (`pricing.ts`) vem primeiro: é a única que conhece o preço do trecho
  // repetido e o horário de pico, e com ela a MESMA chamada custa o mesmo nos dois caminhos.
  // O id chega aqui com o prefixo do provedor (`deepseek/deepseek-flash`); a tabela não o usa.
  if (input.embeddingTokens === undefined) {
    const semPrefixo = input.model.includes("/") ? input.model.slice(input.model.indexOf("/") + 1) : input.model;
    const doMotor = costCents(semPrefixo, {
      inputTokens: input.promptTokens ?? 0,
      outputTokens: input.completionTokens ?? 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    if (doMotor !== null) return doMotor;
  }

  const pricing = await loadPricing();
  const row = pricing.get(input.model);
  if (!row) {
    // `ai_pricing` não conhece: tenta o catálogo, que é onde o cron grava e
    // onde a OpenRouter chega. Embedding não passa por aqui — o catálogo não
    // guarda preço de embedding —, e nesse caso o desfecho é o mesmo de antes.
    const doCatalogo = await precoDoCatalogo(input.model);
    if (!doCatalogo) return 0;
    const cents =
      ((input.promptTokens ?? 0) * doCatalogo.prompt) / 1_000_000 +
      ((input.completionTokens ?? 0) * doCatalogo.completion) / 1_000_000;
    return cents;
  }

  const promptRate = toNumber(row.prompt_cents_per_million_tokens);
  const completionRate = toNumber(row.completion_cents_per_million_tokens);
  const embeddingRate = toNumber(row.embedding_cents_per_million_tokens);

  const promptTokens = input.promptTokens ?? 0;
  const completionTokens = input.completionTokens ?? 0;
  const embeddingTokens = input.embeddingTokens ?? 0;

  const cents =
    (promptTokens * promptRate) / 1_000_000 +
    (completionTokens * completionRate) / 1_000_000 +
    (embeddingTokens * embeddingRate) / 1_000_000;

  return cents;
}

/** Test-only: drop the in-memory pricing cache. */
export function _resetPricingCacheForTests(): void {
  _pricingCache = null;
  _pricingFetchedAt = 0;
}
