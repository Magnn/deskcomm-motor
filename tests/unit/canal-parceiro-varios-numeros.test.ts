/**
 * Vários números pelo provedor parceiro na mesma organização (18/11/2026).
 * Antes a busca era `maybeSingle()` por organização: o 2º número substituía o 1º,
 * e com duas linhas a busca devolvia `null` ("Não conectado").
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { findPartnerSession, listPartnerSessions } from "@/lib/channels/connect";

function adminCom(linhas: Record<string, unknown>[]) {
  const filtros: [string, unknown][] = [];
  const consulta = {
    select: () => consulta,
    eq: (col: string, v: unknown) => {
      filtros.push([col, v]);
      return consulta;
    },
    order: async () => ({
      data: linhas.filter((l) => filtros.every(([c, v]) => l[c] === v)),
      error: null,
    }),
  };
  return { admin: { from: () => consulta } as unknown as SupabaseClient, filtros };
}

const linha = (id: string, conta: string, extra: Record<string, unknown> = {}) => ({
  id,
  organization_id: "org_a",
  provider: "zernio",
  zernio_account_id: conta,
  phone_number: null,
  display_name: id,
  status: "WORKING",
  webhook_path_token: `tok_${id}`,
  zernio_token_encrypted: "x",
  archived_at: null,
  ...extra,
});

describe("listPartnerSessions", () => {
  it("devolve todos os números da organização, ativos antes dos excluídos", async () => {
    const { admin, filtros } = adminCom([
      linha("velho", "acc_0", { archived_at: "2026-11-01T00:00:00Z" }),
      linha("um", "acc_1"),
      linha("dois", "acc_2"),
    ]);
    const s = await listPartnerSessions(admin, "org_a");
    expect(s.map((x) => x.id)).toEqual(["um", "dois", "velho"]);
    expect(filtros).toContainEqual(["organization_id", "org_a"]);
  });
});

describe("findPartnerSession", () => {
  it("com a conta, acha AQUELE número — conta nova não acha nada (vira canal novo)", async () => {
    const { admin } = adminCom([linha("um", "acc_1"), linha("dois", "acc_2")]);
    expect((await findPartnerSession(admin, "org_a", "acc_2"))?.id).toBe("dois");
    expect(await findPartnerSession(admin, "org_a", "acc_3")).toBeNull();
  });

  it("sem a conta, a primeira ativa (com duas linhas não cai mais em null)", async () => {
    const { admin } = adminCom([linha("um", "acc_1"), linha("dois", "acc_2")]);
    expect((await findPartnerSession(admin, "org_a"))?.id).toBe("um");
  });

  it("conta de um número excluído é achada, para reconectar ressuscitar a mesma linha", async () => {
    const { admin } = adminCom([linha("velho", "acc_0", { archived_at: "2026-11-01T00:00:00Z" })]);
    expect((await findPartnerSession(admin, "org_a", "acc_0"))?.archivedAt).toBeTruthy();
  });
});
