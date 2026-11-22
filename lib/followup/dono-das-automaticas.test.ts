import { describe, expect, it } from "vitest";

import {
  CHAVE_DA_FONTE,
  JANELA_ENTRE_AUTOMATICAS_HORAS,
  retornoCaiEmCimaDeOutra,
  sqlReguaSemAutomaticaAlheia,
} from "./dono-das-automaticas";
import { CONSULTA_DE_SILENCIOSAS } from "@/lib/agent-engine/edge/crm/recuperacao-por-silencio";
import { CHAVE_DA_OFERTA } from "@/lib/agent-engine/edge/crm/oferta-proativa";

describe("um dono por vez nas mensagens automáticas", () => {
  it("a chave da oferta é a mesma que o worker da oferta grava", () => {
    expect(CHAVE_DA_FONTE.oferta).toBe(CHAVE_DA_OFERTA);
  });

  it("a régua não anda depois de oferta ou retorno sem resposta", () => {
    const sql = sqlReguaSemAutomaticaAlheia("ui.created_at");
    expect(sql).toContain("payload ? 'oferta_proativa'");
    expect(sql).toContain("payload ? 'promise'");
    expect(sql).toContain("qa.created_at > ui.created_at");
    expect(CONSULTA_DE_SILENCIOSAS).toContain(sql);
  });

  it("o retorno pergunta pela régua e pela oferta, na janela, e lê a resposta do banco", async () => {
    const chamadas: unknown[][] = [];
    const pool = {
      query: async (_sql: string, params: unknown[]) => {
        chamadas.push(params);
        return { rows: [{ ha: true }] };
      },
    } as unknown as Parameters<typeof retornoCaiEmCimaDeOutra>[0];
    const ha = await retornoCaiEmCimaDeOutra(pool, { organizationId: "o", contactId: "c", conversationId: "v", jobId: "j" });
    expect(ha).toBe(true);
    expect(chamadas[0]).toEqual(["o", "c", "j", "recovery", "oferta_proativa", JANELA_ENTRE_AUTOMATICAS_HORAS, "v"]);
  });
});
