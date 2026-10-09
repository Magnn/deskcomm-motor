/**
 * O PAINEL SÓ PEDE COLUNA E TABELA QUE EXISTEM.
 *
 * Medido em produção em 09/10/2026, no log do gateway: quatro consultas da rota do Dashboard eram
 * recusadas pelo banco TODA vez — `channel_sessions.name` (583 recusas por dia),
 * `conversations.first_outbound_at`/`closed_at`, a tabela `organization_members` e
 * `crm_leads.estimated_value_cents`. A rota ignorava o erro: a lista de conexões vinha vazia e a
 * aba Atendimento mostrava zero em tudo, sem aviso.
 *
 * A prova de que os nomes novos existem é o banco de produção, conferido ao consertar; este teste
 * impede a volta dos quatro nomes que nunca existiram.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const rota = readFileSync("app/api/v1/dashboard/metrics/route.ts", "utf8");
const codigo = rota
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

describe("rota do Dashboard", () => {
  it.each(["organization_members", "first_outbound_at", "estimated_value_cents", '"id, name, phone_number, status"'])(
    "não pede %s",
    (nome) => {
      expect(codigo).not.toContain(nome);
    },
  );

  it("pede as colunas reais", () => {
    expect(codigo).toContain('"id, name:display_name, phone_number, status"');
    expect(codigo).toContain("last_outbound_at");
    expect(codigo).toContain("service_closed_at");
    expect(codigo).toContain('.from("user_organizations")');
    expect(codigo).toContain('"id, stage_id, value_cents, contact_id"');
  });
});
