import { describe, expect, it } from "vitest";

import { EVENTOS_DA_CAKTO, ROTULOS_DOS_EVENTOS_DA_CAKTO } from "@/lib/pagamentos/eventos-da-cakto";
import { EVENTOS_DA_CAKTO as DO_PARSER } from "@/lib/webhooks/cakto";
import { descreverGatilho, gatilhoDaEscolha } from "./gatilho-da-criacao";
import { triggerConfigSchema } from "./api-schemas";

describe("gatilho por evento da Cakto — a escolha da tela vira o gatilho que o motor lê", () => {
  it("a lista que a tela usa é A MESMA que o parser do aviso reconhece (nunca divergem)", () => {
    expect([...DO_PARSER]).toEqual([...EVENTOS_DA_CAKTO]);
  });

  it("todo evento tem rótulo para quem monta o fluxo", () => {
    for (const e of EVENTOS_DA_CAKTO) expect(ROTULOS_DOS_EVENTOS_DA_CAKTO[e].length).toBeGreaterThan(3);
  });

  it("escolher Cakto + evento grava payment_event, e o schema o aceita", () => {
    for (const e of EVENTOS_DA_CAKTO) {
      const g = gatilhoDaEscolha({ provider: "cakto", event: e, keyword: "" });
      expect(g).toEqual({ kind: "payment_event", params: { provider: "cakto", event: e } });
      expect(triggerConfigSchema.safeParse(g).success).toBe(true);
    }
  });

  it("evento que a Cakto não manda é escolha incompleta (nada de gatilho que nunca dispara)", () => {
    expect(gatilhoDaEscolha({ provider: "cakto", event: "pagamento_aprovado", keyword: "" })).toBeNull();
  });

  it("os outros provedores de pagamento continuam entrando por Webhooks", () => {
    expect(gatilhoDaEscolha({ provider: "kiwify", event: "pagamento_aprovado", keyword: "" })).toEqual({ kind: "webhook" });
  });

  it("o card descreve o evento salvo", () => {
    expect(descreverGatilho({ kind: "payment_event", params: { provider: "cakto", event: "pix_gerado" } })).toEqual({
      providerId: "cakto",
      evento: "Pix gerado (aguardando pagamento)",
      palavras: [],
    });
  });
});
