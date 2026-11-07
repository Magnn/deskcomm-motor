/**
 * A LEITURA DO QUIZ ENTREGUE DENTRO DA ÁREA ("Suas leituras", `lib/area-do-cliente/leitura-do-quiz.ts`).
 *
 * O que este arquivo guarda:
 *  - a rota pela sessão só abre o pedido DELA (filtra organização E contato) e só depois de pago;
 *  - com o texto pronto, devolve sem chamar a IA; sem texto, escreve pela mesma função da página do quiz;
 *  - a listagem traz só os pedidos pagos, com o nome do produto.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PEDIDO = "55555555-5555-4555-8555-555555555555";

const h = vi.hoisted(() => ({
  sessao: { contactId: "contato-1" } as { contactId: string } | null,
  linha: null as Record<string, unknown> | null,
  linhas: [] as unknown[],
  filtros: [] as Array<[string, unknown]>,
  escrever: vi.fn(),
}));

function adminFalso() {
  return {
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit", "not"]) q[m] = () => q;
      q.eq = (c: string, v: unknown) => {
        h.filtros.push([c, v]);
        return q;
      };
      q.maybeSingle = async () => ({ data: h.linha, error: null });
      q.then = (ok: (v: unknown) => unknown) => ok({ data: h.linhas, error: null });
      return q;
    },
  };
}

vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/area-do-cliente/http", () => ({
  NAO_ENCONTRADA: () => new Response("não", { status: 404 }),
  contextoDaArea: async () => ({ org: { id: "org-1", slug: "cigana", nome: "Cigana", config: { titulo: "Cigana" } }, sessao: h.sessao, admin: adminFalso() }),
}));
vi.mock("@/lib/area-do-cliente/leitura-do-quiz", async (original) => ({
  ...((await original()) as object),
  escreverLeituraDoQuiz: h.escrever,
}));

async function pedir() {
  const { POST } = await import("@/app/api/v1/area/publica/[org]/quiz-leituras/[id]/route");
  const req = new NextRequest(`https://x.test/api/v1/area/publica/cigana/quiz-leituras/${PEDIDO}`, { method: "POST" });
  return POST(req, { params: Promise.resolve({ org: "cigana", id: PEDIDO }) });
}

const PAGO = { id: PEDIDO, contact_id: "contato-1", tipo: "sombra", nome: "Ana", nascimento: null, respostas: {}, pago_at: "2026-11-07T10:00:00Z", texto: null };

beforeEach(() => {
  h.sessao = { contactId: "contato-1" };
  h.linha = null;
  h.linhas = [];
  h.filtros = [];
  h.escrever.mockReset().mockResolvedValue("A sua leitura.");
});

describe("Suas leituras — a rota pela sessão", () => {
  it("⭐ sem sessão da área: 401, nada lido", async () => {
    h.sessao = null;
    expect((await pedir()).status).toBe(401);
    expect(h.escrever).not.toHaveBeenCalled();
  });

  it("⭐ só procura o pedido desta organização e DESTE contato", async () => {
    h.linha = PAGO;
    await pedir();
    expect(h.filtros).toEqual(expect.arrayContaining([["id", PEDIDO], ["organization_id", "org-1"], ["contact_id", "contato-1"]]));
  });

  it("pedido de outra pessoa (não achado com o contato dela): 404", async () => {
    expect((await pedir()).status).toBe(404);
  });

  it("não pago: 402, sem IA", async () => {
    h.linha = { ...PAGO, pago_at: null };
    expect((await pedir()).status).toBe(402);
    expect(h.escrever).not.toHaveBeenCalled();
  });

  it("⭐ texto pronto volta sem chamar a IA; sem texto, escreve agora", async () => {
    h.linha = { ...PAGO, texto: "Já escrita." };
    const pronta = await pedir();
    expect(((await pronta.json()) as { data: { texto: string } }).data.texto).toBe("Já escrita.");
    expect(h.escrever).not.toHaveBeenCalled();

    h.linha = PAGO;
    const nova = await pedir();
    expect(((await nova.json()) as { data: { texto: string } }).data.texto).toBe("A sua leitura.");
    expect(h.escrever).toHaveBeenCalledTimes(1);
  });

  it("a IA não respondeu: 502 para a tela oferecer tentar de novo", async () => {
    h.linha = PAGO;
    h.escrever.mockResolvedValue(null);
    expect((await pedir()).status).toBe(502);
  });
});

describe("Suas leituras — a listagem", () => {
  it("⭐ traz os pedidos pagos com o nome do produto, e pede só os pagos dela", async () => {
    const { leiturasDosQuizzes } = await import("@/lib/area-do-cliente/leitura-do-quiz");
    h.linhas = [{ id: PEDIDO, tipo: "sombra", texto: null, pago_at: "2026-11-07T10:00:00Z" }];
    const l = await leiturasDosQuizzes(adminFalso() as never, "org-1", "contato-1");
    expect(l).toEqual([{ id: PEDIDO, tipo: "sombra", titulo: "O Código da Sombra", texto: null, quando: "2026-11-07T10:00:00Z" }]);
    expect(h.filtros).toEqual(expect.arrayContaining([["organization_id", "org-1"], ["contact_id", "contato-1"]]));
  });
});
