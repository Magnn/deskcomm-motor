import { describe, expect, it, vi } from "vitest";

// Mesmo motivo de create-or-move-lead.test.ts: `makeDb()` (tests/helpers/stages-db-double.ts)
// faz `vi.mocked(createClient).mockResolvedValue(...)`, então os módulos precisam já estar
// mockados antes -- mesmo que esta ação em si não os use diretamente.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: vi.fn() }) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { getAction } from "@/lib/automation/actions";
import "@/lib/automation/actions/set-lead-custom-field";
import type { ActionCtx } from "@/lib/automation/types";
import { ORG_ID, PIPE, negocio, makeDb } from "@/tests/helpers/stages-db-double";

function ctxDoContato(admin: ActionCtx["admin"], contactId = "contato-1"): ActionCtx {
  return {
    admin,
    organizationId: ORG_ID,
    ruleId: "rule-1",
    ruleName: "Qualificação — regra de teste",
    event: {} as ActionCtx["event"],
    requestId: "req-1",
    context: { contact: { id: contactId } },
  };
}

describe("set_lead_custom_field", () => {
  it("grava a chave com o valor FIXO da config no lead mais recente do contato", async () => {
    const db = makeDb({
      leads: [negocio("lead-1", "novo", { contact_id: "contato-1", pipeline_id: PIPE } as never)],
    });
    const action = getAction("set_lead_custom_field");
    expect(action).toBeDefined();

    const resultado = await action!.execute(ctxDoContato(db.client as unknown as ActionCtx["admin"]), {
      key: "momento_da_casa",
      value: "casa_nova",
    });

    expect(resultado).toEqual({
      type: "set_lead_custom_field",
      status: "success",
      detail: { key: "momento_da_casa", value: "casa_nova", lead_id: "lead-1" },
    });
    expect(db.tabelas.crm_leads.find((l) => l.id === "lead-1")?.custom_fields).toEqual({
      momento_da_casa: "casa_nova",
    });
  });

  it("preserva campos customizados já existentes (merge, não sobrescreve o objeto inteiro)", async () => {
    const db = makeDb({
      leads: [
        negocio("lead-1", "novo", {
          contact_id: "contato-1",
          pipeline_id: PIPE,
          custom_fields: { restricao_fumaca: "sim" },
        } as never),
      ],
    });

    await getAction("set_lead_custom_field")!.execute(ctxDoContato(db.client as unknown as ActionCtx["admin"]), {
      key: "momento_da_casa",
      value: "recomeco",
    });

    expect(db.tabelas.crm_leads.find((l) => l.id === "lead-1")?.custom_fields).toEqual({
      restricao_fumaca: "sim",
      momento_da_casa: "recomeco",
    });
  });

  it("sem lead nenhum para o contato: skipped no_lead, sem lançar", async () => {
    const db = makeDb({ leads: [] });

    const resultado = await getAction("set_lead_custom_field")!.execute(
      ctxDoContato(db.client as unknown as ActionCtx["admin"]),
      { key: "momento_da_casa", value: "casa_nova" },
    );

    expect(resultado).toEqual({ type: "set_lead_custom_field", status: "skipped", detail: { reason: "no_lead" } });
  });

  it("sem contato resolvível no contexto: skipped no_contact", async () => {
    const db = makeDb({ leads: [] });
    const ctx: ActionCtx = {
      admin: db.client as unknown as ActionCtx["admin"],
      organizationId: ORG_ID,
      ruleId: "rule-1",
      ruleName: "Qualificação — regra de teste",
      event: {} as ActionCtx["event"],
      requestId: "req-1",
      context: {},
    };

    const resultado = await getAction("set_lead_custom_field")!.execute(ctx, {
      key: "momento_da_casa",
      value: "casa_nova",
    });

    expect(resultado).toEqual({ type: "set_lead_custom_field", status: "skipped", detail: { reason: "no_contact" } });
  });

  it("config sem key ou sem value: failed missing_config", async () => {
    const db = makeDb({ leads: [] });
    const action = getAction("set_lead_custom_field")!;
    const ctx = ctxDoContato(db.client as unknown as ActionCtx["admin"]);

    expect(await action.execute(ctx, { value: "casa_nova" })).toEqual({
      type: "set_lead_custom_field",
      status: "failed",
      error: "missing_config",
    });
    expect(await action.execute(ctx, { key: "momento_da_casa" })).toEqual({
      type: "set_lead_custom_field",
      status: "failed",
      error: "missing_config",
    });
  });

  it("resolve o contato a partir de ctx.context.lead quando não há ctx.context.contact (mesmo caminho de start-message-flow)", async () => {
    const db = makeDb({
      leads: [negocio("lead-1", "novo", { contact_id: "contato-1", pipeline_id: PIPE } as never)],
    });
    const ctx: ActionCtx = {
      admin: db.client as unknown as ActionCtx["admin"],
      organizationId: ORG_ID,
      ruleId: "rule-1",
      ruleName: "Qualificação — regra de teste",
      event: {} as ActionCtx["event"],
      requestId: "req-1",
      context: { lead: { id: "lead-1", contact_id: "contato-1" } },
    };

    const resultado = await getAction("set_lead_custom_field")!.execute(ctx, {
      key: "momento_da_casa",
      value: "renovar",
    });

    expect(resultado.status).toBe("success");
    expect(db.tabelas.crm_leads.find((l) => l.id === "lead-1")?.custom_fields).toEqual({ momento_da_casa: "renovar" });
  });

  it("devolve no detail o lead (não o contato) e o par key/value, e NÃO emite evento em event_log", async () => {
    const db = makeDb({
      leads: [negocio("lead-1", "novo", { contact_id: "contato-1", pipeline_id: PIPE } as never)],
    });

    const resultado = await getAction("set_lead_custom_field")!.execute(
      ctxDoContato(db.client as unknown as ActionCtx["admin"]),
      { key: "momento_da_casa", value: "casa_nova" },
    );

    expect(resultado).toEqual({
      type: "set_lead_custom_field",
      status: "success",
      detail: { key: "momento_da_casa", value: "casa_nova", lead_id: "lead-1" },
    });
    // Evento-fato sem consumidor nasceria `pending` para sempre (issue #753).
    expect(db.rpcs.filter((r) => r.nome === "emit_event")).toEqual([]);
  });
});
