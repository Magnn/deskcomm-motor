/**
 * A trava do número e a queda da assinatura. O que se cobra: desligada, a cobrança
 * não muda nada; ligada, só conecta quem tem plano em dia e dentro do limite; e
 * quem nunca assinou não é silenciado quando a instalação liga a cobrança.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PROVIDERS_DE_NUMERO, PROVIDERS_QUE_NAO_SAO_NUMERO } from "@/lib/channels/capabilities";

const h = vi.hoisted(() => ({ env: { PLANS_ENFORCED: "", PLANS_CATALOG: "" }, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: h.env }));
vi.mock("@/lib/logger", () => ({ logger: h.log }));

const {
  assinaturaCaiu,
  ativarPlano,
  esquecerMemoDasAssinaturas,
  inativarPlano,
  mensagemDaRecusa,
  planosAtivos,
  planosDaInstalacao,
  recusaParaNovoNumero,
  situacaoDosNumeros,
} = await import("./assinatura-da-organizacao");

type Linha = { plan_id: string; status: string; source: string; reference: string | null; reason: string | null; updated_at: string };

let assinatura: Linha | null;
let numeros: number;
/** Quando preenchido, a contagem sai destas sessões e respeita o filtro de provider da consulta. */
let sessoes: Array<{ provider: string; archived_at: string | null }> | null = null;
let erroDeLeitura: string | null;
let gravacoes: Array<{ op: string; valor: unknown; filtros: Array<[string, unknown]> }>;

function adminFake() {
  return {
    from(tabela: string) {
      if (tabela === "channel_sessions") {
        let provedores: readonly string[] | null = null;
        const q = {
          select: () => q,
          eq: () => q,
          in: (_coluna: string, valores: readonly string[]) => {
            provedores = valores;
            return q;
          },
          is: async () => ({
            count: sessoes
              ? sessoes.filter((x) => x.archived_at === null && (provedores === null || provedores.includes(x.provider))).length
              : numeros,
            error: null,
          }),
        };
        return q;
      }
      // organization_subscriptions
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              erroDeLeitura ? { data: null, error: { message: erroDeLeitura } } : { data: assinatura, error: null },
          }),
        }),
        upsert: async (valor: unknown) => {
          gravacoes.push({ op: "upsert", valor, filtros: [] });
          return { error: null };
        },
        update: (valor: unknown) => {
          const g = { op: "update", valor, filtros: [] as Array<[string, unknown]> };
          gravacoes.push(g);
          const q = {
            eq: (c: string, v: unknown) => {
              g.filtros.push([c, v]);
              return q;
            },
            select: async () => {
              const origem = g.filtros.find(([c]) => c === "source")?.[1];
              const casa = assinatura !== null && (origem === undefined || assinatura.source === origem);
              return { data: casa ? [{ id: "s1" }] : [], error: null };
            },
          };
          return q;
        },
      };
    },
  } as never;
}

const linha = (mudancas: Partial<Linha> = {}): Linha => ({
  plan_id: "start",
  status: "ativa",
  source: "cakto",
  reference: "dona@clinica.test",
  reason: null,
  updated_at: "2026-10-02T12:00:00Z",
  ...mudancas,
});

beforeEach(() => {
  vi.clearAllMocks();
  esquecerMemoDasAssinaturas();
  h.env.PLANS_ENFORCED = "true";
  h.env.PLANS_CATALOG = "";
  assinatura = null;
  numeros = 0;
  erroDeLeitura = null;
  gravacoes = [];
});

describe("cobrança DESLIGADA (o padrão)", () => {
  it("vazio, 'false' ou qualquer coisa que não seja 'true': desligada", () => {
    for (const v of ["", "false", "0", "sim"]) {
      h.env.PLANS_ENFORCED = v;
      expect(planosAtivos()).toBe(false);
    }
    h.env.PLANS_ENFORCED = " TRUE ";
    expect(planosAtivos()).toBe(true);
  });

  it("ninguém é recusado nem silenciado, e o banco nem é lido", async () => {
    h.env.PLANS_ENFORCED = "";
    erroDeLeitura = "se lesse, quebrava";
    expect(await recusaParaNovoNumero(adminFake(), "org-1")).toBeNull();
    expect(await assinaturaCaiu(adminFake(), "org-1")).toBe(false);
    expect((await situacaoDosNumeros(adminFake(), "org-1")).cobrando).toBe(false);
  });
});

describe("conectar mais um número", () => {
  it("quem nunca assinou não conecta", async () => {
    expect(await recusaParaNovoNumero(adminFake(), "org-1")).toEqual({ motivo: "sem_plano" });
  });

  it("plano em dia e dentro do limite: conecta", async () => {
    assinatura = linha({ plan_id: "pro" });
    numeros = 2;
    expect(await recusaParaNovoNumero(adminFake(), "org-1")).toBeNull();
  });

  it("⭐ plano em dia com todos os números em uso: recusa, dizendo o limite", async () => {
    assinatura = linha({ plan_id: "pro" });
    numeros = 3;
    expect(await recusaParaNovoNumero(adminFake(), "org-1")).toEqual({ motivo: "limite_do_plano", limite: 3, plano: "Pro" });
  });

  it("⭐ página do Messenger, bot do Telegram, rede social e linha de voz NÃO gastam o plano", async () => {
    // O caso real: 28 páginas conectadas marcaram "30 de 10" no plano Scale e
    // travariam o próximo número de WhatsApp.
    assinatura = linha({ plan_id: "scale" });
    const [umQueNaoENumero] = PROVIDERS_QUE_NAO_SAO_NUMERO;
    sessoes = [
      // Um número ativo de cada tipo que É número…
      ...PROVIDERS_DE_NUMERO.map((provider) => ({ provider, archived_at: null })),
      // …um número excluído, que não conta…
      { provider: PROVIDERS_DE_NUMERO[0], archived_at: "2026-09-01T00:00:00Z" },
      // …e tudo que NÃO é número: 28 de um tipo, mais um de cada.
      ...Array.from({ length: 28 }, () => ({ provider: umQueNaoENumero, archived_at: null })),
      ...PROVIDERS_QUE_NAO_SAO_NUMERO.map((provider) => ({ provider, archived_at: null })),
    ];
    const s = await situacaoDosNumeros(adminFake(), "org-1");
    expect(s.usados).toBe(PROVIDERS_DE_NUMERO.length);
    expect(s.limite).toBe(10);
    expect(await recusaParaNovoNumero(adminFake(), "org-1")).toBeNull();
    sessoes = null;
  });

  it("assinatura que caiu não conecta — mesmo com número sobrando no plano", async () => {
    assinatura = linha({ plan_id: "scale", status: "inativa" });
    expect(await recusaParaNovoNumero(adminFake(), "org-1")).toEqual({ motivo: "plano_inativo" });
  });

  it("plano que saiu do catálogo não libera número nenhum", async () => {
    assinatura = linha({ plan_id: "plano-antigo" });
    expect(await recusaParaNovoNumero(adminFake(), "org-1")).toEqual({ motivo: "plano_inativo" });
    expect((await situacaoDosNumeros(adminFake(), "org-1")).limite).toBe(0);
  });

  it("falha de leitura NÃO vira 'pode': a trava lança, e a rota responde erro", async () => {
    erroDeLeitura = "timeout";
    await expect(recusaParaNovoNumero(adminFake(), "org-1")).rejects.toThrow(/leitura da assinatura falhou/);
  });

  it("cada recusa tem uma frase que diz onde resolver", () => {
    for (const r of [{ motivo: "sem_plano" }, { motivo: "plano_inativo" }, { motivo: "limite_do_plano", limite: 1, plano: "Start" }] as const) {
      expect(mensagemDaRecusa(r)).toMatch(/Configurações › Billing/);
    }
  });
});

describe("o catálogo em vigor", () => {
  it("o do .env quando bem formado; malformado cai no padrão e avisa uma vez", () => {
    h.env.PLANS_CATALOG = "unico:Único:5000:2";
    expect(planosDaInstalacao()).toEqual([{ id: "unico", nome: "Único", precoMensalCentavos: 5000, numeros: 2, iaMensalCentavosUsd: 0 }]);
    h.env.PLANS_CATALOG = "quebrado";
    expect(planosDaInstalacao().map((p) => p.id)).toEqual(["start", "pro", "scale"]);
    planosDaInstalacao();
    expect(h.log.error).toHaveBeenCalledTimes(1);
  });
});

describe("a assinatura caiu? (lido a cada mensagem que chega)", () => {
  it("caiu: os números param de automatizar", async () => {
    assinatura = linha({ status: "inativa" });
    expect(await assinaturaCaiu(adminFake(), "org-1")).toBe(true);
  });

  it("em dia: segue", async () => {
    assinatura = linha();
    expect(await assinaturaCaiu(adminFake(), "org-1")).toBe(false);
  });

  it("⭐ quem NUNCA assinou não é silenciado — ligar a cobrança não cala quem já estava no ar", async () => {
    assinatura = null;
    expect(await assinaturaCaiu(adminFake(), "org-1")).toBe(false);
  });

  it("soluço do banco não cala um cliente em dia (falha aberta)", async () => {
    erroDeLeitura = "timeout";
    expect(await assinaturaCaiu(adminFake(), "org-1")).toBe(false);
  });

  it("gravar o plano derruba o memo: quem acabou de pagar volta a automatizar na hora", async () => {
    assinatura = linha({ status: "inativa" });
    expect(await assinaturaCaiu(adminFake(), "org-1")).toBe(true);
    await ativarPlano(adminFake(), { organizationId: "org-1", planoId: "start", origem: "cakto", referencia: "dona@clinica.test" });
    assinatura = linha();
    expect(await assinaturaCaiu(adminFake(), "org-1")).toBe(false);
  });
});

describe("gravar", () => {
  it("ativar grava em dia, limpando o motivo da queda anterior", async () => {
    await ativarPlano(adminFake(), { organizationId: "org-1", planoId: "pro", origem: "manual", por: "admin-1" });
    expect(gravacoes[0]!.valor).toMatchObject({ organization_id: "org-1", plan_id: "pro", status: "ativa", source: "manual", reason: null, updated_by: "admin-1" });
  });

  it("⭐ plano posto à mão NÃO cai por aviso de pagamento", async () => {
    assinatura = linha({ source: "manual" });
    expect(await inativarPlano(adminFake(), { organizationId: "org-1", motivo: "Assinatura cancelada.", soDaOrigem: "cakto" })).toBe(false);
    expect(gravacoes[0]!.filtros).toContainEqual(["source", "cakto"]);
  });

  it("plano pago cai, com o motivo; empresa sem assinatura não tem o que derrubar", async () => {
    assinatura = linha();
    expect(await inativarPlano(adminFake(), { organizationId: "org-1", motivo: "Assinatura cancelada.", soDaOrigem: "cakto" })).toBe(true);
    expect(gravacoes[0]!.valor).toMatchObject({ status: "inativa", reason: "Assinatura cancelada." });
    assinatura = null;
    expect(await inativarPlano(adminFake(), { organizationId: "org-1", motivo: "x", soDaOrigem: "cakto" })).toBe(false);
  });
});
