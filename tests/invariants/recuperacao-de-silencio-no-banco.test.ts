/**
 * A recuperação de silêncio roda SQL escrito à mão, fora do client tipado. Os testes unitários usam um
 * pool simulado, que aceita qualquer coluna. Aqui as consultas EXATAS rodam no schema real, e a regra
 * "uma vez por passo" é conferida no índice.
 */
import { describe, expect, it } from "vitest";

import { CONSULTA_DE_SILENCIOSAS } from "@/lib/agent-engine/edge/crm/recuperacao-por-silencio";

import { sql } from "./gov-helpers";

describe("recuperação de silêncio no banco", () => {
  it("a consulta de conversas silenciosas roda no schema real", () => {
    expect(() => sql(`${CONSULTA_DE_SILENCIOSAS};`)).not.toThrow();
  });

  it("o registro da chamada tem o índice único que garante uma vez por passo", () => {
    expect(
      sql(
        "select indexdef from pg_indexes where schemaname = 'public' and indexname = 'silence_recovery_attempts_uma_por_passo';",
      ),
    ).toContain("(conversation_id, anchor_message_id, kind, step)");
  });

  it("a tabela é só do servidor: RLS ligada e nenhuma policy", () => {
    expect(
      sql("select relrowsecurity from pg_class where oid = 'public.silence_recovery_attempts'::regclass;").trim(),
    ).toBe("t");
    expect(
      sql("select count(*) from pg_policies where schemaname = 'public' and tablename = 'silence_recovery_attempts';").trim(),
    ).toBe("0");
  });
});
