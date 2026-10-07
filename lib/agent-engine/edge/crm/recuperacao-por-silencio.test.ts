/**
 * A recuperação de silêncio: cada passo vencido acorda o agente uma vez; quem combinou retorno não é
 * cobrado, só tem a conversa mantida aberta. A regra de QUEM não se toca mora na consulta, conferida no
 * schema real pelo invariante `recuperacao-de-silencio-no-banco`.
 */
import { describe, expect, it, vi } from "vitest";

import { RECUPERACAO_PADRAO } from "@/lib/recuperacao/config";

import {
  CONSULTA_DE_SILENCIOSAS,
  REGISTRO_DA_CHAMADA,
  decidirChamada,
  recuperarSilenciosos,
} from "./recuperacao-por-silencio";

const AGORA = new Date("2026-10-06T15:00:00Z");
const ha = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString();
const daqui = (min: number) => new Date(AGORA.getTime() + min * 60_000).toISOString();
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;

const ORG = "22222222-2222-4222-8222-222222222222";
const CONVERSA = "33333333-3333-4333-8333-333333333333";
const CONTATO = "44444444-4444-4444-8444-444444444444";

const silenciosa = (over: object = {}) => ({
  conversation_id: CONVERSA,
  organization_id: ORG,
  contact_id: CONTATO,
  provider: null as string | null,
  timezone: "America/Sao_Paulo",
  followup: { recovery: RECUPERACAO_PADRAO } as unknown,
  published_at: ha(24 * 60) as string | null,
  anchor_message_id: "11111111-1111-4111-8111-111111111111",
  last_inbound_at: ha(10),
  last_outbound_at: ha(4),
  feitas: 0,
  ultima_em: null as string | null,
  silence_since: null as string | null,
  janela_enviada: false,
  retorno_em: null as string | null,
  ...over,
});

const FRONTEIRA = {
  organization_id: ORG,
  contact_id: CONTATO,
  conversation_id: CONVERSA,
  service_revision: 1,
  demanda_id: null,
  demanda_revision: null,
  status: "open",
  demanda_fechada_em: null,
};

function poolCom(linhas: object[], opcoes: { registra?: boolean; fila?: "ok" | "falha" } = {}) {
  const chamadas: Array<{ sql: string; params: unknown[] }> = [];
  return {
    chamadas,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      chamadas.push({ sql, params });
      if (sql === CONSULTA_DE_SILENCIOSAS) return { rows: linhas };
      if (sql === REGISTRO_DA_CHAMADA) return { rows: opcoes.registra === false ? [] : [{ id: "registro-1" }] };
      if (sql.includes("insert into job_queue")) {
        if (opcoes.fila === "falha") throw new Error("fila fora");
        return { rows: [{ id: "job-1" }] };
      }
      if (sql.includes("from conversations c")) return { rows: [FRONTEIRA] };
      return { rows: [] };
    }),
  };
}

describe("decidirChamada", () => {
  it("régua padrão: 4 min de silêncio dispara a 1ª; com a 1ª feita, só aos 15 min sai a 2ª", () => {
    expect(decidirChamada(silenciosa(), AGORA, true)).toMatchObject({ kind: "step", step: 1 });
    expect(decidirChamada(silenciosa({ last_outbound_at: ha(2) }), AGORA, true)).toBeNull();
    // A fala do agente mais recente é a própria 1ª chamada: o relógio vem de `silence_since`, não dela.
    const depoisDaPrimeira = { feitas: 1, ultima_em: ha(9), last_outbound_at: ha(9), silence_since: ha(12) };
    expect(decidirChamada(silenciosa(depoisDaPrimeira), AGORA, true)).toBeNull();
    const aos15 = { feitas: 1, ultima_em: ha(13), last_outbound_at: ha(13), silence_since: ha(16), last_inbound_at: ha(20) };
    expect(decidirChamada(silenciosa(aos15), AGORA, true)).toMatchObject({ kind: "step", step: 2 });
  });

  it("recuperação desligada ou ausente no agente: ninguém é chamado", () => {
    expect(decidirChamada(silenciosa({ followup: { enabled: true } }), AGORA, true)).toBeNull();
    const desligada = { recovery: { ...RECUPERACAO_PADRAO, enabled: false } };
    expect(decidirChamada(silenciosa({ followup: desligada }), AGORA, true)).toBeNull();
  });

  it("silêncio que começou antes de o agente ser publicado não inicia a régua; régua já iniciada continua", () => {
    const publicadoAgora = { published_at: ha(1), last_outbound_at: ha(4) };
    expect(decidirChamada(silenciosa(publicadoAgora), AGORA, true)).toBeNull();
    const jaIniciada = { published_at: ha(1), feitas: 1, ultima_em: ha(13), last_outbound_at: ha(13), silence_since: ha(16), last_inbound_at: ha(20) };
    expect(decidirChamada(silenciosa(jaIniciada), AGORA, true)).toMatchObject({ kind: "step", step: 2 });
  });

  it("quem combinou retorno não é cobrado pela régua", () => {
    const comRetorno = silenciosa({ retorno_em: daqui(60), last_outbound_at: ha(30), last_inbound_at: ha(40) });
    expect(decidirChamada(comRetorno, AGORA, true)).toBeNull();
  });

  it("retorno combinado para depois do prazo de 24 h: nas últimas 3 h sai a mensagem de manter aberta, uma vez", () => {
    const base = { retorno_em: daqui(3 * 24 * 60), last_outbound_at: ha(21 * 60) };
    expect(decidirChamada(silenciosa({ ...base, last_inbound_at: ha(20 * 60) }), AGORA, true)).toBeNull();
    const nasUltimasHoras = silenciosa({ ...base, last_inbound_at: ha(22 * 60) });
    expect(decidirChamada(nasUltimasHoras, AGORA, true)).toMatchObject({ kind: "keep_window", step: 0 });
    expect(decidirChamada({ ...nasUltimasHoras, janela_enviada: true }, AGORA, true)).toBeNull();
  });

  it("canal sem prazo de 24 h não tem o que manter aberto", () => {
    const semPrazo = silenciosa({
      retorno_em: daqui(3 * 24 * 60),
      last_inbound_at: ha(22 * 60),
      last_outbound_at: ha(21 * 60),
    });
    expect(decidirChamada(semPrazo, AGORA, false)).toBeNull();
  });

  it("fora da faixa de horário do follow-up a régua espera", () => {
    // 15:00Z = 12:00 em São Paulo; faixa só de manhã cedo.
    const followup = { recovery: RECUPERACAO_PADRAO, send_window: { start: "06:00", end: "08:00", weekdays: [0, 1, 2, 3, 4, 5, 6] } };
    expect(decidirChamada(silenciosa({ followup }), AGORA, true)).toBeNull();
  });
});

describe("recuperarSilenciosos", () => {
  it("passo vencido: registra a chamada na âncora e enfileira UM turno de retorno com o motivo e a fronteira", async () => {
    const pool = poolCom([silenciosa()]);
    const r = await recuperarSilenciosos(pool as never, log, { agora: AGORA });

    expect(r).toEqual({ chamadas: 1, janelas: 0 });
    const registro = pool.chamadas.find((c) => c.sql === REGISTRO_DA_CHAMADA);
    expect(registro?.params.slice(0, 6)).toEqual([ORG, CONVERSA, CONTATO, "11111111-1111-4111-8111-111111111111", "step", 1]);
    const jobs = pool.chamadas.filter((c) => c.sql.includes("insert into job_queue"));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.params[1]).toBe(CONTATO);
    expect(jobs[0]?.params[2]).toBe("followup_turn");
    const payload = jobs[0]?.params[4] as { reason: string; service_boundary: object; recovery: object };
    expect(payload.reason).toContain("chamada 1 de 3");
    expect(payload.service_boundary).toMatchObject({ conversation_id: CONVERSA, service_revision: 1 });
    expect(payload.recovery).toEqual({ kind: "step", step: 1 });
  });

  it("outro worker registrou o passo primeiro: nada é enfileirado", async () => {
    const pool = poolCom([silenciosa()], { registra: false });
    const r = await recuperarSilenciosos(pool as never, log, { agora: AGORA });

    expect(r).toEqual({ chamadas: 0, janelas: 0 });
    expect(pool.chamadas.some((c) => c.sql.includes("insert into job_queue"))).toBe(false);
  });

  it("a fila recusou: o registro é desfeito, para o passo poder ser tentado de novo", async () => {
    const pool = poolCom([silenciosa()], { fila: "falha" });
    await expect(recuperarSilenciosos(pool as never, log, { agora: AGORA })).rejects.toThrow("fila fora");
    const desfeito = pool.chamadas.find((c) => c.sql.startsWith("delete from silence_recovery_attempts"));
    expect(desfeito?.params).toEqual(["registro-1"]);
  });

  it("nada vencido: nenhuma escrita", async () => {
    const pool = poolCom([silenciosa({ last_outbound_at: ha(1) })]);
    const r = await recuperarSilenciosos(pool as never, log, { agora: AGORA });
    expect(r).toEqual({ chamadas: 0, janelas: 0 });
    expect(pool.chamadas).toHaveLength(1);
  });
});
