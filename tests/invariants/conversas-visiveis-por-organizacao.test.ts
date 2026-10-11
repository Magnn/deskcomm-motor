import { beforeAll, describe, expect, it } from "vitest";

import {
  GOV_ADMIN,
  GOV_AGENT_A,
  GOV_AGENT_B,
  GOV_MANAGER,
  GOV_ORG,
  GOV_VIEWER,
  countAs,
  lastLine,
  seedGov,
  sql,
} from "./gov-helpers";

/**
 * Migration 0923 — `conversations_select` decide por organização antes de decidir por linha.
 *
 * A política ganhou um atalho (`organization_id in (select fn_orgs_com_conversas_todas_visiveis())`)
 * na frente de `fn_can_view_conversation`. O que este arquivo prova é que o atalho não muda QUEM VÊ
 * O QUÊ: para cada papel, o que a política entrega é exatamente o que a função por linha — a regra
 * de antes — entregaria sozinha.
 */

// Como dono do banco (sem RLS), com a identidade de quem pergunta: é a regra antiga, isolada.
function pelaRegraPorLinha(userId: string): number {
  const out = sql(`
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    select count(*) from public.conversations c
     where public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id);
  `);
  return Number(lastLine(out));
}

function orgsDoAtalho(userId: string): string[] {
  const out = sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    select coalesce(string_agg(o::text, ',' order by o::text), 'nenhuma') from public.fn_orgs_com_conversas_todas_visiveis() o;
  `);
  // Sentinela: uma linha vazia faria `lastLine` devolver a saída do `set_config` acima.
  return lastLine(out).split(",").filter((s) => s !== "nenhuma");
}

beforeAll(() => {
  seedGov();
});

describe("conversations_select — o atalho por organização não muda quem vê o quê", () => {
  it.each([
    ["viewer", GOV_VIEWER],
    ["agent A", GOV_AGENT_A],
    ["agent B", GOV_AGENT_B],
    ["manager", GOV_MANAGER],
    ["admin", GOV_ADMIN],
  ])("⭐ %s vê pela política o mesmo que a regra por linha entrega", (_papel, userId) => {
    const pelaPolitica = countAs(userId, "select count(*) from public.conversations;");
    expect(pelaPolitica).toBe(pelaRegraPorLinha(userId));
  });

  it("controle: os papéis não veem todos a mesma coisa (a comparação acima mede algo)", () => {
    const agente = countAs(GOV_AGENT_A, `select count(*) from public.conversations where organization_id = '${GOV_ORG}';`);
    const gestor = countAs(GOV_MANAGER, `select count(*) from public.conversations where organization_id = '${GOV_ORG}';`);
    expect(gestor).toBeGreaterThan(agente);
  });

  it.each([
    ["viewer", GOV_VIEWER],
    ["manager", GOV_MANAGER],
    ["admin", GOV_ADMIN],
  ])("%s entra no atalho da própria organização", (_papel, userId) => {
    expect(orgsDoAtalho(userId)).toContain(GOV_ORG);
  });

  it.each([
    ["agent A", GOV_AGENT_A],
    ["agent B", GOV_AGENT_B],
  ])("⭐ %s NÃO entra no atalho: para ele a decisão segue por linha", (_papel, userId) => {
    expect(orgsDoAtalho(userId)).not.toContain(GOV_ORG);
  });

  it("quem não tem vínculo não recebe organização nenhuma", () => {
    expect(orgsDoAtalho("99999999-9999-4999-8999-999999999999")).toEqual([]);
  });

  it("anon não executa a função", () => {
    const out = sql(`select has_function_privilege('anon', 'public.fn_orgs_com_conversas_todas_visiveis()', 'EXECUTE');`);
    expect(lastLine(out)).toBe("f");
  });

  it("a política em vigor tem o atalho E a regra por linha", () => {
    const out = sql(`
      select pg_get_expr(polqual, polrelid) from pg_policy
       where polrelid = 'public.conversations'::regclass and polname = 'conversations_select';
    `);
    expect(out).toContain("fn_orgs_com_conversas_todas_visiveis");
    expect(out).toContain("fn_can_view_conversation");
  });
});
