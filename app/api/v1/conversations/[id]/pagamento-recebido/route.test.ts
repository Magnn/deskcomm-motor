/**
 * A rota do "Registrar pagamento recebido" — o caminho que declara à mão que o dinheiro entrou.
 *
 * O que ela precisa garantir:
 *   1. só quem escreve registra (agent+), e a recusa de papel passa adiante como veio;
 *   2. corpo fora do schema não grava nada;
 *   3. a conversa é procurada NA organização da sessão — a de outra é "não encontrada";
 *   4. o contato vem da CONVERSA, nunca do corpo;
 *   5. a auditoria registra quanto e como, e nunca o nome do produto;
 *   6. registro repetido não audita de novo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { registrarPagamentoRecebido } from "@/lib/pagamentos/pagamento-recebido";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/leads/encerramento", () => ({ encerraDemanda: vi.fn(async () => ({ lead: {} })) }));
vi.mock("@/lib/pagamentos/pagamento-recebido", async (original) => ({
  ...(await original<typeof import("@/lib/pagamentos/pagamento-recebido")>()),
  depsReaisDoPagamento: vi.fn(() => ({})),
  registrarPagamentoRecebido: vi.fn(),
}));

import { POST } from "./route";

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const CONV = "33333333-3333-4333-8333-333333333333";
const CHAVE = "7b1b6f0e-3c1d-4d0a-9c53-9d0a2f6b1e11";

const filtros: Array<[string, unknown]> = [];
function conversa(linha: { id: string; contact_id: string | null } | null) {
  vi.mocked(createClient).mockResolvedValue({
    from: () => {
      const chain = {
        select: () => chain,
        eq: (coluna: string, valor: unknown) => { filtros.push([coluna, valor]); return chain; },
        maybeSingle: async () => ({ data: linha, error: null }),
      };
      return chain;
    },
  } as never);
}

function pedido(corpo: unknown) {
  return POST(new NextRequest(`http://x/api/v1/conversations/${CONV}/pagamento-recebido`, { method: "POST", body: JSON.stringify(corpo) }), {
    params: Promise.resolve({ id: CONV }),
  });
}
const CORPO = { chave: CHAVE, valor_cents: 13000, produto: "Abertura do Coração" };

beforeEach(() => {
  filtros.length = 0;
  vi.mocked(audit).mockClear();
  vi.mocked(registrarPagamentoRecebido).mockReset();
  vi.mocked(requireRole).mockResolvedValue({ ok: true, user: { id: USER, idioma: "pt-BR" }, org: { orgId: ORG } } as never);
  conversa({ id: CONV, contact_id: "contato-da-conversa" });
});

describe("POST /conversations/[id]/pagamento-recebido", () => {
  it("⭐ registra com o contato DA CONVERSA e audita quanto e como, sem o nome do produto", async () => {
    vi.mocked(registrarPagamentoRecebido).mockResolvedValue({ resultado: "registrado", negocio: "fechado", entrega: "nao_pedida" });

    const res = await pedido(CORPO);

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ resultado: "registrado", negocio: "fechado", entrega: "nao_pedida" });
    const entrada = vi.mocked(registrarPagamentoRecebido).mock.calls[0]![1];
    expect(entrada.contatoId).toBe("contato-da-conversa");
    expect(entrada.pagamento).toMatchObject({ valor_cents: 13000, metodo: "pix", iniciar_entrega: false });
    expect(filtros).toContainEqual(["organization_id", ORG]);
    const linha = vi.mocked(audit).mock.calls[0]![0];
    expect(linha).toMatchObject({ action: "payment.manual_registered", organizationId: ORG, actorUserId: USER, resourceId: CONV });
    expect(linha.metadata).toEqual({ valor_cents: 13000, metodo: "pix", negocio: "fechado", entrega: "nao_pedida" });
    expect(JSON.stringify(linha)).not.toContain("Abertura");
  });

  it("⭐ corpo fora do schema: 422 e nada é registrado", async () => {
    for (const corpo of [{ ...CORPO, valor_cents: 0 }, { ...CORPO, contact_id: "outro-contato" }, { valor_cents: 13000 }]) {
      expect((await pedido(corpo)).status).toBe(422);
    }
    expect(registrarPagamentoRecebido).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("conversa de outra organização (ou fora do que a pessoa enxerga) é 404", async () => {
    conversa(null);
    expect((await pedido(CORPO)).status).toBe(404);
    expect(registrarPagamentoRecebido).not.toHaveBeenCalled();
  });

  it("conversa sem contato: 422, nada registrado", async () => {
    conversa({ id: CONV, contact_id: null });
    expect((await pedido(CORPO)).status).toBe(422);
    expect(registrarPagamentoRecebido).not.toHaveBeenCalled();
  });

  it("quem não pode escrever recebe a recusa de papel, intacta", async () => {
    vi.mocked(requireRole).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await pedido(CORPO)).status).toBe(403);
    expect(registrarPagamentoRecebido).not.toHaveBeenCalled();
  });

  it("registro repetido responde 200 e não audita de novo", async () => {
    vi.mocked(registrarPagamentoRecebido).mockResolvedValue({ resultado: "ja_registrado" });
    const res = await pedido(CORPO);
    expect(res.status).toBe(200);
    expect(audit).not.toHaveBeenCalled();
  });
});
