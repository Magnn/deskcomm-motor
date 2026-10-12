/**
 * A rota do "Enviar Pix" — o atendente cobra por Pix dentro da conversa.
 *
 * O que ela precisa garantir:
 *   1. a cobrança nasce com o contato DA CONVERSA nos metadados (é o que faz o aviso de pagamento achar a pessoa);
 *   2. saem duas mensagens pelo caminho normal de envio: a instrução e o código sozinho;
 *   3. sem conta de Pix conectada, nada é criado nem enviado;
 *   4. corpo fora do schema e conversa de outra organização não criam cobrança;
 *   5. a auditoria registra quanto e qual cobrança, sem nome de produto.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { lerConexaoStripe } from "@/lib/pagamentos/conexao-stripe";
import { mensagensDoPix } from "@/lib/pagamentos/enviar-pix-tipos";
import { criarClienteStripe } from "@/lib/pagamentos/stripe";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: vi.fn(async () => ({ id: "m" })) }));
vi.mock("@/lib/pagamentos/conexao-stripe", () => ({ lerConexaoStripe: vi.fn() }));
vi.mock("@/lib/pagamentos/stripe", async (original) => ({
  ...(await original<typeof import("@/lib/pagamentos/stripe")>()),
  criarClienteStripe: vi.fn(),
}));

import { POST } from "./route";

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const CONV = "33333333-3333-4333-8333-333333333333";
const CODIGO = "00020101021226740014br.gov.bcb.pix2552pix.exemplo.com/qr/v2/ABC5204000053039865802BR5925Empresa de Pagamentos6009SAO PAULO6304ABCD";

const criarPix = vi.fn();
function conversa(linha: { id: string; contact_id: string | null } | null) {
  vi.mocked(createClient).mockResolvedValue({
    from: () => {
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: linha, error: null }) };
      return chain;
    },
  } as never);
}
const pedido = (corpo: unknown) =>
  POST(new NextRequest(`http://x/api/v1/conversations/${CONV}/pix`, { method: "POST", body: JSON.stringify(corpo) }), { params: Promise.resolve({ id: CONV }) });

beforeEach(() => {
  vi.mocked(audit).mockClear();
  vi.mocked(sendMessageHandler).mockClear();
  criarPix.mockReset().mockResolvedValue({ id: "pi_1", copiaECola: CODIGO, qrPng: null, expiraEm: null });
  vi.mocked(criarClienteStripe).mockReturnValue({ criarPix } as never);
  vi.mocked(lerConexaoStripe).mockResolvedValue({ id: "c", organizationId: ORG, chave: "sk_x", segredoDoAviso: "w" });
  vi.mocked(requireRole).mockResolvedValue({ ok: true, user: { id: USER, idioma: "pt-BR" }, org: { orgId: ORG } } as never);
  conversa({ id: CONV, contact_id: "contato-da-conversa" });
});

describe("POST /conversations/[id]/pix", () => {
  it("⭐ cria a cobrança com o contato da conversa e envia a instrução e o código, nesta ordem", async () => {
    const res = await pedido({ valor_cents: 5000, produto: "Abertura do Coração" });

    expect(res.status).toBe(200);
    expect(criarPix).toHaveBeenCalledWith(
      expect.objectContaining({
        valorCentavos: 5000,
        metadados: { organization_id: ORG, contact_id: "contato-da-conversa", conversation_id: CONV, produto: "Abertura do Coração" },
      }),
    );
    const corpos = vi.mocked(sendMessageHandler).mock.calls.map((c) => (c[2] as { body: string }).body);
    expect(corpos).toEqual(mensagensDoPix(5000, CODIGO));
    expect(corpos[1]).toBe(CODIGO);
    expect(vi.mocked(sendMessageHandler).mock.calls[0]![1]).toMatchObject({ organization_id: ORG, actor: { type: "user", id: USER } });
    expect(vi.mocked(audit).mock.calls[0]![0]).toMatchObject({ action: "payment.pix_sent", metadata: { valor_cents: 5000, cobranca: "pi_1" } });
    expect(JSON.stringify(vi.mocked(audit).mock.calls[0]![0])).not.toContain("Abertura");
  });

  it("sem conta de Pix conectada: 422, nada criado, nada enviado", async () => {
    vi.mocked(lerConexaoStripe).mockResolvedValue(null);
    const res = await pedido({ valor_cents: 5000, produto: "X" });
    expect(res.status).toBe(422);
    expect(criarPix).not.toHaveBeenCalled();
    expect(sendMessageHandler).not.toHaveBeenCalled();
  });

  it("corpo fora do schema e conversa que não é desta organização não criam cobrança", async () => {
    expect((await pedido({ valor_cents: 50, produto: "X" })).status).toBe(422);
    expect((await pedido({ valor_cents: 5000, produto: "X", contato: "outro" })).status).toBe(422);
    conversa(null);
    expect((await pedido({ valor_cents: 5000, produto: "X" })).status).toBe(404);
    expect(criarPix).not.toHaveBeenCalled();
  });

  it("a Stripe recusou: 502 com mensagem, e nenhuma mensagem sai para a pessoa", async () => {
    const { ErroDaStripe } = await import("@/lib/pagamentos/stripe");
    criarPix.mockRejectedValue(new ErroDaStripe("pix_indisponivel", "x"));
    const res = await pedido({ valor_cents: 5000, produto: "X" });
    expect(res.status).toBe(502);
    expect(sendMessageHandler).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});
