import { beforeEach, describe, expect, it, vi } from "vitest";

const enviar = vi.fn();
const registraEnvio = vi.fn(async () => undefined);
const jaFoiEnviada = vi.fn(async () => false);
const lerAtribuicao = vi.fn();

vi.mock("@/lib/plataformas-de-anuncio/credenciais", () => ({ lerCredencial: vi.fn(async () => ({ ok: true, credencial: { accessToken: "x", datasetId: "da-tela" } })) }));
vi.mock("@/lib/plataformas-de-anuncio/registry", () => ({ transporteDe: () => ({ enviar }) }));
vi.mock("./destino-de-mensageria", () => ({ lerDestinoDeMensageria: vi.fn(async () => ({ ok: true, destino: { contaDoWhatsApp: "waba-1", datasetId: "do-canal", accessToken: "y" } })) }));
vi.mock("./leitura-da-atribuicao", () => ({ lerAtribuicao: (...a: unknown[]) => lerAtribuicao(...a) }));
vi.mock("./registro-de-envio", () => ({ jaFoiEnviada: (...a: unknown[]) => jaFoiEnviada(...(a as [])), registraEnvio: (...a: unknown[]) => registraEnvio(...(a as [])) }));

import { idDoEventoDaCompraAvulsa, reportarCompraAvulsa } from "./compra-avulsa";

/** Client mínimo: só a leitura do negócio mais recente do contato. */
function admin(leadId: string | null) {
  const cadeia = {
    select: () => cadeia,
    eq: () => cadeia,
    order: () => cadeia,
    limit: () => cadeia,
    maybeSingle: async () => ({ data: leadId === null ? null : { id: leadId } }),
  };
  return { from: () => cadeia } as never;
}

const COMPRA = { organizationId: "org-1", contactId: "c-1", referencia: "pi_123", valorCentavos: 3700, moeda: "BRL", ocorridaEm: new Date("2026-10-13T12:16:00Z"), produto: "Sinastria Amorosa" };
const COM_ANUNCIO = { temAtribuicao: true, atribuicao: { plataforma: "meta_ads", cliqueDeOrigem: "clique-1", telefone: "+5511999990000" } };

describe("compra avulsa reportada à plataforma de anúncio", () => {
  beforeEach(() => {
    enviar.mockReset().mockResolvedValue({ tipo: "ok" });
    registraEnvio.mockClear();
    jaFoiEnviada.mockReset().mockResolvedValue(false);
    lerAtribuicao.mockReset().mockResolvedValue(COM_ANUNCIO);
  });

  it("⭐ vai como compra, com o valor e a hora da cobrança, o destino do canal e o id pela referência", async () => {
    expect(await reportarCompraAvulsa(admin("lead-1"), COMPRA)).toEqual({ status: "sent" });
    const [credencial, conversao] = enviar.mock.calls[0]!;
    expect(credencial).toMatchObject({ datasetId: "do-canal", accessToken: "y" });
    expect(conversao).toMatchObject({ evento: "Purchase", eventoId: "avulsa:pi_123:Purchase", valorCentavos: 3700, moeda: "BRL", leadId: "lead-1", contaDoWhatsApp: "waba-1", cliqueDeOrigem: "clique-1", ocorridoEm: COMPRA.ocorridaEm });
    expect(registraEnvio).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "sent", eventoId: idDoEventoDaCompraAvulsa("pi_123"), leadId: "lead-1", valorCentavos: 3700 }));
  });

  it("reentrega do provedor não envia de novo", async () => {
    jaFoiEnviada.mockResolvedValue(true);
    expect(await reportarCompraAvulsa(admin("lead-1"), COMPRA)).toEqual({ status: "skipped", motivo: "ja_enviada" });
    expect(jaFoiEnviada).toHaveBeenCalledWith(expect.anything(), "org-1", "lead-1", "Purchase", "avulsa:pi_123:Purchase");
    expect(enviar).not.toHaveBeenCalled();
  });

  it("sem anúncio de origem não envia nem grava; sem negócio também não", async () => {
    lerAtribuicao.mockResolvedValue({ temAtribuicao: false, motivo: "sem_atribuicao" });
    expect(await reportarCompraAvulsa(admin("lead-1"), COMPRA)).toEqual({ status: "skipped", motivo: "sem_atribuicao" });
    lerAtribuicao.mockResolvedValue(COM_ANUNCIO);
    expect(await reportarCompraAvulsa(admin(null), COMPRA)).toEqual({ status: "skipped", motivo: "sem_negocio" });
    expect(enviar).not.toHaveBeenCalled();
    expect(registraEnvio).not.toHaveBeenCalled();
  });

  it("recusa e instabilidade viram pendência registrada; exceção não sobe", async () => {
    enviar.mockResolvedValue({ tipo: "permanente", detalhe: "token sem permissão" });
    expect(await reportarCompraAvulsa(admin("lead-1"), COMPRA)).toEqual({ status: "error", motivo: "recusado_pela_plataforma" });
    enviar.mockResolvedValue({ tipo: "transitorio", detalhe: "503" });
    expect(await reportarCompraAvulsa(admin("lead-1"), COMPRA)).toEqual({ status: "error", motivo: "plataforma_instavel" });
    expect(registraEnvio).toHaveBeenCalledTimes(2);
    enviar.mockRejectedValue(new Error("rede caiu"));
    expect(await reportarCompraAvulsa(admin("lead-1"), COMPRA)).toEqual({ status: "error", motivo: "rede caiu" });
  });
});
