/**
 * O RESTANTE SAI NO VALOR QUE FALTA, E O COMBINADO SOBREVIVE À PASSAGEM (medido em 31/10/2026: Pix de
 * R$ 130 para quem devia R$ 70, e retornos com data futura sumindo depois da passagem para humano).
 */
import { describe, expect, it, vi } from "vitest";

import { pixDoRestanteNoLugarDaMarca } from "@/lib/agent-engine/agent/pix-da-entrada-no-envio";
import {
  MOTIVO_DA_PASSAGEM,
  dentroDaJanela,
  linhaDoRetornoNaPassagem,
  religarRetornosDaPassagem,
  temPassagemDeRisco,
} from "@/lib/followup/retorno-da-passagem";
import { blocoDoRestante, restanteDoCombinado, restanteEscritoNoRetorno, temMarcaDoRestante } from "@/lib/preco/restante";
import type { ConexaoStripe } from "@/lib/pagamentos/conexao-stripe";

const BASE = { guardadoCents: null, listPriceCents: 13000 };

describe("o valor do restante", () => {
  it.each([
    ["Lead combinou acertar o restante de R$ 70 do Abertura do Coração até o dia 30.", 7000],
    ["Combinado: restante R$ 80,50 no dia 05/11", 8050],
    ["sem valor nenhum aqui", null],
  ])("lê do texto: %s", (texto, esperado) => {
    expect(restanteEscritoNoRetorno(texto)).toBe(esperado);
  });

  it("cobra o que foi combinado, não o valor cheio", () => {
    expect(restanteDoCombinado({ ...BASE, texto: "restante de R$ 70", pagoCents: 6000 })).toBe(7000);
  });

  it("sem valor no retorno, faz a conta com o que entrou", () => {
    expect(restanteDoCombinado({ ...BASE, texto: "só pode pagar o restante no dia 06", pagoCents: 5000 })).toBe(8000);
  });

  it("o valor guardado vence o texto", () => {
    expect(restanteDoCombinado({ ...BASE, guardadoCents: 4000, texto: "restante de R$ 70", pagoCents: 6000 })).toBe(4000);
  });

  it("sem entrada paga não há restante, e quem pagou tudo não deve nada", () => {
    expect(restanteDoCombinado({ ...BASE, texto: "restante de R$ 70", pagoCents: 0 })).toBeNull();
    expect(restanteDoCombinado({ ...BASE, texto: "restante de R$ 70", pagoCents: 13000 })).toBeNull();
  });

  it("valor igual ou acima do cheio não é restante", () => {
    expect(restanteDoCombinado({ ...BASE, texto: "restante de R$ 130", pagoCents: 6000 })).toBeNull();
  });
});

describe("o bloco e a marca", () => {
  it("só existe quando há restante, e proíbe o link", () => {
    expect(blocoDoRestante(null)).toBe("");
    const bloco = blocoDoRestante(7000);
    expect(bloco).toContain("70");
    expect(bloco).toContain("[[PIX: Restante]]");
    expect(bloco).toContain("NÃO envie link");
  });

  it("a marca aceita variação de espaço e caixa", () => {
    expect(temMarcaDoRestante("[[ pix: RESTANTE ]]")).toBe(true);
    expect(temMarcaDoRestante("[[PIX: Entrada]]")).toBe(false);
  });
});

describe("o Pix do restante", () => {
  const entrada = () => ({
    corpo: "Tá aqui, meu bem.\n\n[[PIX: Restante]]",
    restanteCents: 7000,
    produto: "Abertura do Coração",
    organizationId: "org",
    contactId: "contato",
    conversationId: "conversa",
    supabase: {} as never,
    log: { info: vi.fn(), warn: vi.fn() },
    lerConexao: vi.fn(async () => ({ id: "c" }) as unknown as ConexaoStripe),
  });

  it("sai no valor do restante, como cobrança avulsa, sem a marca crua", async () => {
    const criarPix = vi.fn(async () => ({ id: "pi_1", copiaECola: "00020101" }) as never);
    const r = await pixDoRestanteNoLugarDaMarca({ ...entrada(), criarPix });
    expect(criarPix).toHaveBeenCalledOnce();
    const pedido = (criarPix.mock.calls[0] as unknown as [unknown, { valorCentavos: number; metadados: Record<string, string> }])[1];
    expect(pedido.valorCentavos).toBe(7000);
    expect(pedido.metadados.extra).toBe("restante");
    expect(pedido.metadados.entrada).toBeUndefined();
    expect("corpo" in r && r.corpo).toContain("00020101");
    expect("corpo" in r && r.corpo).not.toContain("[[PIX");
  });

  it("sem conta conectada o envio é recusado", async () => {
    const r = await pixDoRestanteNoLugarDaMarca({ ...entrada(), lerConexao: vi.fn(async () => null) });
    expect("recusa" in r).toBe(true);
  });
});

describe("o retorno depois da passagem", () => {
  function banco(passagens: unknown[], erro: { message: string } | null = null) {
    const update = vi.fn((_valores: Record<string, unknown>) => cadeia({ data: null, error: null }));
    function cadeia(fim: unknown): Record<string, unknown> {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gt", "update"]) c[m] = vi.fn(() => c);
      c.update = update;
      c.then = (ok: (v: unknown) => unknown) => Promise.resolve(fim).then(ok);
      return c;
    }
    const from = vi.fn((tabela: string) =>
      tabela === "passagens_de_atendimento" ? cadeia({ data: passagens, error: erro }) : cadeia({ data: [{ id: "r1", payload: { reason: "restante de R$ 80" } }], error: null }),
    );
    return { admin: { from } as never, update };
  }

  it("religa o que foi desligado pela passagem", async () => {
    const { admin, update } = banco([{ content: "Quer falar com atendente", title: null, notes: null }]);
    expect(await religarRetornosDaPassagem(admin, "org", "contato")).toBe(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        cancelled_at: null,
        cancel_reason: null,
        payload: { reason: "restante de R$ 80", so_dentro_da_janela: true },
      }),
    );
  });

  it("nunca religa para quem falou em tirar a própria vida", async () => {
    const { admin, update } = banco([{ content: "Lead relatou ideação suicida", title: null, notes: null }]);
    expect(await religarRetornosDaPassagem(admin, "org", "contato")).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it("sem conseguir ler as passagens, não religa", async () => {
    const { admin, update } = banco([], { message: "fora" });
    await expect(religarRetornosDaPassagem(admin, "org", "contato")).rejects.toThrow("fora");
    expect(update).not.toHaveBeenCalled();
  });

  it("reconhece o risco por título ou nota, e o motivo é estável", () => {
    expect(temPassagemDeRisco([{ content: null, title: "Risco de vida", notes: null }])).toBe(true);
    expect(temPassagemDeRisco([{ content: "Pagamento", title: null, notes: null }])).toBe(false);
    expect(MOTIVO_DA_PASSAGEM).toBe("passagem_para_humano");
  });

  it("o retorno religado só sai com a janela de 24 h aberta", () => {
    const agora = new Date("2026-11-05T12:00:00.000Z");
    expect(dentroDaJanela(new Date("2026-11-05T01:00:00.000Z"), agora)).toBe(true);
    expect(dentroDaJanela(new Date("2026-11-04T12:00:00.000Z"), agora)).toBe(false);
    expect(dentroDaJanela(null, agora)).toBe(false);
  });

  it("a linha da passagem traz a data e o combinado", () => {
    const linha = linhaDoRetornoNaPassagem("Voltar para\n receber R$ 72", "2026-11-01T14:00:00.000Z", "pt-BR");
    expect(linha).toContain("01/11/2026");
    expect(linha).toContain("Voltar para receber R$ 72");
  });
});
