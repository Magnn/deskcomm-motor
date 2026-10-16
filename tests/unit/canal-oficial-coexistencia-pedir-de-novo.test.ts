import { describe, expect, it, vi } from "vitest";

/**
 * COEXISTÊNCIA — o pedido da agenda e do histórico do celular que a Meta
 * recusou. Medido em produção em 16/10/2026: os dois voltaram
 * `(#133010) Account not registered` no segundo da conexão, e não havia como
 * pedir de novo sem refazer a janela pelo celular.
 */

import {
  comEstadoDoCelular,
  faltaPedir,
  lerEstadoDoCelular,
  prazoVencido,
  recusaDeNumeroAindaNaoAtivo,
  sincronizarCelular,
  type EstadoDoCelular,
} from "@/lib/channels/meta/coexistencia";

const NUMERO = { phoneNumberId: "123", token: "tok" };
const NAO_REGISTRADO = { ok: false as const, motivo: "(#133010) Account not registered" };
const ACEITO = { ok: true as const, jaPedida: false };
const semEspera = async () => {};
const AGORA = () => new Date("2026-10-16T17:00:00.000Z");

describe("recusa passageira", () => {
  it("⭐ #133010 é o número ainda não ativo na Cloud API", () => {
    expect(recusaDeNumeroAindaNaoAtivo("(#133010) Account not registered")).toBe(true);
    expect(recusaDeNumeroAindaNaoAtivo("Account not registered")).toBe(true);
    expect(recusaDeNumeroAindaNaoAtivo("(#100) Invalid parameter")).toBe(false);
    expect(recusaDeNumeroAindaNaoAtivo(null)).toBe(false);
  });
});

describe("sincronizarCelular", () => {
  it("⭐ recusa #133010 espera e tenta de novo; aceita na segunda", async () => {
    const pedirAgenda = vi.fn().mockResolvedValueOnce(NAO_REGISTRADO).mockResolvedValueOnce(ACEITO);
    const pedirHistorico = vi.fn().mockResolvedValue(ACEITO);
    const esperar = vi.fn(semEspera);
    const e = await sincronizarCelular(NUMERO, { pedirAgenda, pedirHistorico, esperar, agora: AGORA });
    expect(e).toMatchObject({ agenda: "pedido", historico: "pedido", motivo: null });
    expect(pedirAgenda).toHaveBeenCalledTimes(2);
    expect(esperar).toHaveBeenCalledTimes(1);
  });

  it("agenda antes do histórico, como a Meta pede", async () => {
    const ordem: string[] = [];
    await sincronizarCelular(NUMERO, {
      pedirAgenda: async () => (ordem.push("agenda"), ACEITO),
      pedirHistorico: async () => (ordem.push("historico"), ACEITO),
      esperar: semEspera,
    });
    expect(ordem).toEqual(["agenda", "historico"]);
  });

  it("recusa de outro tipo não espera: volta com o motivo da Meta", async () => {
    const esperar = vi.fn(semEspera);
    const e = await sincronizarCelular(NUMERO, {
      pedirAgenda: async () => ({ ok: false, motivo: "(#100) Invalid parameter" }),
      pedirHistorico: async () => ACEITO,
      esperar,
    });
    expect(e).toMatchObject({ agenda: "falhou", historico: "pedido", motivo: "(#100) Invalid parameter" });
    expect(esperar).not.toHaveBeenCalled();
  });

  it("esgotadas as esperas, fica `falhou` com o motivo — para o botão pedir de novo", async () => {
    const e = await sincronizarCelular(NUMERO, {
      pedirAgenda: async () => NAO_REGISTRADO,
      pedirHistorico: async () => NAO_REGISTRADO,
      esperar: semEspera,
    });
    expect(e).toMatchObject({ agenda: "falhou", historico: "falhou", motivo: NAO_REGISTRADO.motivo });
    expect(faltaPedir(e)).toBe(true);
  });

  it("⭐ o que já foi aceito não é pedido outra vez", async () => {
    const anterior: EstadoDoCelular = {
      agenda: "pedido",
      historico: "falhou",
      motivo: NAO_REGISTRADO.motivo,
      em: "2026-10-16T16:51:10.000Z",
      conectadoEm: "2026-10-16T16:51:00.000Z",
    };
    const pedirAgenda = vi.fn();
    const e = await sincronizarCelular(NUMERO, {
      anterior,
      pedirAgenda,
      pedirHistorico: async () => ({ ok: true, jaPedida: true }),
      esperar: semEspera,
    });
    expect(pedirAgenda).not.toHaveBeenCalled();
    expect(e).toMatchObject({ agenda: "pedido", historico: "ja_pedido", motivo: null, conectadoEm: anterior.conectadoEm });
  });
});

describe("o estado guardado no número", () => {
  const estado: EstadoDoCelular = {
    agenda: "falhou",
    historico: "falhou",
    motivo: "x",
    em: "2026-10-16T16:51:10.000Z",
    conectadoEm: "2026-10-16T16:51:00.000Z",
  };

  it("⭐ grava sem apagar as outras chaves do metadata", () => {
    const m = comEstadoDoCelular({ handling_mode: "flow", default_flow_pointer_id: "f1" }, estado);
    expect(m).toMatchObject({ handling_mode: "flow", default_flow_pointer_id: "f1" });
    expect(lerEstadoDoCelular(m)).toEqual(estado);
  });

  it("metadata sem o estado, ou com forma estranha, vale como nunca pedido", () => {
    expect(lerEstadoDoCelular(null)).toBeNull();
    expect(lerEstadoDoCelular({})).toBeNull();
    expect(lerEstadoDoCelular({ coexistencia: { agenda: "talvez", historico: "pedido" } })).toBeNull();
  });

  it("⭐ o prazo de 24 h conta da conexão; sem a hora, quem decide é a Meta", () => {
    expect(prazoVencido(estado, new Date("2026-10-17T16:50:00.000Z"))).toBe(false);
    expect(prazoVencido(estado, new Date("2026-10-17T16:52:00.000Z"))).toBe(true);
    expect(prazoVencido({ ...estado, conectadoEm: null }, new Date("2030-01-01"))).toBe(false);
    expect(prazoVencido(null)).toBe(false);
  });
});
