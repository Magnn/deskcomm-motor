/**
 * ÁREA DO CLIENTE — as regras puras: segredos, o que da conversa vira material,
 * o nome do "Olá", a configuração e o funil do painel.
 */
import { describe, expect, it } from "vitest";

import { lerConfigDaArea } from "@/lib/area-do-cliente/config";
import { agruparLeituraPorDia, classificarMidia, primeiroNome } from "@/lib/area-do-cliente/dados";
import { calcularPainel, type LinhaDeCompra, type LinhaDeEvento } from "@/lib/area-do-cliente/metricas";
import { FORMA_DO_TOKEN, codigoConfere, gerarCodigo, gerarToken, hashDoCodigo, hashDoToken } from "@/lib/area-do-cliente/token";
import { nomeDoCookieDaArea } from "@/lib/area-do-cliente/vocabulario";
import { PUBLIC_PATHS } from "@/lib/auth/public-paths";
import { emailDoPagamento } from "@/lib/pagamentos/stripe";

describe("segredos da área", () => {
  it("o token tem a forma esperada e o banco guarda só o hash", () => {
    const token = gerarToken();
    expect(FORMA_DO_TOKEN.test(token)).toBe(true);
    expect(hashDoToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDoToken(token)).not.toContain(token);
    expect(gerarToken()).not.toBe(token);
  });

  it("o código tem 6 números e o hash depende do contato", () => {
    const codigo = gerarCodigo();
    expect(codigo).toMatch(/^\d{6}$/);
    const a = "11111111-1111-4111-8111-111111111111";
    const b = "22222222-2222-4222-8222-222222222222";
    expect(hashDoCodigo(codigo, a)).not.toBe(hashDoCodigo(codigo, b));
    expect(codigoConfere(codigo, a, hashDoCodigo(codigo, a))).toBe(true);
    expect(codigoConfere(codigo, b, hashDoCodigo(codigo, a))).toBe(false);
    const errado = codigo === "000000" ? "000001" : "000000";
    expect(codigoConfere(errado, a, hashDoCodigo(codigo, a))).toBe(false);
  });

  it("o cookie é por organização", () => {
    expect(nomeDoCookieDaArea("magno")).toBe("area_magno");
    expect(nomeDoCookieDaArea("loja-x")).toBe("area_loja_x");
  });
});

describe("o proxy deixa passar só a área", () => {
  const publico = (p: string) => PUBLIC_PATHS.some((r) => r.test(p));
  it.each(["/c/magno", "/c/magno/entrar/abc", "/c/magno/material/x", "/api/v1/area/publica/magno/codigo", "/api/v1/area/publica/magno/codigo/confirmar"])(
    "%s é público (a identidade é conferida dentro da rota)",
    (p) => expect(publico(p)).toBe(true),
  );
  it.each(["/api/v1/area/config", "/api/v1/area/convites", "/api/v1/area/painel", "/api/v1/area/publica/magno/outra", "/app/area-do-cliente"])(
    "%s exige a sessão da equipe",
    (p) => expect(publico(p)).toBe(false),
  );
});

describe("o que da conversa aparece na área", () => {
  const m = (type: string, metadata: Record<string, unknown> | null = null, path: string | null = "o/c/x") => ({
    type,
    media_storage_path: path,
    metadata,
  });
  it("imagem é leitura; documento e vídeo são material", () => {
    expect(classificarMidia(m("image"))).toBe("leitura");
    expect(classificarMidia(m("document"))).toBe("material");
    expect(classificarMidia(m("video"))).toBe("material");
  });
  it("áudio só é material quando foi mandado como arquivo — a nota de voz da resposta não", () => {
    expect(classificarMidia(m("audio", { audio_as_file: true }))).toBe("material");
    expect(classificarMidia(m("audio", { ai_actor_id: "agent-engine" }))).toBeNull();
    expect(classificarMidia(m("audio"))).toBeNull();
  });
  it("sem arquivo, ou figurinha, não aparece", () => {
    expect(classificarMidia(m("document", null, null))).toBeNull();
    expect(classificarMidia(m("sticker"))).toBeNull();
  });
  it("a leitura agrupa por dia no fuso da organização, o dia mais novo primeiro", () => {
    const grupos = agruparLeituraPorDia(
      [
        { id: "a", url: "u", quando: "2026-10-14T02:30:00Z" }, // 13/10 23:30 em São Paulo
        { id: "b", url: "u", quando: "2026-10-14T15:00:00Z" },
        { id: "c", url: "u", quando: "2026-10-14T14:00:00Z" },
      ],
      "America/Sao_Paulo",
    );
    expect(grupos.map((g) => g.dia)).toEqual(["2026-10-14", "2026-10-13"]);
    expect(grupos[0]?.itens.map((i) => i.id)).toEqual(["c", "b"]);
  });
});

describe("o nome do Olá", () => {
  it.each([
    ["Sandra Maria", "Sandra"],
    ["dany marinho", "Dany"],
    ["Dora 🍒", "Dora"],
    [".", ""],
    ["🙈", ""],
    ["~Luana", "Luana"],
    [null, ""],
  ])("%s → %s", (entrada, esperado) => expect(primeiroNome(entrada)).toBe(esperado));
});

describe("configuração", () => {
  it("sem config ou com config inválida, a área fica desligada", () => {
    expect(lerConfigDaArea(null).ativo).toBe(false);
    expect(lerConfigDaArea({ area: { ativo: true, whatsapp: "abc" } }).ativo).toBe(false);
    expect(lerConfigDaArea({ area: { ativo: true, whatsapp: "5569999999999" } })).toEqual({
      ativo: true,
      whatsapp: "5569999999999",
    });
  });
});

describe("o painel", () => {
  const S1 = "11111111-1111-4111-8111-111111111111";
  const S2 = "22222222-2222-4222-8222-222222222222";
  const servicos = [
    { id: S1, nome: "Sinastria Amorosa", preco_cents: 4700 },
    { id: S2, nome: "Ritual da Lua", preco_cents: 2900 },
  ];
  const ev = (contact_id: string, tipo: LinhaDeEvento["tipo"], created_at: string, servico_id: string | null = null): LinhaDeEvento => ({
    contact_id,
    tipo,
    servico_id,
    ref: null,
    props: null,
    created_at,
  });

  it("conta pessoas, não cliques, e liga a compra ao serviço clicado pelo nome", () => {
    const eventos: LinhaDeEvento[] = [
      ev("ana", "convite_criado", "2026-10-10T10:00:00Z"),
      ev("bia", "convite_criado", "2026-10-10T10:00:00Z"),
      ev("cia", "convite_criado", "2026-10-10T10:00:00Z"),
      ev("ana", "entrou", "2026-10-10T11:00:00Z"),
      ev("bia", "entrou", "2026-10-10T11:00:00Z"),
      ev("ana", "visitou", "2026-10-10T11:00:00Z"),
      ev("ana", "visitou", "2026-10-12T11:00:00Z"),
      ev("bia", "visitou", "2026-10-10T11:00:00Z"),
      ev("ana", "servico_visto", "2026-10-12T11:01:00Z", S1),
      ev("ana", "servico_visto", "2026-10-12T11:01:00Z", S2),
      ev("bia", "servico_visto", "2026-10-10T11:01:00Z", S1),
      ev("ana", "checkout_clicado", "2026-10-12T11:02:00Z", S1),
      ev("ana", "checkout_clicado", "2026-10-12T11:03:00Z", S1),
      ev("bia", "material_aberto", "2026-10-10T11:05:00Z"),
    ];
    const compras: LinhaDeCompra[] = [
      { contact_id: "ana", produto: "Sinastria amorosa", amount_cents: 4700, occurred_at: "2026-10-12T11:10:00Z" },
      // Comprou ANTES de clicar: não é da área.
      { contact_id: "bia", produto: "Sinastria Amorosa", amount_cents: 4700, occurred_at: "2026-10-09T11:10:00Z" },
    ];
    const p = calcularPainel(eventos, compras, servicos);
    expect(Object.fromEntries(p.funil.map((e) => [e.etapa, e.pessoas]))).toEqual({
      convidados: 3,
      entraram: 2,
      voltaram: 1,
      viram_servicos: 2,
      clicaram_comprar: 1,
      compraram: 1,
    });
    expect(p.servicos[0]).toMatchObject({ id: S1, viram: 2, clicaram: 1, compraram: 1, receita_cents: 4700 });
    expect(p.servicos[1]).toMatchObject({ id: S2, viram: 1, clicaram: 0, compraram: 0 });
    expect(p.receitaAtribuida_cents).toBe(4700);
    expect(Object.fromEntries(p.ondeParam.map((o) => [o.etapa, o.pessoas]))).toEqual({
      so_entrou: 0,
      abriu_material: 0,
      viu_servico: 1,
      clicou_comprar: 0,
      comprou: 1,
    });
    expect(p.materiaisAbertos).toEqual({ aberturas: 1, pessoas: 1 });
  });

  it("compra fora da janela de 7 dias, ou de outro produto, não vai para o serviço", () => {
    const eventos = [ev("ana", "checkout_clicado", "2026-10-01T10:00:00Z", S1), ev("bia", "checkout_clicado", "2026-10-10T10:00:00Z", S1)];
    const compras: LinhaDeCompra[] = [
      { contact_id: "ana", produto: "Sinastria Amorosa", amount_cents: 4700, occurred_at: "2026-10-09T10:00:01Z" },
      { contact_id: "bia", produto: "Ritual da Lua", amount_cents: 2900, occurred_at: "2026-10-10T12:00:00Z" },
    ];
    const p = calcularPainel(eventos, compras, servicos);
    expect(p.servicos.find((s) => s.id === S1)?.compraram).toBe(0);
    // A da Bia é da área (clicou e comprou), mas não do serviço que ela clicou.
    expect(p.funil.find((e) => e.etapa === "compraram")?.pessoas).toBe(1);
  });

  it("pagamento sem nome de produto vai para o último serviço clicado", () => {
    const eventos = [ev("ana", "checkout_clicado", "2026-10-10T10:00:00Z", S1), ev("ana", "checkout_clicado", "2026-10-10T10:05:00Z", S2)];
    const p = calcularPainel(eventos, [{ contact_id: "ana", produto: null, amount_cents: 2900, occurred_at: "2026-10-10T10:20:00Z" }], servicos);
    expect(p.servicos.find((s) => s.id === S2)?.compraram).toBe(1);
  });

  it("desejos agrupam o mesmo texto e contam pessoas", () => {
    const desejo = (quem: string, texto: string): LinhaDeEvento => ({ ...ev(quem, "desejo", "2026-10-10T10:00:00Z"), props: { texto } });
    const p = calcularPainel([desejo("ana", "Leitura do trabalho"), desejo("bia", "leitura do trabalho"), desejo("ana", "Leitura do trabalho")], [], servicos);
    expect(p.desejos).toEqual([{ texto: "leitura do trabalho", pessoas: 2 }]);
  });
});

describe("o e-mail de quem pagou pela Stripe", () => {
  it("vem do cartão ou do boleto (billing_details), normalizado", () => {
    expect(emailDoPagamento({ latest_charge: { billing_details: { email: " Ana@Exemplo.com " } } })).toBe("ana@exemplo.com");
  });
  it("sem billing_details, vale o e-mail do recibo", () => {
    expect(emailDoPagamento({ latest_charge: { billing_details: { email: null }, receipt_email: "bia@x.com" } })).toBe("bia@x.com");
    expect(emailDoPagamento({ receipt_email: "cia@x.com", latest_charge: "ch_123" })).toBe("cia@x.com");
  });
  it("o Pix da conversa não tem e-mail, e lixo não vira e-mail", () => {
    expect(emailDoPagamento({ latest_charge: { billing_details: { email: null } } })).toBeNull();
    expect(emailDoPagamento({ receipt_email: "sem-arroba" })).toBeNull();
    expect(emailDoPagamento({})).toBeNull();
  });
});
