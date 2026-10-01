/**
 * O nó Pixel do fluxo reporta à Meta pela MESMA infraestrutura da venda fechada. O que
 * estes casos guardam: nada sai sem atribuição, nada conta em dobro, valor que não se
 * pode afirmar não vira zero, e o desfecho sempre deixa rastro no livro-razão.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const leituras = vi.hoisted(() => ({
  lead: { id: "lead-1", value_cents: null, currency: null } as { id: string; value_cents: number | null; currency: string | null } | null,
  jaEnviada: false,
  atribuicao: {
    temAtribuicao: true,
    atribuicao: { plataforma: "meta_ads", cliqueDeOrigem: "clid-1", telefone: "5511999990000" },
  } as unknown,
  credencial: { ok: true, credencial: { datasetId: "dataset-da-conexao", accessToken: "tok", testEventCode: null } } as unknown,
  envio: { tipo: "ok" } as unknown,
}));

const enviar = vi.hoisted(() => vi.fn());
const registraEnvio = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("./leitura-da-atribuicao", () => ({ lerAtribuicao: async () => leituras.atribuicao }));
vi.mock("./registro-de-envio", () => ({ jaFoiEnviada: async () => leituras.jaEnviada, registraEnvio }));
vi.mock("@/lib/plataformas-de-anuncio/credenciais", () => ({ lerCredencial: async () => leituras.credencial }));
vi.mock("@/lib/plataformas-de-anuncio/registry", () => ({ transporteDe: () => ({ plataforma: "meta_ads", enviar }) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { valorEmCentavos } from "@/lib/moeda/valor-em-centavos";
import { reportarEventoDoPixel } from "./evento-do-pixel";

const admin = {
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: leituras.lead }) }) }) }),
      }),
    }),
  }),
} as unknown as SupabaseClient;

const pedido = (config: Partial<{ pixel_id: string; event_type: string; item_value: string; currency: string }> = {}) => ({
  organizationId: "org-1",
  contactId: "c-1",
  enrollmentId: "e-1",
  nodeId: "n-1",
  config: { pixel_id: "", event_type: "Compra", item_value: "197,00", ...config },
});

beforeEach(() => {
  leituras.lead = { id: "lead-1", value_cents: null, currency: null };
  leituras.jaEnviada = false;
  leituras.atribuicao = { temAtribuicao: true, atribuicao: { plataforma: "meta_ads", cliqueDeOrigem: "clid-1", telefone: "5511999990000" } };
  leituras.credencial = { ok: true, credencial: { datasetId: "dataset-da-conexao", accessToken: "tok", testEventCode: null } };
  enviar.mockReset().mockResolvedValue({ tipo: "ok" });
  registraEnvio.mockClear();
});

describe("valorEmCentavos", () => {
  it.each([
    ["97,00", 9700],
    ["1.297,50", 129750],
    ["R$ 97", 9700],
    ["97.5", 9750],
    ["0,99", 99],
  ])("%s → %i", (texto, centavos) => expect(valorEmCentavos(texto)).toBe(centavos));

  it.each(["", "  ", "0", "0,00", "-5", "{valor_cobranca}", "abc"])("%j não é um valor que se possa afirmar", (texto) => {
    expect(valorEmCentavos(texto)).toBeNull();
  });
});

describe("reportarEventoDoPixel", () => {
  it("compra com valor: envia como Purchase, em centavos, e registra 'sent'", async () => {
    const r = await reportarEventoDoPixel(admin, pedido());
    expect(r).toEqual({ status: "sent", motivo: null });
    const conversao = enviar.mock.calls[0]![1];
    expect(conversao).toMatchObject({ evento: "Purchase", valorCentavos: 19700, moeda: "BRL", cliqueDeOrigem: "clid-1", eventoId: "lead-1:Purchase" });
    expect(registraEnvio).toHaveBeenCalledWith(admin, expect.objectContaining({ status: "sent", evento: "Purchase", leadId: "lead-1" }));
  });

  it("o pixel do nó vale mais que o conjunto de dados da conexão", async () => {
    await reportarEventoDoPixel(admin, pedido({ pixel_id: "  pixel-do-no " }));
    expect(enviar.mock.calls[0]![0]).toMatchObject({ datasetId: "pixel-do-no" });
    await reportarEventoDoPixel(admin, pedido({ pixel_id: "" }));
    expect(enviar.mock.calls[1]![0]).toMatchObject({ datasetId: "dataset-da-conexao" });
  });

  it("evento que não é compra sai SEM valor quando o nó não informa — nunca value 0", async () => {
    await reportarEventoDoPixel(admin, pedido({ event_type: "Lead", item_value: "" }));
    expect(enviar.mock.calls[0]![1]).toMatchObject({ evento: "Lead", valorCentavos: null });
  });

  it("compra sem valor no nó usa o valor do negócio; sem nenhum dos dois, não envia", async () => {
    leituras.lead = { id: "lead-1", value_cents: 5000, currency: "BRL" };
    await reportarEventoDoPixel(admin, pedido({ item_value: "" }));
    expect(enviar.mock.calls[0]![1]).toMatchObject({ valorCentavos: 5000 });

    leituras.lead = { id: "lead-1", value_cents: null, currency: null };
    const r = await reportarEventoDoPixel(admin, pedido({ item_value: "{valor_cobranca}" }));
    expect(r).toEqual({ status: "skipped", motivo: "sem_valor" });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("lead sem anúncio de origem: não há clique a reportar — 'skipped' com o motivo, nunca sucesso", async () => {
    leituras.atribuicao = { temAtribuicao: false, motivo: "sem_atribuicao" };
    const r = await reportarEventoDoPixel(admin, pedido());
    expect(r).toEqual({ status: "skipped", motivo: "sem_atribuicao" });
    expect(enviar).not.toHaveBeenCalled();
    expect(registraEnvio).toHaveBeenCalledWith(admin, expect.objectContaining({ status: "skipped", motivo: "sem_atribuicao" }));
  });

  it("lead de Google Ads não é reportado por um nó do Pixel do Facebook", async () => {
    leituras.atribuicao = { temAtribuicao: true, atribuicao: { plataforma: "google_ads", cliqueDeOrigem: "g", telefone: null } };
    expect(await reportarEventoDoPixel(admin, pedido())).toEqual({ status: "skipped", motivo: "plataforma_diferente" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("já enviado para este lead e evento: não reenvia (uma venda não conta duas vezes)", async () => {
    leituras.jaEnviada = true;
    expect(await reportarEventoDoPixel(admin, pedido())).toEqual({ status: "skipped", motivo: "ja_enviada" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("sem lead não há onde registrar: não envia", async () => {
    leituras.lead = null;
    expect(await reportarEventoDoPixel(admin, pedido())).toEqual({ status: "skipped", motivo: "sem_lead" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("evento que a Meta não reconhece não sai", async () => {
    expect(await reportarEventoDoPixel(admin, pedido({ event_type: "Comprou" }))).toEqual({ status: "skipped", motivo: "evento_desconhecido" });
  });

  it("conexão ausente ou desligada: registra o motivo para a tela de Conversões mostrar", async () => {
    leituras.credencial = { ok: false, motivo: "conexao_desabilitada" };
    expect(await reportarEventoDoPixel(admin, pedido())).toEqual({ status: "skipped", motivo: "conexao_desabilitada" });
    expect(registraEnvio).toHaveBeenCalledWith(admin, expect.objectContaining({ motivo: "conexao_desabilitada" }));
  });

  it("recusa permanente da Meta vira 'error' com o detalhe; transitória NÃO entra no livro-razão", async () => {
    enviar.mockResolvedValueOnce({ tipo: "permanente", detalhe: "token inválido" });
    expect(await reportarEventoDoPixel(admin, pedido())).toEqual({ status: "error", motivo: "recusado_pela_plataforma" });
    expect(registraEnvio).toHaveBeenLastCalledWith(admin, expect.objectContaining({ status: "error", detalhe: "token inválido" }));

    registraEnvio.mockClear();
    enviar.mockResolvedValueOnce({ tipo: "transitorio", detalhe: "5xx" });
    expect(await reportarEventoDoPixel(admin, pedido())).toEqual({ status: "skipped", motivo: "transitorio" });
    expect(registraEnvio).not.toHaveBeenCalled();
  });
});
