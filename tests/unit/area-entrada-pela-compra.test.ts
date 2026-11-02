/**
 * Entrar na área pela compra (`lib/area-do-cliente/entrada-pela-compra.ts`): só o pedido PAGO, com o segredo certo,
 * abre a sessão — e ela nasce com a origem "quiz", no contato do pedido.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { entrarPelaCompra } from "@/lib/area-do-cliente/entrada-pela-compra";
import type { OrgDaArea } from "@/lib/area-do-cliente/sessao";
import { hashDoToken } from "@/lib/area-do-cliente/token";

const ORG = { id: "org-1", slug: "magno", nome: "Magno", razaoSocial: null, cnpj: null, fuso: "America/Sao_Paulo", config: { apelido: "cigana-esmeralda" } } as unknown as OrgDaArea;
const SEGREDO = "a".repeat(43);
const ID = "11111111-1111-4111-8111-111111111111";

/** Um admin falso: guarda os filtros de cada leitura e responde com o pedido dado; grava o que foi inserido. */
function adminFalso(pedido: { contact_id: string; pago_at: string | null; segredo_hash: string; tipo?: string } | null) {
  const inseridos: Array<{ tabela: string; linha: Record<string, unknown> }> = [];
  const admin = {
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => ((filtros[c] = v), b),
        maybeSingle: async () => {
          const casa =
            pedido &&
            filtros.id === ID &&
            filtros.organization_id === ORG.id &&
            filtros.segredo_hash === pedido.segredo_hash &&
            (filtros.tipo === undefined || filtros.tipo === pedido.tipo);
          return { data: casa ? { contact_id: pedido!.contact_id, pago_at: pedido!.pago_at } : null, error: null };
        },
        insert: (linha: Record<string, unknown>) => {
          inseridos.push({ tabela, linha });
          return { select: () => ({ single: async () => ({ data: { id: "sessao-1" }, error: null }) }), then: (ok: (v: unknown) => void) => ok({ error: null }) };
        },
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { admin, inseridos };
}

describe("entrar na área pela compra", () => {
  it("⭐ pedido pago com o segredo certo abre a sessão (origem quiz) e devolve o caminho público", async () => {
    const { admin, inseridos } = adminFalso({ contact_id: "c-1", pago_at: "2026-11-02T20:00:00Z", segredo_hash: hashDoToken(SEGREDO), tipo: "par" });
    const r = await entrarPelaCompra(admin, ORG, { tabela: "area_quiz_pedidos", tipo: "par" }, ID, SEGREDO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.caminho).toBe("/c/cigana-esmeralda");
    const sessao = inseridos.find((i) => i.tabela === "area_sessoes");
    expect(sessao?.linha).toMatchObject({ organization_id: "org-1", contact_id: "c-1", origem: "quiz" });
  });

  it("⭐ pedido ainda não pago não abre nada", async () => {
    const { admin, inseridos } = adminFalso({ contact_id: "c-1", pago_at: null, segredo_hash: hashDoToken(SEGREDO), tipo: "par" });
    const r = await entrarPelaCompra(admin, ORG, { tabela: "area_quiz_pedidos", tipo: "par" }, ID, SEGREDO);
    expect(r).toEqual({ ok: false, motivo: "nao_pago" });
    expect(inseridos).toEqual([]);
  });

  it("segredo de outro pedido (ou de outro tipo de quiz) não abre nada", async () => {
    const { admin, inseridos } = adminFalso({ contact_id: "c-1", pago_at: "2026-11-02T20:00:00Z", segredo_hash: hashDoToken("b".repeat(43)), tipo: "par" });
    expect(await entrarPelaCompra(admin, ORG, { tabela: "area_quiz_pedidos", tipo: "par" }, ID, SEGREDO)).toEqual({ ok: false, motivo: "nao_encontrado" });
    const outro = adminFalso({ contact_id: "c-1", pago_at: "2026-11-02T20:00:00Z", segredo_hash: hashDoToken(SEGREDO), tipo: "caminhos" });
    expect(await entrarPelaCompra(outro.admin, ORG, { tabela: "area_quiz_pedidos", tipo: "par" }, ID, SEGREDO)).toEqual({ ok: false, motivo: "nao_encontrado" });
    expect([...inseridos, ...outro.inseridos]).toEqual([]);
  });

  it("a sinastria paga também abre (sem filtro de tipo)", async () => {
    const { admin } = adminFalso({ contact_id: "c-2", pago_at: "2026-11-02T20:00:00Z", segredo_hash: hashDoToken(SEGREDO) });
    const r = await entrarPelaCompra(admin, ORG, { tabela: "area_sinastrias" }, ID, SEGREDO);
    expect(r.ok).toBe(true);
  });
});
