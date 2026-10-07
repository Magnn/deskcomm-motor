/**
 * A consulta da economia de mensagem cobrada roda SQL escrito à mão, fora do client tipado, e lê as
 * colunas da migration 0917. O teste unitário usa um pool simulado, que aceita qualquer coluna; aqui a
 * consulta EXATA roda no schema real.
 */
import { describe, expect, it } from "vitest";

import { CONSULTA_DA_ULTIMA_COBRANCA } from "@/lib/agent-engine/agent/economia-de-mensagem-cobrada";

import { sql } from "./gov-helpers";

const UUID_QUALQUER = "'00000000-0000-4000-8000-000000000917'";

describe("economia de mensagem cobrada no banco", () => {
  it("a consulta da última cobrança roda no schema real", () => {
    expect(() =>
      sql(`${CONSULTA_DA_ULTIMA_COBRANCA.replace("$1", UUID_QUALQUER).replace("$2", UUID_QUALQUER)};`),
    ).not.toThrow();
  });
});
