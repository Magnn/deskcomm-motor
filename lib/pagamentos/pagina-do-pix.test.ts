import { describe, expect, it, vi } from "vitest";

import { instrucaoDoPixCopiaECola, linhaDoLinkDePagamento } from "./como-pagar-pix";
import { estadoDaPaginaDoPix, precisaRenovar, urlDaPaginaDoPix } from "./pagina-do-pix";
import type { PixLido } from "./stripe";

import type { SupabaseClient } from "@supabase/supabase-js";

const ORG = "b6113ac6-0000-4000-8000-000000000001";
const PI = "pi_3TestOriginal0001";
const AGORA = new Date("2026-10-26T20:00:00Z");
const conexao = { id: "c", organizationId: ORG, chave: "sk_test", segredoDoAviso: null } as never;

function lido(p: Partial<PixLido> = {}): PixLido {
  return {
    id: PI, estado: "requires_action", valorCentavos: 4500, moeda: "BRL", descricao: "Oração dos Sonhos",
    metadados: { contact_id: "k", organization_id: ORG }, ehPix: true,
    copiaECola: "000201codigo", qrPng: "https://qr", expiraEm: new Date(AGORA.getTime() + 30 * 60_000).toISOString(), ...p,
  };
}

function montar(pix: PixLido, pagoAntes = false) {
  const criarPix = vi.fn(async () => ({ id: "pi_novo", copiaECola: "000201novo", qrPng: null, expiraEm: null }));
  const haPagamentoComMetadado = vi.fn(async () => pagoAntes);
  const cliente = { lerPix: vi.fn(async () => pix), criarPix, haPagamentoComMetadado };
  const rodar = (cobrancaId = PI) =>
    estadoDaPaginaDoPix(
      { admin: {} as SupabaseClient, organizationId: ORG, cobrancaId, agora: AGORA },
      { lerConexao: async () => conexao, cliente: () => cliente as never },
    );
  return { rodar, criarPix, haPagamentoComMetadado };
}

describe("urlDaPaginaDoPix", () => {
  it("monta o link a partir da origem pública", () => {
    expect(urlDaPaginaDoPix("https://desk.exemplo.com/", ORG, PI)).toBe(`https://desk.exemplo.com/pix/${ORG}/${PI}`);
  });
  it("sem origem ou com id que não é de cobrança, não há link", () => {
    expect(urlDaPaginaDoPix("", ORG, PI)).toBeNull();
    expect(urlDaPaginaDoPix("https://x.com", ORG, "cs_123456789")).toBeNull();
    expect(urlDaPaginaDoPix("https://x.com", "nao-e-uuid", PI)).toBeNull();
  });
});

describe("precisaRenovar", () => {
  it("código esperando e com folga: mostra o mesmo", () => expect(precisaRenovar(lido(), AGORA)).toBe(false));
  it("vence em menos de 2 minutos: renova", () =>
    expect(precisaRenovar(lido({ expiraEm: new Date(AGORA.getTime() + 60_000).toISOString() }), AGORA)).toBe(true));
  it("cobrança que já não espera pagamento: renova", () =>
    expect(precisaRenovar(lido({ estado: "requires_payment_method", copiaECola: null }), AGORA)).toBe(true));
});

describe("estadoDaPaginaDoPix", () => {
  it("código válido: mostra o código da própria cobrança, sem criar outra", async () => {
    const { rodar, criarPix } = montar(lido());
    expect(await rodar()).toMatchObject({ estado: "pagar", copiaECola: "000201codigo", valorCentavos: 4500 });
    expect(criarPix).not.toHaveBeenCalled();
  });

  it("paga: confirma, sem código", async () => {
    const { rodar, criarPix } = montar(lido({ estado: "succeeded" }));
    expect(await rodar()).toMatchObject({ estado: "pago", valorCentavos: 4500 });
    expect(criarPix).not.toHaveBeenCalled();
  });

  it("vencida: cria outra no MESMO valor e com os MESMOS metadados, marcando a origem", async () => {
    const { rodar, criarPix } = montar(lido({ estado: "requires_payment_method", copiaECola: null }));
    expect(await rodar()).toMatchObject({ estado: "pagar", copiaECola: "000201novo", valorCentavos: 4500 });
    expect(criarPix).toHaveBeenCalledWith(expect.objectContaining({
      valorCentavos: 4500,
      metadados: { contact_id: "k", organization_id: ORG, pix_de_origem: PI },
    }));
  });

  it("a mesma janela devolve a mesma referência (reabrir não cria uma cobrança por clique)", async () => {
    const { rodar, criarPix } = montar(lido({ estado: "canceled", copiaECola: null }));
    await rodar();
    await rodar();
    const refs = criarPix.mock.calls.map((c) => (c as unknown as [{ referencia: string }])[0].referencia);
    expect(new Set(refs).size).toBe(1);
  });

  it("vencida mas uma renovação já foi paga: confirma em vez de cobrar de novo", async () => {
    const { rodar, criarPix } = montar(lido({ estado: "canceled", copiaECola: null }), true);
    expect(await rodar()).toMatchObject({ estado: "pago" });
    expect(criarPix).not.toHaveBeenCalled();
  });

  it("cobrança que não é Pix, ou id inválido: indisponível", async () => {
    expect(await montar(lido({ ehPix: false })).rodar()).toEqual({ estado: "indisponivel" });
    expect(await montar(lido()).rodar("qualquer")).toEqual({ estado: "indisponivel" });
  });
});

describe("a mensagem do Pix", () => {
  it("⭐ só o passo a passo, sem link nenhum — decisão do dono em 29/10", () => {
    const t = instrucaoDoPixCopiaECola("R$ 45,00");
    expect(t).toContain("1. Toque e segure no código");
    expect(t).toContain("Pix Copia e Cola");
    expect(t).not.toMatch(/https?:\/\//);
  });
  it("⭐ o link da Stripe vai só como cartão", () => {
    expect(linhaDoLinkDePagamento("https://buy.stripe.com/x")).toBe("Se preferir pagar no cartão, é por este link: https://buy.stripe.com/x");
  });
});
