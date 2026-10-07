/**
 * O resgate do lead sem resposta: uma vez por mensagem pede o atendimento de novo; se continuar mudo,
 * avisa uma pessoa. A regra de QUEM não se toca mora na consulta, conferida no schema real pelo
 * invariante `resgate-de-lead-sem-resposta-no-banco`.
 */
import { describe, expect, it, vi } from "vitest";

import {
  CONSULTA_DE_CANDIDATAS,
  ESPERA_DO_AVISO_MS,
  ORIGEM_DO_RESGATE,
  decidirResgate,
  resgatarLeadsSemResposta,
} from "./resgate-de-lead-sem-resposta";

const AGORA = new Date("2026-10-07T01:45:00Z");
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;

const candidata = (over: object = {}) => ({
  mensagem_id: "11111111-1111-4111-8111-111111111111",
  organization_id: "22222222-2222-4222-8222-222222222222",
  conversation_id: "33333333-3333-4333-8333-333333333333",
  contact_id: "44444444-4444-4444-8444-444444444444",
  channel_session_id: "55555555-5555-4555-8555-555555555555",
  minutos_sem_resposta: 7,
  resgatada_em: null as string | null,
  ...over,
});

function poolCom(linhas: object[], avisoNovo = true) {
  const chamadas: Array<{ sql: string; params: unknown[] }> = [];
  return {
    chamadas,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      chamadas.push({ sql, params });
      if (sql === CONSULTA_DE_CANDIDATAS) return { rows: linhas };
      if (sql.includes("agent_inbox_items")) return { rows: avisoNovo ? [{ id: "aviso-1" }] : [] };
      return { rows: [] };
    }),
  };
}

describe("decidirResgate", () => {
  it("nunca resgatada: resgata; resgatada há pouco: aguarda; resgatada e ainda muda depois do prazo: avisa", () => {
    expect(decidirResgate({ resgatada_em: null }, AGORA)).toBe("resgatar");
    const haPouco = new Date(AGORA.getTime() - 60_000).toISOString();
    expect(decidirResgate({ resgatada_em: haPouco }, AGORA)).toBe("aguardar");
    const haMuito = new Date(AGORA.getTime() - ESPERA_DO_AVISO_MS).toISOString();
    expect(decidirResgate({ resgatada_em: haMuito }, AGORA)).toBe("avisar");
  });
});

describe("resgatarLeadsSemResposta", () => {
  it("conversa muda e nunca resgatada: reemite o pedido de atendimento DA MENSAGEM, marcado como resgate", async () => {
    const pool = poolCom([candidata()]);
    const r = await resgatarLeadsSemResposta(pool as never, log, { agora: AGORA });

    expect(r).toEqual({ resgatadas: 1, avisadas: 0 });
    const emissao = pool.chamadas.find((c) => c.sql.includes("emit_event"));
    expect(emissao?.sql).toContain("'ai_agent.dispatch_requested'");
    expect(emissao?.params[0]).toBe("11111111-1111-4111-8111-111111111111");
    expect(JSON.parse(emissao?.params[1] as string)).toEqual({
      organization_id: "22222222-2222-4222-8222-222222222222",
      conversation_id: "33333333-3333-4333-8333-333333333333",
      contact_id: "44444444-4444-4444-8444-444444444444",
      channel_session_id: "55555555-5555-4555-8555-555555555555",
      inbound_message_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(JSON.parse(emissao?.params[2] as string)).toEqual({ source: ORIGEM_DO_RESGATE });
  });

  it("já resgatada e dentro do prazo: não reemite (uma vez por mensagem) e não avisa", async () => {
    const pool = poolCom([candidata({ resgatada_em: new Date(AGORA.getTime() - 120_000).toISOString() })]);
    const r = await resgatarLeadsSemResposta(pool as never, log, { agora: AGORA });

    expect(r).toEqual({ resgatadas: 0, avisadas: 0 });
    expect(pool.chamadas.filter((c) => c.sql !== CONSULTA_DE_CANDIDATAS)).toEqual([]);
  });

  it("resgatada e ainda muda depois do prazo: abre aviso para uma pessoa, apontando a conversa, e não reemite", async () => {
    const pool = poolCom([candidata({ resgatada_em: new Date(AGORA.getTime() - ESPERA_DO_AVISO_MS - 1).toISOString(), minutos_sem_resposta: 16 })]);
    const r = await resgatarLeadsSemResposta(pool as never, log, { agora: AGORA });

    expect(r).toEqual({ resgatadas: 0, avisadas: 1 });
    expect(pool.chamadas.some((c) => c.sql.includes("emit_event"))).toBe(false);
    const aviso = pool.chamadas.find((c) => c.sql.includes("agent_inbox_items"));
    expect(aviso?.params).toContain("33333333-3333-4333-8333-333333333333");
    expect(aviso?.params).toContain("conversation");
    expect(JSON.stringify(aviso?.params)).toContain("16 minutos");
  });

  it("aviso que já estava aberto não conta de novo", async () => {
    const pool = poolCom([candidata({ resgatada_em: new Date(AGORA.getTime() - ESPERA_DO_AVISO_MS - 1).toISOString() })], false);
    expect(await resgatarLeadsSemResposta(pool as never, log, { agora: AGORA })).toEqual({ resgatadas: 0, avisadas: 0 });
  });

  it("a consulta deixa de fora quem não se toca", () => {
    for (const trecho of [
      "u.direction = 'inbound'",
      "u.type not in ('reaction', 'sticker')",
      "v.status in ('open', 'ai_handling')",
      "v.assigned_to_user_id is null",
      "coalesce(c.force_human, false) = false",
      "coalesce(c.is_blocked, false) = false",
      "archived_at' is null",
      "cs.status = 'WORKING'",
      "j.status in ('pending', 'running')",
      "interval '23 hours'",
    ]) {
      expect(CONSULTA_DE_CANDIDATAS, trecho).toContain(trecho);
    }
  });
});
