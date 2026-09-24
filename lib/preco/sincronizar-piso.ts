/**
 * O PISO NA TRAVA DE PROMESSAS — a rede de segurança do mínimo.
 *
 * O bloco de preço ENSINA a agente a não descer do mínimo, mas modelo erra. A trava de
 * promessas (`lib/agent-engine/guardrails/promise/`) é o que garante: mensagem que cita um
 * valor abaixo de `minPriceCents`, ou um desconto acima de `maxDiscountPercent`, é vetada
 * antes de sair. Aqui o piso da configuração vira uma versão nova dessa tabela.
 *
 * A tabela é da ORGANIZAÇÃO (uma por org), não do agente: o piso vale para todos os agentes
 * dela. Campos que a tabela já tinha e não são do preço (ex.: `maxInstallments`) são
 * preservados.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { validatePromiseTable, type PromiseTable } from "@/lib/agent-engine/guardrails/promise/table";

import { pisoEmCentavos, type PricingConfig } from "./tipos";

/** O que a tabela passa a dizer, a partir do preço configurado. Puro. */
export function tabelaDoPiso(c: Pick<PricingConfig, "list_price_cents" | "steps">, atual: PromiseTable = {}): PromiseTable {
  const piso = pisoEmCentavos(c);
  // Arredonda PARA BAIXO: o teto de desconto nunca pode ser maior que o desconto real.
  const descontoMaximo = Math.floor(((c.list_price_cents - piso) / c.list_price_cents) * 100);
  return { ...atual, minPriceCents: piso, maxDiscountPercent: descontoMaximo };
}

/**
 * Grava a versão nova e move o ponteiro. Lança se o banco recusar — quem chama NÃO deve
 * salvar a configuração de preço sem a trava: negociar sem piso garantido é pior que não
 * negociar.
 */
export async function sincronizarPiso(
  admin: SupabaseClient,
  organizationId: string,
  c: Pick<PricingConfig, "list_price_cents" | "steps">,
): Promise<{ versionId: string; tabela: PromiseTable }> {
  // A tabela em vigor, para preservar o que não é do preço.
  let atual: PromiseTable = {};
  const { data: ponteiro } = await admin
    .from("promise_table_pointers")
    .select("version_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (ponteiro?.version_id) {
    const { data: versao } = await admin
      .from("promise_table_versions")
      .select("values")
      .eq("id", ponteiro.version_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (versao?.values) {
      try {
        atual = validatePromiseTable(versao.values);
      } catch {
        atual = {}; // tabela ilegível: recomeça só com o preço
      }
    }
  }

  const tabela = validatePromiseTable(tabelaDoPiso(c, atual));
  const { data: nova, error: erroVersao } = await admin
    .from("promise_table_versions")
    .insert({ organization_id: organizationId, values: tabela as never })
    .select("id")
    .single();
  if (erroVersao || !nova) throw new Error("promise_table_versions: insert falhou");

  const { error: erroPonteiro } = await admin
    .from("promise_table_pointers")
    .upsert(
      { organization_id: organizationId, version_id: nova.id as string, updated_at: new Date().toISOString() },
      { onConflict: "organization_id" },
    );
  if (erroPonteiro) throw new Error("promise_table_pointers: upsert falhou");

  return { versionId: nova.id as string, tabela };
}
