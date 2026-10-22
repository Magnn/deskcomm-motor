/**
 * COMPRA DIRETA NA ÁREA DO CLIENTE — o "Quero este" da vitrine.
 *
 * O que este arquivo guarda (pedido do dono em 18/10/2026: comprar ali mesmo, falar com a agente só se quiser):
 *  - com a Stripe conectada, o clique vira um link de pagamento DA PESSOA, com `contact_id` e o nome do serviço
 *    em `produto` (é ele que escolhe o fluxo de entrega) e sem `extra` (é compra principal);
 *  - sem Stripe, ou com a Stripe falhando, o botão segue para o `link_checkout` — nunca morre;
 *  - sem sessão, volta para a área sem criar cobrança.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  sessao: { contactId: "contato-1", sessaoId: "sessao-1" } as { contactId: string; sessaoId: string } | null,
  conexao: { chave: "sk_x", conta: "acct_1" } as unknown,
  criarLink: vi.fn(),
  evento: vi.fn(),
}));

const SERVICO = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "Limpeza e Proteção",
  preco_cents: 6000,
  currency: "BRL",
  link_checkout: "https://wa.me/556900000000",
};

vi.mock("@/lib/area-do-cliente/http", () => ({
  NAO_ENCONTRADA: () => new Response("não", { status: 404 }),
  irPara: (caminho: string) => new Response(null, { status: 303, headers: { location: caminho } }),
  contextoDaArea: async () => ({
    org: { id: "org-1", slug: "magno", fuso: "America/Rio_Branco", config: { ativo: true } },
    sessao: h.sessao,
    admin: {
      from: () => {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = () => q;
        q.maybeSingle = async () => ({ data: SERVICO, error: null });
        return q;
      },
    },
  }),
}));
vi.mock("@/lib/area-do-cliente/eventos", () => ({ registrarEvento: h.evento }));
vi.mock("@/lib/pagamentos/conexao-stripe", () => ({ lerConexaoStripe: async () => h.conexao }));
vi.mock("@/lib/pagamentos/stripe", () => ({ criarClienteStripe: () => ({ criarLinkDePagamento: h.criarLink }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

async function clicar() {
  const { GET } = await import("@/app/c/[org]/comprar/[servico]/route");
  return GET(new NextRequest(`https://area.test/c/magno/comprar/${SERVICO.id}`), {
    params: Promise.resolve({ org: "magno", servico: SERVICO.id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.sessao = { contactId: "contato-1", sessaoId: "sessao-1" };
  h.conexao = { chave: "sk_x", conta: "acct_1" };
  h.criarLink.mockResolvedValue({ id: "plink_1", url: "https://buy.stripe.com/abc" });
});

describe("GET /c/[org]/comprar/[servico]", () => {
  it("com a Stripe conectada, cria o pagamento da pessoa e manda direto para ele", async () => {
    const res = await clicar();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://buy.stripe.com/abc");
    const pedido = h.criarLink.mock.calls[0]![0];
    expect(pedido).toMatchObject({ valorCentavos: 6000, moeda: "BRL", descricao: "Limpeza e Proteção" });
    expect(pedido.metadados).toEqual({ organization_id: "org-1", contact_id: "contato-1", produto: "Limpeza e Proteção", origem: "area" });
    expect(pedido.metadados).not.toHaveProperty("extra");
    expect(h.evento).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tipo: "checkout_clicado", props: { via: "stripe" } }));
  });

  it("sem Stripe conectada, segue para o link do serviço", async () => {
    h.conexao = null;
    const res = await clicar();
    expect(res.headers.get("location")).toBe(SERVICO.link_checkout);
    expect(h.criarLink).not.toHaveBeenCalled();
    expect(h.evento).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ props: { via: "link" } }));
  });

  it("se a Stripe falhar, o botão não morre: segue para o link do serviço", async () => {
    h.criarLink.mockRejectedValue(new Error("stripe fora"));
    const res = await clicar();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(SERVICO.link_checkout);
  });

  it("sem sessão, volta para a área e não cria cobrança", async () => {
    h.sessao = null;
    const res = await clicar();
    expect(res.headers.get("location")).toBe("/c/magno");
    expect(h.criarLink).not.toHaveBeenCalled();
  });
});
