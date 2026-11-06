/**
 * A renovação sozinha do Plano da Semana no cartão (migration 0954): o link do cartão guarda o cartão, a rodada cobra
 * fora da sessão com os metadados da área e a chave por semana, recusa conta falha e a 3ª desliga, Stripe fora do
 * ar não conta, plano desligado no painel não cobra ninguém.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/branding/saida", () => ({ marcaDaSaida: async () => ({ nome: "Casa" }) }));

import { emailDoAvisoDeRenovacao } from "@/lib/area-do-cliente/email-da-area";
import {
  RECUSAS_ATE_DESLIGAR,
  avisarRenovacoes,
  avisoPermiteCobrar,
  depoisDaRecusa,
  referenciaDaRenovacao,
  renovarPlanosSemanais,
  type LinhaDeRenovacao,
} from "@/lib/area-do-cliente/plano-semanal-renovacao";
import { ErroDaStripe, criarClienteStripe } from "@/lib/pagamentos/stripe";

type Chamada = { url: string; corpo: URLSearchParams; cabecalhos: Record<string, string> };
function gravador(resposta: unknown) {
  const chamadas: Chamada[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    chamadas.push({ url, corpo: new URLSearchParams(String(init.body ?? "")), cabecalhos: (init.headers ?? {}) as Record<string, string> });
    return new Response(JSON.stringify(resposta), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return { chamadas, fetch };
}

/** Um Supabase de mentira: cada `from(tabela)` devolve uma cadeia que registra o que foi pedido e resolve com `responder`. */
function bancoFalso(responder: (tabela: string, op: string, valores: Record<string, unknown> | null) => { data: unknown; error: null }) {
  const escritas: Array<{ tabela: string; valores: Record<string, unknown> }> = [];
  const admin = {
    from(tabela: string) {
      let op = "select";
      let valores: Record<string, unknown> | null = null;
      const cadeia: Record<string, unknown> = {};
      for (const m of ["select", "eq", "not", "lte", "gte", "or", "order", "limit", "in"]) cadeia[m] = () => cadeia;
      cadeia.update = (v: Record<string, unknown>) => {
        op = "update";
        valores = v;
        escritas.push({ tabela, valores: v });
        return cadeia;
      };
      cadeia.then = (ok: (r: unknown) => unknown) => Promise.resolve(responder(tabela, op, valores)).then(ok);
      return cadeia;
    },
  } as unknown as SupabaseClient;
  return { admin, escritas };
}

const AGORA = new Date("2026-11-10T09:00:00Z");
const LINHA: LinhaDeRenovacao = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: "22222222-2222-4222-8222-222222222222",
  contact_id: "33333333-3333-4333-8333-333333333333",
  valido_ate: "2026-11-10T18:00:00Z",
  moeda: "EUR",
  stripe_cliente: "cus_1",
  stripe_cartao: "pm_1",
  falhas: 0,
  // Avisada desta semana há 36 h: pode cobrar.
  aviso_para: "2026-11-10T18:00:00Z",
  aviso_em: "2026-11-08T21:00:00Z",
};
const ORG_COM_PLANO = { id: LINHA.organization_id, settings: { area: { ativo: true, plano_semanal: { ativo: true } } } };

function cenario(linha: LinhaDeRenovacao, org: unknown = ORG_COM_PLANO) {
  return bancoFalso((tabela, op) => {
    if (tabela === "organizations") return { data: [org], error: null };
    if (op === "update") return { data: [{ id: linha.id }], error: null };
    return { data: [linha], error: null };
  });
}

describe("Stripe — o cartão que fica guardado", () => {
  it("⭐ o link do plano no cartão cria o cliente e guarda o cartão para cobrar fora da sessão", async () => {
    const { chamadas, fetch } = gravador({ id: "plink_1", url: "https://buy.stripe.com/x" });
    await criarClienteStripe({ chave: "sk" }, { fetch }).criarLinkDePagamento({
      valorCentavos: 100,
      moeda: "EUR",
      descricao: "Plano da Semana — 7 dias",
      referencia: "r",
      metadados: { extra: "plano-semanal" },
      mensagemDepoisDePagar: "ok",
      guardarCartao: true,
    });
    const c = chamadas[0]!.corpo;
    expect(c.get("customer_creation")).toBe("always");
    expect(c.get("payment_intent_data[setup_future_usage]")).toBe("off_session");
    expect(c.get("payment_method_types[0]")).toBe("card");
  });

  it("⭐ a cobrança da renovação é fora da sessão, confirmada na hora, com a chave da semana e os metadados", async () => {
    const { chamadas, fetch } = gravador({ id: "pi_1", status: "succeeded" });
    const r = await criarClienteStripe({ chave: "sk", conta: "acct_1", taxa: { fixoCentavos: 99, percentualBp: 0, tetoCentavos: 0 } }, { fetch }).cobrarCartaoGuardado({
      valorCentavos: 500,
      moeda: "BRL",
      descricao: "Plano",
      cliente: "cus_1",
      cartao: "pm_1",
      referencia: "renova-plano-x-1",
      metadados: { extra: "plano-semanal", renovacao: "1" },
    });
    expect(r).toEqual({ id: "pi_1", status: "succeeded" });
    const { url, corpo, cabecalhos } = chamadas[0]!;
    expect(url).toMatch(/\/payment_intents$/);
    expect(corpo.get("off_session")).toBe("true");
    expect(corpo.get("confirm")).toBe("true");
    expect(corpo.get("customer")).toBe("cus_1");
    expect(corpo.get("payment_method")).toBe("pm_1");
    expect(corpo.get("metadata[extra]")).toBe("plano-semanal");
    expect(corpo.get("application_fee_amount")).toBe("99");
    expect(cabecalhos["Idempotency-Key"]).toBe("renova-plano-x-1");
    expect(cabecalhos["Stripe-Account"]).toBe("acct_1");
  });

  it("em euro ou dólar a renovação não leva a taxa em reais", async () => {
    const { chamadas, fetch } = gravador({ id: "pi_1", status: "succeeded" });
    await criarClienteStripe({ chave: "sk", conta: "acct_1", taxa: { fixoCentavos: 99, percentualBp: 0, tetoCentavos: 0 } }, { fetch }).cobrarCartaoGuardado({
      valorCentavos: 100, moeda: "EUR", descricao: "P", cliente: "c", cartao: "p", referencia: "r", metadados: {},
    });
    expect(chamadas[0]!.corpo.get("application_fee_amount")).toBeNull();
  });
});

describe("a rodada de renovação", () => {
  it("regras puras: recusa espera 24 h; a 3ª seguida desliga; a chave muda a cada semana", () => {
    expect(depoisDaRecusa(0, AGORA)).toEqual({ falhas: 1, renova: true, proxima_tentativa: "2026-11-11T09:00:00.000Z" });
    expect(depoisDaRecusa(RECUSAS_ATE_DESLIGAR - 1, AGORA).renova).toBe(false);
    expect(referenciaDaRenovacao("a", "2026-11-10T18:00:00Z")).not.toBe(referenciaDaRenovacao("a", "2026-11-17T18:00:00Z"));
    expect(referenciaDaRenovacao("a", "2026-11-10T18:00:00Z")).toBe(referenciaDaRenovacao("a", "2026-11-10T18:00:00.000Z"));
  });

  it("⭐ cobra no preço da moeda da pessoa, com os metadados que o aviso de sempre entende", async () => {
    const { admin } = cenario(LINHA);
    const cobrar = vi.fn(async () => ({ status: "succeeded" }));
    const r = await renovarPlanosSemanais(admin, AGORA, cobrar);
    expect(r.cobradas).toBe(1);
    expect(cobrar).toHaveBeenCalledWith(admin, LINHA.organization_id, expect.objectContaining({
      valorCentavos: 100,
      moeda: "EUR",
      cliente: "cus_1",
      cartao: "pm_1",
      metadados: expect.objectContaining({ extra: "plano-semanal", contact_id: LINHA.contact_id, organization_id: LINHA.organization_id, renovacao: "1" }),
    }));
  });

  it("cartão recusado conta uma falha e marca nova tentativa; a 3ª desliga a renovação", async () => {
    const { admin, escritas } = cenario({ ...LINHA, falhas: 2 });
    const r = await renovarPlanosSemanais(admin, AGORA, async () => {
      throw new ErroDaStripe("recusada", "card_declined");
    });
    expect(r).toMatchObject({ recusadas: 1, desligadas: 1 });
    expect(escritas.at(-1)!.valores).toMatchObject({ falhas: 3, renova: false });
  });

  it("o banco pedindo autenticação também é recusa (não fica cobrando em silêncio)", async () => {
    const { admin } = cenario(LINHA);
    const r = await renovarPlanosSemanais(admin, AGORA, async () => ({ status: "requires_action" }));
    expect(r.recusadas).toBe(1);
  });

  it("Stripe fora do ar não conta como recusa", async () => {
    const { admin, escritas } = cenario(LINHA);
    const r = await renovarPlanosSemanais(admin, AGORA, async () => {
      throw new ErroDaStripe("indisponivel", "timeout");
    });
    expect(r).toMatchObject({ recusadas: 0, adiadas: 1 });
    expect(escritas.some((e) => "falhas" in e.valores)).toBe(false);
  });

  it("plano desligado no painel não cobra ninguém", async () => {
    const { admin } = cenario(LINHA, { id: LINHA.organization_id, settings: { area: { ativo: true, plano_semanal: { ativo: false } } } });
    const cobrar = vi.fn(async () => ({ status: "succeeded" }));
    const r = await renovarPlanosSemanais(admin, AGORA, cobrar);
    expect(cobrar).not.toHaveBeenCalled();
    expect(r.adiadas).toBe(1);
  });
});

describe("o aviso antes de renovar (0958)", () => {
  it("⭐ sem aviso desta semana, ou com aviso de menos de 24 h, a renovação NÃO cobra", async () => {
    expect(avisoPermiteCobrar(LINHA, AGORA)).toBe(true);
    expect(avisoPermiteCobrar({ ...LINHA, aviso_para: null, aviso_em: null }, AGORA)).toBe(false);
    expect(avisoPermiteCobrar({ ...LINHA, aviso_para: "2026-11-03T18:00:00Z" }, AGORA)).toBe(false); // aviso da semana passada
    expect(avisoPermiteCobrar({ ...LINHA, aviso_em: "2026-11-09T12:00:00Z" }, AGORA)).toBe(false); // 21 h atrás
    const { admin } = cenario({ ...LINHA, aviso_para: null, aviso_em: null });
    const cobrar = vi.fn(async () => ({ status: "succeeded" }));
    const r = await renovarPlanosSemanais(admin, AGORA, cobrar);
    expect(cobrar).not.toHaveBeenCalled();
    expect(r.sem_aviso).toBe(1);
  });

  const SEM_AVISO = { ...LINHA, valido_ate: "2026-11-12T00:00:00Z", moeda: "BRL" as const, aviso_para: null, aviso_em: null };
  const ORG = { id: LINHA.organization_id, slug: "casa", timezone: "America/Sao_Paulo", settings: { area: { ativo: true, titulo: "Meu Mistério", plano_semanal: { ativo: true, preco_cents: 500 } } } };
  function cenarioDoAviso(contato: unknown) {
    return bancoFalso((tabela, op) => {
      if (tabela === "organizations") return { data: [ORG], error: null };
      if (tabela === "contacts") return { data: contato ? [contato] : [], error: null };
      if (op === "update") return { data: [{ id: SEM_AVISO.id }], error: null };
      return { data: [SEM_AVISO], error: null };
    });
  }

  it("⭐ manda o e-mail com valor, dia e o caminho para cancelar, e marca a semana avisada", async () => {
    const { admin, escritas } = cenarioDoAviso({ id: SEM_AVISO.contact_id, organization_id: SEM_AVISO.organization_id, name: "Maria Souza", display_name: null, email: "maria@x.com" });
    const mandar = vi.fn(async () => ({ ok: true }));
    const r = await avisarRenovacoes(admin, AGORA, mandar);
    expect(r).toEqual({ avisados: 1, sem_email: 0, avisos_falhos: 0 });
    expect(escritas[0]!.valores).toEqual({ aviso_para: SEM_AVISO.valido_ate, aviso_em: AGORA.toISOString() });
    const [envio] = mandar.mock.calls[0] as unknown as [{ to: string; subject: string; text: string }];
    expect(envio.to).toBe("maria@x.com");
    expect(envio.text).toContain("Oi, Maria.");
    expect(envio.text).toContain("R$ 5,00");
    expect(envio.text).toContain("11 de novembro"); // 12 h antes de 12/11 00:00 UTC, em São Paulo
    expect(envio.text).toContain("Cancelar renovação");
    expect(envio.text).toContain("/c/casa?aba=explorar");
    expect(envio.subject).toContain("Meu Mistério");
  });

  it("sem e-mail no contato não avisa (e por isso não cobra); contato de outra empresa também não", async () => {
    const r1 = await avisarRenovacoes(cenarioDoAviso({ id: SEM_AVISO.contact_id, organization_id: SEM_AVISO.organization_id, name: null, display_name: null, email: null }).admin, AGORA, vi.fn());
    expect(r1.sem_email).toBe(1);
    const r2 = await avisarRenovacoes(cenarioDoAviso({ id: SEM_AVISO.contact_id, organization_id: "outra", name: null, display_name: null, email: "a@b.c" }).admin, AGORA, vi.fn());
    expect(r2.sem_email).toBe(1);
  });

  it("e-mail que não saiu desmarca o aviso, para a próxima rodada tentar de novo", async () => {
    const { admin, escritas } = cenarioDoAviso({ id: SEM_AVISO.contact_id, organization_id: SEM_AVISO.organization_id, name: null, display_name: null, email: "a@b.c" });
    const r = await avisarRenovacoes(admin, AGORA, async () => ({ ok: false }));
    expect(r.avisos_falhos).toBe(1);
    expect(escritas.at(-1)!.valores).toEqual({ aviso_para: null, aviso_em: null });
  });

  it("fora do Brasil o aviso sai em inglês, na moeda da pessoa", () => {
    const m = emailDoAvisoDeRenovacao({ titulo: null, marcaDaOrganizacao: "Casa", nomeDoPlano: "Weekly Plan", nomeDaPessoa: null, valor: "€1.00", dia: "November 11", link: "https://x/c/casa", emPortugues: false });
    expect(m.text).toContain("€1.00");
    expect(m.text).toContain("Cancel renewal");
    expect(m.html).not.toContain("<script");
  });
});
