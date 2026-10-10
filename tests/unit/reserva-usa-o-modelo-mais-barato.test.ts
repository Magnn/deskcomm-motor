/**
 * A CHAVE RESERVA DE OUTRO PROVEDOR USA O MODELO MAIS BARATO, NÃO O DE VITRINE.
 *
 * Medido em 08/10/2026: a principal ficou sem saldo, a reserva assumiu com o modelo PADRÃO do outro
 * provedor (`gpt-5.6-terra`) e gastou US$ 24,51 em 27 minutos — o crédito inteiro da conta de
 * reserva. A consulta roda no schema real em `tests/invariants/chave-reserva-no-banco.test.ts`; aqui
 * fica presa a ORDEM, que é o defeito.
 */
import { describe, expect, it } from "vitest";

import { CONSULTA_DAS_RESERVAS } from "@/lib/agent-engine/edge/llm/chave-reserva";

describe("a ordem de escolha do modelo da reserva", () => {
  const escolha = CONSULTA_DAS_RESERVAS.slice(
    CONSULTA_DAS_RESERVAS.indexOf("from ai_models m"),
    CONSULTA_DAS_RESERVAS.indexOf("limit 1)"),
  );

  it("⭐ ordena pelo preço — entrada, depois saída — e não pelo padrão do provedor", () => {
    expect(escolha).toContain("order by m.input_price_per_million_cents asc nulls last");
    expect(escolha).toContain("m.output_price_per_million_cents asc nulls last");
    expect(escolha).not.toContain("is_default_for_provider");
  });

  it("continua exigindo ferramentas, modelo em vigor e que a chave o alcance", () => {
    expect(escolha).toContain("m.supports_tools");
    expect(escolha).toContain("m.deprecated_at is null");
    expect(escolha).toContain("m.model_id = any(c.models_available)");
  });

  it("no MESMO provedor a reserva segue com o modelo da chamada", () => {
    expect(CONSULTA_DAS_RESERVAS).toContain("case when c.provider = $2 then $3");
  });
});
