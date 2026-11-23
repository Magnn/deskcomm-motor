import { describe, expect, it, vi } from "vitest";

import {
  gravarStatusDaCampanha,
  lerCampanha,
  mudarVeiculacaoDaCampanha,
  VeiculacaoError,
  type DepsDaVeiculacao,
} from "./veiculacao-da-campanha";

/**
 * Pausar/reativar campanha (ads_management). Propriedades presas aqui:
 *  1. token só de leitura NÃO chega a tocar na campanha;
 *  2. campanha de conta que a organização não conectou é recusada ANTES da escrita
 *     (o id vem do navegador);
 *  3. só então o status muda — e a recusa da Meta vira motivo, não exceção.
 */
const deps = (over: Partial<DepsDaVeiculacao> = {}): DepsDaVeiculacao => ({
  inspecionar: vi.fn(async () => ({ escopos: ["ads_read", "ads_management"], contasConcedidas: ["111"] })),
  contasAlcancadas: vi.fn(async () => []),
  lerCampanha: vi.fn(async () => ({ contaId: "111", status: "ACTIVE" })),
  gravarStatus: vi.fn(async () => {}),
  ...over,
});

describe("mudarVeiculacaoDaCampanha", () => {
  it("campanha da conta conectada, com permissão de gerenciar: pausa", async () => {
    const d = deps();
    await expect(mudarVeiculacaoDaCampanha(d, { campanhaId: "c-1", status: "PAUSED" })).resolves.toEqual({
      ok: true,
      campanhaId: "c-1",
      status: "PAUSED",
      contaId: "111",
    });
    expect(d.gravarStatus).toHaveBeenCalledWith("c-1", "PAUSED");
  });

  it("token só de leitura não lê nem escreve a campanha", async () => {
    const d = deps({ inspecionar: vi.fn(async () => ({ escopos: ["ads_read"], contasConcedidas: ["111"] })) });
    await expect(mudarVeiculacaoDaCampanha(d, { campanhaId: "c-1", status: "PAUSED" })).resolves.toEqual({
      ok: false,
      motivo: "sem_permissao_de_gerenciar",
    });
    expect(d.lerCampanha).not.toHaveBeenCalled();
    expect(d.gravarStatus).not.toHaveBeenCalled();
  });

  it("campanha de OUTRA conta (que o token alcança, mas a organização não conectou) é recusada antes da escrita", async () => {
    const d = deps({ lerCampanha: vi.fn(async () => ({ contaId: "999", status: "ACTIVE" })) });
    await expect(mudarVeiculacaoDaCampanha(d, { campanhaId: "c-x", status: "PAUSED" })).resolves.toEqual({
      ok: false,
      motivo: "campanha_de_outra_conta",
    });
    expect(d.gravarStatus).not.toHaveBeenCalled();
  });

  it("sem lista do consentimento, vale a lista de contas que o token alcança (com act_)", async () => {
    const d = deps({
      inspecionar: vi.fn(async () => ({ escopos: ["ads_management"], contasConcedidas: [] })),
      contasAlcancadas: vi.fn(async () => ["act_111"]),
    });
    await expect(mudarVeiculacaoDaCampanha(d, { campanhaId: "c-1", status: "ACTIVE" })).resolves.toMatchObject({ ok: true, status: "ACTIVE" });
  });

  it("campanha que o token não enxerga vira 'não encontrada', sem escrita", async () => {
    const d = deps({ lerCampanha: vi.fn(async () => Promise.reject(new VeiculacaoError("leitura", "Unsupported get request", 100))) });
    await expect(mudarVeiculacaoDaCampanha(d, { campanhaId: "c-1", status: "PAUSED" })).resolves.toEqual({
      ok: false,
      motivo: "campanha_nao_encontrada",
    });
    expect(d.gravarStatus).not.toHaveBeenCalled();
  });

  it("a Meta recusando a escrita vira motivo com o detalhe dela", async () => {
    const d = deps({ gravarStatus: vi.fn(async () => Promise.reject(new VeiculacaoError("escrita", "campanha arquivada", 100))) });
    await expect(mudarVeiculacaoDaCampanha(d, { campanhaId: "c-1", status: "ACTIVE" })).resolves.toEqual({
      ok: false,
      motivo: "recusado",
      detalhe: "campanha arquivada",
    });
  });
});

describe("chamadas à Graph", () => {
  const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

  it("a leitura vai pelo corpo (token fora da URL) e devolve a conta sem act_", async () => {
    const buscar = vi.fn(async () => resposta({ account_id: "act_111", status: "ACTIVE" }));
    await expect(lerCampanha("tok", "c-1", buscar as never)).resolves.toEqual({ contaId: "111", status: "ACTIVE" });
    const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("tok");
    expect(String(init.body)).toContain("access_token=tok");
    expect(String(init.body)).toContain("method=GET");
  });

  it("a escrita manda o status e exige a confirmação da Meta", async () => {
    const ok = vi.fn(async () => resposta({ success: true }));
    await gravarStatusDaCampanha("tok", "c-1", "PAUSED", ok as never);
    expect(String((ok.mock.calls[0] as unknown as [string, RequestInit])[1].body)).toContain("status=PAUSED");
    const semConfirmacao = vi.fn(async () => resposta({}));
    await expect(gravarStatusDaCampanha("tok", "c-1", "PAUSED", semConfirmacao as never)).rejects.toBeInstanceOf(VeiculacaoError);
  });

  it("erro da Graph carrega o código (é ele que separa permissão de objeto inexistente)", async () => {
    const buscar = vi.fn(async () => resposta({ error: { message: "(#200) Permissions error", code: 200 } }, 403));
    await expect(gravarStatusDaCampanha("tok", "c-1", "PAUSED", buscar as never)).rejects.toMatchObject({ codigo: 200 });
  });
});
