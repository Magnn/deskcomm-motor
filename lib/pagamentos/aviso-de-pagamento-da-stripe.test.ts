import { beforeEach, describe, expect, it, vi } from "vitest";

const liberarCompraDaArea = vi.fn();
const reportarCompraAvulsa = vi.fn();
const pedirTurnoDoPagamento = vi.fn();
const audit = vi.fn();

vi.mock("@/lib/area-do-cliente/compras-da-area", () => ({
  liberarCompraDaArea: (...a: unknown[]) => liberarCompraDaArea(...a),
}));
vi.mock("@/lib/conversoes/compra-avulsa", () => ({
  reportarCompraAvulsa: (...a: unknown[]) => reportarCompraAvulsa(...a),
}));
vi.mock("@/lib/pagamentos/pedir-turno-do-pagamento", () => ({
  pedirTurnoDoPagamento: (...a: unknown[]) => pedirTurnoDoPagamento(...a),
}));
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => audit(...a) }));
vi.mock("@/lib/area-do-cliente/eventos", () => ({ registrarEvento: vi.fn() }));
vi.mock("@/lib/area-do-cliente/email-do-contato", () => ({ guardarEmailDoContato: vi.fn() }));
vi.mock("@/lib/pagamentos/stripe", () => ({
  criarClienteStripe: () => ({ lerEmailDoPagador: async () => null, lerValorConvertido: async () => null }),
}));

const { aplicarAvisoDePagamentoDaStripe } = await import("./aviso-de-pagamento-da-stripe");

const ORG = "11111111-1111-4111-8111-111111111111";
const CONTATO = "22222222-2222-4222-8222-222222222222";

/** Banco falso: o livro de receita responde com o erro escolhido; o contato existe sem marcas. */
function bancoFalso(erroDoLivro: { code: string; message: string } | null) {
  const encadeia = (fim: unknown) => {
    const f: Record<string, unknown> = {};
    f.eq = () => f;
    f.maybeSingle = async () => fim;
    f.then = (ok: (v: unknown) => unknown) => ok(fim);
    return f;
  };
  return {
    from: (tabela: string) => ({
      insert: async () => ({ error: tabela === "revenue_ledger" ? erroDoLivro : null }),
      select: () => encadeia({ data: { id: CONTATO, tags: [] }, error: null }),
      update: () => encadeia({ error: null }),
    }),
  } as never;
}

const conexao = { id: "con-1", organizationId: ORG } as never;
const evento = {
  type: "payment_intent.succeeded",
  data: {
    object: {
      id: "pi_123",
      amount_received: 1500,
      currency: "brl",
      payment_method_types: ["pix"],
      metadata: {
        contact_id: CONTATO,
        organization_id: ORG,
        extra: "leitura",
        leitura_id: "33333333-3333-4333-8333-333333333333",
        conversation_id: "44444444-4444-4444-8444-444444444444",
      },
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  reportarCompraAvulsa.mockResolvedValue({ status: "ok" });
});

describe("cobrança avulsa paga pela Stripe", () => {
  it("a reentrega libera a compra que a 1ª entrega não conseguiu liberar", async () => {
    // 1ª entrega: o livro grava, a liberação na área cai → 500 para a Stripe reentregar
    liberarCompraDaArea.mockRejectedValueOnce(new Error("conexão caiu"));
    const primeira = await aplicarAvisoDePagamentoDaStripe(bancoFalso(null), conexao, evento, "r1");
    expect(primeira.status).toBe(500);

    // reentrega: o livro já tem a cobrança (23505), e a liberação tem de rodar de novo
    liberarCompraDaArea.mockResolvedValueOnce(undefined);
    const segunda = await aplicarAvisoDePagamentoDaStripe(
      bancoFalso({ code: "23505", message: "duplicate key" }),
      conexao,
      evento,
      "r2",
    );
    expect(segunda.status).toBe(200);
    expect(await segunda.json()).toMatchObject({ data: { resultado: "repetida" } });
    expect(liberarCompraDaArea).toHaveBeenCalledTimes(2);
    expect(liberarCompraDaArea.mock.calls[1]).toContain("pi_123");
  });

  it("a reentrega não reporta o anúncio de novo nem pede outro turno ao agente", async () => {
    await aplicarAvisoDePagamentoDaStripe(
      bancoFalso({ code: "23505", message: "duplicate key" }),
      conexao,
      evento,
      "r3",
    );
    expect(reportarCompraAvulsa).not.toHaveBeenCalled();
    expect(pedirTurnoDoPagamento).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("a 1ª entrega faz tudo uma vez", async () => {
    const r = await aplicarAvisoDePagamentoDaStripe(bancoFalso(null), conexao, evento, "r4");
    expect(await r.json()).toMatchObject({ data: { resultado: "cobranca_avulsa" } });
    expect(liberarCompraDaArea).toHaveBeenCalledTimes(1);
    expect(reportarCompraAvulsa).toHaveBeenCalledTimes(1);
    expect(pedirTurnoDoPagamento).toHaveBeenCalledTimes(1);
  });
});
