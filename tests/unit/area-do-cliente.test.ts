/**
 * ÁREA DO CLIENTE — as regras puras: segredos, o que da conversa vira material,
 * o nome do "Olá", a configuração e o funil do painel.
 */
import { describe, expect, it } from "vitest";

import { dataDeNascimentoValida, diasParaOAniversario, semanaDoAniversario } from "@/lib/area-do-cliente/aniversario";
import { MENSAGEM_DO_DIA, cartaDoDia } from "@/lib/area-do-cliente/carta-do-dia";
import { assinaturaAtiva, diasRestantes, estenderValidade, mesDoDia } from "@/lib/area-do-cliente/circulo";
import { REGRAS_DE_TOM, cartaDaPergunta, lerConteudo, pedidoDaResposta, pedidoDoConteudo } from "@/lib/area-do-cliente/circulo-ia";
import { janelaDoAnoPessoal, numeroDoAnoPessoal } from "@/lib/area-do-cliente/ano-pessoal";
import { lerConfigDaArea } from "@/lib/area-do-cliente/config";
import { FORMA_DO_CODIGO_DO_PRESENTE, gerarCodigoDoPresente } from "@/lib/area-do-cliente/presente";
import { faseDaLua, proximaLua } from "@/lib/area-do-cliente/lua";
import { agruparLeituraPorDia, classificarMidia, falasDaConversa, primeiroNome, semRepeticao } from "@/lib/area-do-cliente/dados";
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
  it("só a foto da carta é leitura; depoimento e divulgação dos fluxos ficam de fora", () => {
    // Nomes medidos em produção em 15/10/2026: a carta chega como leitura-cartas-NN.jpg,
    // o resto das imagens dos fluxos como conteudo-<uuid>-N.jpg.
    expect(classificarMidia(m("image", null, "org/conversa/leitura-cartas-05.jpg"))).toBe("leitura");
    expect(classificarMidia(m("image", null, "org/conversa/leitura-mesa.jpg"))).toBe("leitura");
    expect(classificarMidia(m("image", null, "org/conversa/conteudo-a90f5bfd-2.jpg"))).toBeNull();
    expect(classificarMidia(m("image"))).toBeNull();
  });
  it("documento e vídeo são material", () => {
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

describe("carta do dia", () => {
  it("é a mesma para a mesma pessoa no mesmo dia, e muda com o dia", () => {
    const a = cartaDoDia("contato-a", "2026-10-15");
    expect(cartaDoDia("contato-a", "2026-10-15").id).toBe(a.id);
    const semana = ["16", "17", "18", "19", "20", "21", "22"].map((d) => cartaDoDia("contato-a", `2026-10-${d}`).id);
    expect(new Set([a.id, ...semana]).size).toBeGreaterThan(1);
  });
  it("todo o baralho tem mensagem do dia, e nenhuma promete resultado ou prazo", () => {
    for (let id = 1; id <= 22; id++) {
      const m = MENSAGEM_DO_DIA[id];
      expect(m, `carta ${id}`).toBeTruthy();
      expect(m).not.toMatch(/garant|com certeza|vai voltar|em \d+ dias|uma semana|cura/i);
    }
  });
});

describe("fase da lua", () => {
  // Datas medidas: lua cheia em 17/10/2024 11:26 UTC; lua nova em 02/10/2024 18:49 UTC.
  it("acerta as fases em datas conhecidas", () => {
    expect(faseDaLua(new Date("2024-10-17T11:26:00Z"))).toBe("cheia");
    expect(faseDaLua(new Date("2024-10-02T18:49:00Z"))).toBe("nova");
    expect(faseDaLua(new Date("2024-10-10T12:00:00Z"))).toBe("crescente");
    expect(faseDaLua(new Date("2024-10-25T12:00:00Z"))).toBe("minguante");
  });
  it("a próxima cheia cai a no máximo um dia da efeméride", () => {
    const prevista = proximaLua(new Date("2024-10-03T00:00:00Z"), "cheia");
    expect(Math.abs(prevista.getTime() - Date.parse("2024-10-17T11:26:00Z"))).toBeLessThan(86_400_000);
  });
});

describe("aniversário", () => {
  it("aceita data real e recusa futuro, impossível e lixo", () => {
    const hoje = new Date("2026-10-15T12:00:00Z");
    expect(dataDeNascimentoValida("1980-04-09", hoje)).toBe(true);
    expect(dataDeNascimentoValida("2027-01-01", hoje)).toBe(false);
    expect(dataDeNascimentoValida("1990-02-30", hoje)).toBe(false);
    expect(dataDeNascimentoValida("1900-01-01", hoje)).toBe(false);
    expect(dataDeNascimentoValida("09/04/1980", hoje)).toBe(false);
  });
  it("conta os dias e celebra na semana do aniversário", () => {
    expect(diasParaOAniversario("1980-10-15", "2026-10-15")).toBe(0);
    expect(diasParaOAniversario("1980-10-20", "2026-10-15")).toBe(5);
    expect(semanaDoAniversario("1980-10-15", "2026-10-15")).toBe(true);
    expect(semanaDoAniversario("1980-10-10", "2026-10-15")).toBe(true);
    expect(semanaDoAniversario("1980-10-01", "2026-10-15")).toBe(false);
    expect(semanaDoAniversario("1980-10-16", "2026-10-15")).toBe(false);
  });
  it("29 de fevereiro comemora em 28 nos anos comuns", () => {
    expect(diasParaOAniversario("2000-02-29", "2027-02-28")).toBe(0);
  });
});

describe("o painel conta os motivos para voltar", () => {
  it("em pessoas, sem o conteúdo do diário", () => {
    const e = (quem: string, tipo: LinhaDeEvento["tipo"]): LinhaDeEvento => ({
      contact_id: quem,
      tipo,
      servico_id: null,
      ref: null,
      props: null,
      created_at: "2026-10-15T10:00:00Z",
    });
    const p = calcularPainel(
      [e("ana", "carta_do_dia"), e("ana", "carta_do_dia"), e("bia", "carta_do_dia"), e("ana", "diario_escrito"), e("cia", "aniversario_salvo")],
      [],
      [],
    );
    expect(p.engajamento).toEqual({ cartaDoDia: 2, diario: 1, aniversarios: 1 });
  });
});

describe("Círculo", () => {
  const agora = new Date("2026-10-15T12:00:00Z");
  it("o pagamento soma 30 dias ao que ainda resta, nunca perde dia", () => {
    expect(estenderValidade(null, agora).toISOString()).toBe("2026-11-14T12:00:00.000Z");
    expect(estenderValidade(new Date("2026-10-20T12:00:00Z"), agora).toISOString()).toBe("2026-11-19T12:00:00.000Z");
    // Vencido: conta de agora, não do vencimento.
    expect(estenderValidade(new Date("2026-09-01T12:00:00Z"), agora).toISOString()).toBe("2026-11-14T12:00:00.000Z");
  });
  it("ativo, dias restantes e mês", () => {
    expect(assinaturaAtiva(null, agora)).toBe(false);
    expect(assinaturaAtiva("2026-10-15T11:59:00Z", agora)).toBe(false);
    expect(assinaturaAtiva("2026-10-20T00:00:00Z", agora)).toBe(true);
    expect(diasRestantes("2026-10-20T12:00:00Z", agora)).toBe(5);
    expect(mesDoDia("2026-10-15")).toBe("2026-10-01");
  });
  it("os pedidos à IA levam as regras de tom e nunca pedem venda", () => {
    const c = pedidoDoConteudo("Meu Mistério", "2026-10-01");
    const r = pedidoDaResposta("Meu Mistério", "Ele volta?", cartaDaPergunta(() => 0));
    for (const pedido of [c, r]) {
      expect(pedido).toContain(REGRAS_DE_TOM);
      expect(pedido).toMatch(/não prometa resultado/);
      expect(pedido).toMatch(/Não peça dinheiro/);
    }
    expect(r).toContain("O Louco");
  });
  it("lê o JSON do conteúdo e recusa o que não serve", () => {
    expect(lerConteudo('aqui vai: {"titulo":"Outubro","texto":"A energia…"}')).toEqual({ titulo: "Outubro", texto: "A energia…" });
    expect(lerConteudo("sem json")).toBeNull();
    expect(lerConteudo('{"titulo":"","texto":"x"}')).toBeNull();
  });
});

describe("presente", () => {
  it("o código tem 32 caracteres e casa com o caminho público", () => {
    const codigo = gerarCodigoDoPresente();
    expect(FORMA_DO_CODIGO_DO_PRESENTE.test(codigo)).toBe(true);
    expect(PUBLIC_PATHS.some((r) => r.test(`/api/v1/area/publica/magno/presente/${codigo}`))).toBe(true);
    expect(PUBLIC_PATHS.some((r) => r.test("/api/v1/area/publica/magno/presente/curto"))).toBe(false);
  });
});

describe("Ano Pessoal", () => {
  it("o número é a soma reduzida de dia, mês e ano", () => {
    // 09/04 em 2026: 9 + 4 + (2+0+2+6=10→1) = 14 → 5
    expect(numeroDoAnoPessoal("1980-04-09", 2026)).toBe(5);
    // 29/12 em 2026: (2+9=11→2) + (1+2=3) + 1 = 6
    expect(numeroDoAnoPessoal("1990-12-29", 2026)).toBe(6);
  });
  it("a janela abre 15 dias antes e fecha 30 dias depois, no ano certo", () => {
    expect(janelaDoAnoPessoal("1980-10-25", "2026-10-15")).toEqual({ aberta: true, ano: 2026 });
    expect(janelaDoAnoPessoal("1980-10-01", "2026-10-15")).toEqual({ aberta: true, ano: 2026 });
    expect(janelaDoAnoPessoal("1980-12-01", "2026-10-15").aberta).toBe(false);
    // Aniversário em 03/01, hoje 20/12: o ano que vai começar é o seguinte.
    expect(janelaDoAnoPessoal("1980-01-03", "2026-12-20")).toEqual({ aberta: true, ano: 2027 });
    // Aniversário em 28/12, hoje 10/01: o ano que começou foi o anterior.
    expect(janelaDoAnoPessoal("1980-12-28", "2027-01-10")).toEqual({ aberta: true, ano: 2026 });
  });
});

describe("a conversa guardada", () => {
  it("texto entra como está, áudio pela transcrição, e na ordem do tempo", () => {
    const falas = falasDaConversa([
      { id: "2", direction: "outbound", type: "text", body: "Aqui está o seu ritual.", media_derived_text: null, created_at: "2026-10-14T10:02:00Z" },
      { id: "1", direction: "inbound", type: "text", body: "Oi, paguei", media_derived_text: null, created_at: "2026-10-14T10:00:00Z" },
      { id: "3", direction: "inbound", type: "audio", body: null, media_derived_text: "obrigada", created_at: "2026-10-14T10:05:00Z" },
      { id: "4", direction: "inbound", type: "audio", body: null, media_derived_text: null, created_at: "2026-10-14T10:06:00Z" },
      { id: "5", direction: "outbound", type: "text", body: "   ", media_derived_text: null, created_at: "2026-10-14T10:07:00Z" },
    ]);
    expect(falas.map((f) => [f.id, f.de, f.texto])).toEqual([
      ["1", "voce", "Oi, paguei"],
      ["2", "empresa", "Aqui está o seu ritual."],
      ["3", "voce", "🎤 obrigada"],
    ]);
  });
});

describe("materiais", () => {
  it("a voz da agente mandada como arquivo não é material", () => {
    expect(classificarMidia({ type: "audio", media_storage_path: "o/c/x.ogg", metadata: { audio_as_file: true, ai_actor_id: "agent-engine" } })).toBeNull();
    expect(classificarMidia({ type: "audio", media_storage_path: "o/c/x.ogg", metadata: { audio_as_file: true } })).toBe("material");
  });
  it("o mesmo material enviado duas vezes aparece uma vez", () => {
    const m = (id: string, quando: string, nome: string | null = "Guia do ritual") => ({ id, tipo: "documento" as const, nome, quando });
    expect(semRepeticao([m("a", "2026-10-14T23:31:00Z"), m("b", "2026-10-14T23:31:20Z"), m("c", "2026-10-16T10:00:00Z")]).map((x) => x.id)).toEqual(["c", "b"]);
    // Sem legenda não dá para afirmar que é o mesmo: os dois ficam.
    expect(semRepeticao([m("a", "2026-10-14T23:31:00Z", null), m("b", "2026-10-14T23:31:20Z", null)])).toHaveLength(2);
  });
});
