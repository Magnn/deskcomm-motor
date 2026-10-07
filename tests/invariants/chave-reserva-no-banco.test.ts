/**
 * A consulta das chaves de reserva é SQL escrito à mão e junta `ai_provider_credentials` com o
 * catálogo `ai_models` (inclusive `= any(models_available)`, que depende do tipo da coluna). O teste
 * unitário usa um pool simulado, que aceita qualquer coluna; aqui a consulta EXATA roda no schema real.
 */
import { describe, expect, it } from "vitest";

import { CONSULTA_DAS_RESERVAS } from "@/lib/agent-engine/edge/llm/chave-reserva";

import { sql } from "./gov-helpers";

const UUID = "'00000000-0000-4000-8000-000000000918'";

describe("chave reserva no banco", () => {
  it("a consulta das reservas roda no schema real, com e sem credencial que falhou", () => {
    const comCredencial = CONSULTA_DAS_RESERVAS.replaceAll("$1", UUID)
      .replaceAll("$2", "'deepseek'")
      .replaceAll("$3", "'deepseek-flash'")
      .replaceAll("$4", UUID);
    const semCredencial = CONSULTA_DAS_RESERVAS.replaceAll("$1", UUID)
      .replaceAll("$2", "'deepseek'")
      .replaceAll("$3", "'deepseek-flash'")
      .replaceAll("$4", "null");
    expect(() => sql(`${comCredencial};`)).not.toThrow();
    expect(() => sql(`${semCredencial};`)).not.toThrow();
  });
});
