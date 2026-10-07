/**
 * O resgate de lead sem resposta e a devolução de job no encerramento rodam SQL escrito à mão, fora do
 * client tipado. Os testes unitários usam um pool simulado, que aceita qualquer coluna — foi assim que
 * uma leitura de coluna inexistente chegou à produção na 0913. Aqui as consultas EXATAS rodam no schema
 * real.
 */
import { describe, expect, it } from "vitest";

import { CONSULTA_DE_CANDIDATAS } from "@/lib/agent-engine/edge/crm/resgate-de-lead-sem-resposta";

import { sql } from "./gov-helpers";

describe("resgate de lead sem resposta no banco", () => {
  it("a consulta de candidatas roda no schema real", () => {
    expect(() => sql(`${CONSULTA_DE_CANDIDATAS.replace("$1", "300000")};`)).not.toThrow();
  });

  it("a função de emissão aceita o pedido de atendimento com a assinatura usada pelo resgate", () => {
    expect(
      sql(
        "select count(*) from pg_proc where proname = 'emit_event' and pg_get_function_identity_arguments(oid) = 'p_event_type text, p_entity_kind text, p_entity_id uuid, p_payload jsonb, p_metadata jsonb, p_organization_id uuid';",
      ).trim(),
    ).toBe("1");
  });

  it("a devolução de job no encerramento usa colunas que existem", () => {
    expect(() =>
      sql(
        "update job_queue set status = 'pending', locked_by = null, locked_at = null, attempts = greatest(attempts - 1, 0), run_after = now(), last_error = coalesce(last_error, 'x') where status = 'running' and locked_by = 'ninguem' returning id;",
      ),
    ).not.toThrow();
  });
});
