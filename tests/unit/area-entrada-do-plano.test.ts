/**
 * A ENTRADA PELO PLANO DE 7 DIAS vendida na página (migration 0955, `lib/area-do-cliente/entrada.ts`).
 *
 * O que este arquivo guarda:
 *  - uma entrada por pessoa: quem já teve plano ou entrada paga recebe 409 e nenhuma cobrança;
 *  - o valor sai do Plano da Semana da empresa (nunca do corpo), com o extra do plano, o id do pedido nos metadados
 *    e SEM guardar o cartão (nada renova sozinho);
 *  - o aviso de pagamento estende o plano, marca o pedido e dá as boas-vindas uma vez por pessoa — só com os créditos
 *    ligados, e na quantidade da empresa;
 *  - a data de nascimento é de verdade e de maior de idade.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { nascimentoAceito, podeComprarAEntrada, referenciaDasBoasVindas } from "@/lib/area-do-cliente/entrada";

const ENTRADA = "44444444-4444-4444-8444-444444444444";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  cobranca: vi.fn(),
  eventos: [] as Array<Record<string, unknown>>,
  chamadas: [] as Array<[string, string, unknown]>,
  settings: {} as Record<string, unknown>,
  config: {} as Record<string, unknown>,
  contatoExistente: null as string | null,
  linhas: {} as Record<string, unknown[]>,
}));

function adminFalso() {
  return {
    rpc: h.rpc,
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      const reg = (metodo: string) => (arg: unknown, ...resto: unknown[]) => {
        h.chamadas.push([tabela, metodo, resto.length ? [arg, ...resto] : arg]);
        return q;
      };
      for (const m of ["update", "delete", "eq", "is", "select", "not", "gte", "order", "limit", "upsert"]) q[m] = reg(m);
      q.insert = (linha: unknown) => {
        h.chamadas.push([tabela, "insert", linha]);
        return { select: () => ({ single: async () => ({ data: { id: tabela === "contacts" ? "contato-novo" : ENTRADA }, error: null }) }) };
      };
      q.maybeSingle = async () => ({
        data: tabela === "organizations" ? { settings: h.settings } : tabela === "contacts" && h.contatoExistente ? { id: h.contatoExistente } : null,
        error: null,
      });
      q.then = (ok: (v: unknown) => unknown) => ok({ data: h.linhas[tabela] ?? [], error: null });
      return q;
    },
  };
}

vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/area-do-cliente/eventos", () => ({
  registrarEvento: vi.fn(async (_admin: unknown, e: Record<string, unknown>) => {
    h.eventos.push(e);
  }),
}));
vi.mock("@/lib/area-do-cliente/cobranca", () => ({ SemPagamento: class extends Error {}, criarCobrancaDaArea: h.cobranca }));
vi.mock("@/lib/area-do-cliente/http", () => ({
  NAO_ENCONTRADA: () => new Response("não", { status: 404 }),
  dentroDoLimite: async () => true,
  contextoDaArea: async () => ({
    org: { id: "org-1", slug: "magno", nome: "Cigana", fuso: "America/Sao_Paulo", config: h.config },
    sessao: null,
    admin: adminFalso(),
  }),
}));

beforeEach(() => {
  h.rpc.mockReset().mockResolvedValue({ data: [{ resultado: "aplicado", saldo: 20 }], error: null });
  h.cobranca.mockReset().mockResolvedValue({ forma: "pix", copiaECola: "000201", qrPng: null });
  h.eventos = [];
  h.chamadas = [];
  h.settings = {};
  h.config = { plano_semanal: { ativo: true }, creditos: { ativo: true } };
  h.contatoExistente = null;
  h.linhas = {};
});

async function postar(corpo: unknown) {
  const { POST } = await import("@/app/api/v1/area/publica/[org]/entrada/route");
  const res = await POST(new NextRequest("https://area.test/api/v1/area/publica/magno/entrada", { method: "POST", body: JSON.stringify(corpo) }), {
    params: Promise.resolve({ org: "magno" }),
  });
  return { status: res.status, json: (await res.json()) as { data?: Record<string, unknown>; error?: { code: string } } };
}

const CORPO = { nome: "Ana", email: "Ana@Exemplo.com", nascimento: "1980-05-10", foco: "amor", forma: "pix", moeda: "BRL" };

describe("regras da entrada", () => {
  it("⭐ uma entrada por pessoa: quem já teve plano ou já pagou a entrada não compra de novo", () => {
    expect(podeComprarAEntrada({ jaTevePlano: false, jaPagouEntrada: false })).toBe(true);
    expect(podeComprarAEntrada({ jaTevePlano: true, jaPagouEntrada: false })).toBe(false);
    expect(podeComprarAEntrada({ jaTevePlano: false, jaPagouEntrada: true })).toBe(false);
  });

  it("nascimento: data que existe e maior de 18", () => {
    const hoje = new Date("2026-11-03T12:00:00Z");
    expect(nascimentoAceito("1980-05-10", hoje)).toBe(true);
    expect(nascimentoAceito("1980-02-30", hoje)).toBe(false);
    expect(nascimentoAceito("2012-01-01", hoje)).toBe(false);
    expect(nascimentoAceito("1900-01-01", hoje)).toBe(false);
  });

  it("as boas-vindas têm UMA referência por pessoa (não por pagamento)", () => {
    expect(referenciaDasBoasVindas("c-1")).toBe("boas-vindas-c-1");
  });
});

describe("POST /entrada", () => {
  it("⭐ pessoa nova: cria o contato e o pedido, cobra o preço do plano com o id do pedido e sem guardar o cartão", async () => {
    const r = await postar({ ...CORPO, valor: 1 });
    expect(r.status).toBe(422); // o corpo não aceita campo a mais — o valor nunca vem do navegador

    const ok = await postar(CORPO);
    expect(ok.status).toBe(200);
    expect(ok.json.data).toMatchObject({ id: ENTRADA, cobranca: { forma: "pix" } });
    expect(typeof ok.json.data?.segredo).toBe("string");
    expect(h.chamadas).toContainEqual(["contacts", "insert", expect.objectContaining({ email: "ana@exemplo.com", birthdate: "1980-05-10" })]);
    expect(h.chamadas).toContainEqual(["area_entradas", "insert", expect.objectContaining({ contact_id: "contato-novo", foco: "amor", moeda: "BRL" })]);
    expect(h.cobranca).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        valorCentavos: 500,
        extra: "plano-semanal",
        metadados: { entrada_id: ENTRADA, moeda: "BRL" },
        guardarCartao: false,
      }),
    );
  });

  it("⭐ quem já teve plano recebe 409 e nenhuma cobrança", async () => {
    h.contatoExistente = "contato-antigo";
    h.linhas = { area_planos: [{ id: "p-1" }] };
    const r = await postar(CORPO);
    expect(r.status).toBe(409);
    expect(r.json.error?.code).toBe("ja_tem_area");
    expect(h.cobranca).not.toHaveBeenCalled();
    expect(h.chamadas.some(([t, m]) => t === "area_entradas" && m === "insert")).toBe(false);
  });

  it("plano desligado: 404; dólar usa o preço internacional; Pix fora do real é recusado", async () => {
    h.config = { plano_semanal: { ativo: false } };
    expect((await postar(CORPO)).status).toBe(404);

    h.config = { plano_semanal: { ativo: true } };
    expect((await postar({ ...CORPO, moeda: "USD", forma: "pix" })).status).toBe(422);
    const usd = await postar({ ...CORPO, moeda: "USD", forma: "cartao" });
    expect(usd.status).toBe(200);
    expect(h.cobranca).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ valorCentavos: 100, moeda: "USD", guardarCartao: false }));
  });
});

describe("o aviso de pagamento da entrada", () => {
  it("⭐ estende o plano, marca o pedido e dá as boas-vindas da empresa, com a referência da pessoa", async () => {
    h.settings = { area: { ativo: true, creditos: { ativo: true }, plano_semanal: { ativo: true, creditos_de_entrada: 20 } } };
    h.linhas = { area_entradas: [{ foco: "eu" }] };
    const { liberarCompraDaArea } = await import("@/lib/area-do-cliente/compras-da-area");
    await liberarCompraDaArea(adminFalso() as never, "org-1", "c-1", "pi_1", "plano-semanal", { entrada_id: ENTRADA, moeda: "BRL" }, "pix");
    // O foco da página vira o perfil da área ("eu" = autoconhecimento), sem pisar no perfil que ela já tenha.
    expect(h.chamadas).toContainEqual([
      "area_perfis",
      "upsert",
      [{ organization_id: "org-1", contact_id: "c-1", foco: "autoconhecimento" }, { onConflict: "organization_id,contact_id", ignoreDuplicates: true }],
    ]);
    expect(h.chamadas).toContainEqual(["area_planos", "insert", expect.objectContaining({ contact_id: "c-1", plano: "semanal" })]);
    expect(h.chamadas).toContainEqual(["area_entradas", "update", expect.objectContaining({ pagamento: "pi_1" })]);
    expect(h.rpc).toHaveBeenCalledWith("fn_area_creditos_mover", {
      p_org: "org-1",
      p_contact: "c-1",
      p_delta: 20,
      p_motivo: "boas_vindas",
      p_referencia: "boas-vindas-c-1",
    });
    expect(h.eventos).toContainEqual(expect.objectContaining({ tipo: "plano_ativado", props: expect.objectContaining({ origem: "entrada", renova: false }) }));
  });

  it("créditos desligados (ou zero na empresa): o plano vale, mas nada é creditado", async () => {
    const { liberarCompraDaArea } = await import("@/lib/area-do-cliente/compras-da-area");
    h.settings = { area: { ativo: true } };
    await liberarCompraDaArea(adminFalso() as never, "org-1", "c-1", "pi_2", "plano-semanal", { entrada_id: ENTRADA }, "pix");
    h.settings = { area: { ativo: true, creditos: { ativo: true }, plano_semanal: { creditos_de_entrada: 0 } } };
    await liberarCompraDaArea(adminFalso() as never, "org-1", "c-1", "pi_3", "plano-semanal", { entrada_id: ENTRADA }, "pix");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("o plano renovado dentro da área (sem pedido de entrada) não credita boas-vindas", async () => {
    h.settings = { area: { ativo: true, creditos: { ativo: true } } };
    const { liberarCompraDaArea } = await import("@/lib/area-do-cliente/compras-da-area");
    await liberarCompraDaArea(adminFalso() as never, "org-1", "c-1", "pi_4", "plano-semanal", { moeda: "BRL" }, "cartao");
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.chamadas.some(([t]) => t === "area_entradas" || t === "area_perfis")).toBe(false);
  });
});
