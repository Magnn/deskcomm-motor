import { describe, expect, it, vi } from "vitest";

import { baloesPelaChave, cobrancaNoTexto } from "@/lib/pagamentos/como-pagar-pix";
import type { ChavePixDaEmpresa } from "@/lib/preco/chave-pix";
import type { Extra } from "@/lib/preco/tipos";

import { comprovanteDoTurno, PRODUTO_DO_VALOR_SOLTO, type DepsDoComprovante } from "./comprovante-no-turno";
import { cobrancasEnviadas, entradasCombinadas, confirmaPagamentoEmDuvida, confirmaPagamentoSemRegistro, conferirComprovante, dataImpressa, produtoCitado, textoDaMidia, type FalaDaConversa } from "./comprovante-pix";

describe("comprovante em dúvida no envio", () => {
  it("⭐ 06/11: comprovante sem ID não vira 'está certinho' nem entrega", () => {
    expect(confirmaPagamentoEmDuvida("Agora sim 🌙 Vi o comprovante de R$ 130 aqui. Está certinho, pode ficar tranquila.", true)).not.toBeNull();
    expect(confirmaPagamentoEmDuvida("O seu trabalho já está confirmado no meu altar.", true)).not.toBeNull();
  });
  it("deixa passar o recebi-e-a-equipe-confere, a negação e o turno sem dúvida", () => {
    expect(confirmaPagamentoEmDuvida("Recebi o seu comprovante, a equipe vai conferir e já te falo.", true)).toBeNull();
    expect(confirmaPagamentoEmDuvida("O pagamento ainda não está confirmado, a equipe confere.", true)).toBeNull();
    expect(confirmaPagamentoEmDuvida("Está certinho, caiu aqui.", false)).toBeNull();
  });
});

const CHAVE: ChavePixDaEmpresa = { key: "+5569900001234", holder: "Fulano de Tal Silva", primary: true };
const PERGUNTA: Extra = {
  name: "Pergunta nova",
  price_cents: 700,
  when: "pede outra pergunta.",
  quantity_prices: [
    { quantity: 2, price_cents: 1000 },
    { quantity: 3, price_cents: 1500 },
    { quantity: 4, price_cents: 1700 },
  ],
};
const ACOMPANHAMENTO: Extra = { name: "Acompanhamento do mês", price_cents: 6000, when: "quer seguir conversando." };
const COBROU_EM = "2026-11-01T15:00:00.000Z";
const AGORA = new Date("2026-11-01T15:30:00.000Z");
const ID = "E12345678202611011510abcDEF12345";
const QUANDO = "01/11/2026 às 12:10";
const comprovante = (valor: string, nome = "Fulano de Tal Silva", id = ID, quando = QUANDO) =>
  `Comprovante de Pix. ${quando}. Valor ${valor}. Para ${nome}. ID da transação ${id}`;
const cobranca = (valor: string): FalaDaConversa => ({ direction: "outbound", body: baloesPelaChave(valor, CHAVE.key, CHAVE.holder)[0]!, sent_at: COBROU_EM });

const conferir = (texto: string, falas: FalaDaConversa[] = [cobranca("R$ 7")], extras: Extra[] = [PERGUNTA]) =>
  conferirComprovante({ texto, chave: CHAVE, cobrancas: cobrancasEnviadas(falas), extras, valoresDoPrincipal: [6000], agora: AGORA });

describe("conferência do comprovante Pix", () => {
  it("lê valor e quantidade da nossa própria cobrança", () => {
    expect(cobrancaNoTexto(baloesPelaChave("R$ 7", "x", "y")[0]!)).toEqual({ valorCents: 700, quantidade: 1, nome: null });
    expect(cobrancaNoTexto(baloesPelaChave("R$ 10 (2× Pergunta nova)", "x", "y")[0]!)).toEqual({ valorCents: 1000, quantidade: 2, nome: "Pergunta nova" });
    expect(cobrancaNoTexto("oi, tudo bem?")).toBeNull();
  });

  it("lê a hora impressa nos formatos dos bancos", () => {
    expect(dataImpressa("01/11/2026 às 12:10")?.toISOString()).toBe("2026-11-01T12:10:00.000Z");
    expect(dataImpressa("01 NOV 2026 - 12:10:05")?.toISOString()).toBe("2026-11-01T12:10:00.000Z");
    expect(dataImpressa("1 de novembro de 2026, 12:10")?.toISOString()).toBe("2026-11-01T12:10:00.000Z");
    expect(dataImpressa("sem data")).toBeNull();
    // PicPay: hora sem dois-pontos (24/11/2026).
    expect(dataImpressa("Comprovante de Pix\n24/nov/2026 - 204459\nValor")?.toISOString()).toBe("2026-11-24T20:44:00.000Z");
    expect(dataImpressa("24/11/2026 - 204459")?.toISOString()).toBe("2026-11-24T20:44:00.000Z");
    // Valor de 4 dígitos ao lado da data não vira hora; 6 dígitos impossíveis também não.
    expect(dataImpressa("24/11/2026 - R$ 1300")).toBeNull();
    expect(dataImpressa("24/11/2026 - 997788")).toBeNull();
  });

  it("comprovante certo libera a avulsa com a quantidade cobrada", () => {
    expect(conferir(comprovante("R$ 7,00"))).toMatchObject({ tipo: "confere_extra", quantidade: 1, valorCents: 700, idDoPix: ID });
    expect(conferir(comprovante("R$ 10,00"), [cobranca("R$ 10 (2× Pergunta nova)")])).toMatchObject({ tipo: "confere_extra", quantidade: 2 });
  });

  it("aceita a chave no lugar do nome", () => {
    expect(conferir(`Comprovante. ${QUANDO}. R$ 7,00. Chave ***900001234. ID ${ID}`)).toMatchObject({ tipo: "confere_extra" });
  });

  it("produto principal em ordem é venda confirmada", () => {
    expect(conferir(comprovante("R$ 60,00"), [cobranca("R$ 60")])).toMatchObject({ tipo: "confere_principal", valorCents: 6000 });
  });

  it.each([
    ["sem valor legível", `Comprovante. ${QUANDO}. Fulano de Tal Silva. ID ${ID}`, "valor"],
    ["dois valores", `${comprovante("R$ 7,00")} Saldo R$ 90,00`, "mais de um valor"],
    ["outra pessoa recebeu", comprovante("R$ 7,00", "Beltrano Souza"), "recebeu"],
    ["sem ID", `Comprovante. ${QUANDO}. R$ 7,00. Fulano de Tal Silva.`, "ID da transação"],
    ["pago antes da cobrança", comprovante("R$ 7,00", undefined, "E12345678202610201510abcDEF12345"), "data"],
    ["data impossível", comprovante("R$ 7,00", undefined, "E12345678202613451510abcDEF12345"), "válido"],
    ["sem a hora impressa", comprovante("R$ 7,00", undefined, ID, "hoje"), "data e a hora"],
    ["hora impressa de outro dia", comprovante("R$ 7,00", undefined, ID, "28/10/2026 às 12:10"), "hora impressa"],
  ])("dúvida: %s", (_nome, texto, trecho) => {
    const r = conferir(texto);
    expect(r.tipo).toBe("nao_confere");
    if (r.tipo === "nao_confere") expect(r.motivo).toContain(trecho);
  });

  it("entrada, restante ou valor combinado: o dinheiro entra, o que liberar fica com a equipe", () => {
    expect(conferir(comprovante("R$ 30,00"), [cobranca("R$ 30")])).toMatchObject({ tipo: "confere_valor", valorCents: 3000, idDoPix: ID });
  });

  it("valor igual de produto e de avulsa: registra o dinheiro, sem escolher o produto", () => {
    expect(conferir(comprovante("R$ 60,00"), [cobranca("R$ 60")], [ACOMPANHAMENTO]).tipo).toBe("confere_valor");
  });

  it("⭐ 04/11: cobrou R$ 7 e ela pagou R$ 10, o preço de duas perguntas — são duas perguntas", () => {
    expect(conferir(comprovante("R$ 10,00"))).toMatchObject({ tipo: "confere_extra", extra: { name: "Pergunta nova" }, quantidade: 2, valorCents: 1000 });
  });

  it("⭐ 04/11: valor que não é de cobrança nenhuma, num Pix que é nosso, ainda é dinheiro recebido", () => {
    expect(conferir(comprovante("R$ 67,00"))).toMatchObject({ tipo: "confere_valor", valorCents: 6700 });
    expect(conferir(comprovante("R$ 5,00"))).toMatchObject({ tipo: "confere_valor", valorCents: 500 });
  });

  it("⭐ a entrada que ela acabou de dizer confere como o trabalho", () => {
    const r = conferirComprovante({
      texto: comprovante("R$ 67,00"),
      chave: CHAVE,
      cobrancas: cobrancasEnviadas([cobranca("R$ 7")]),
      extras: [PERGUNTA],
      valoresDoPrincipal: [13000],
      entradas: [6700],
      agora: AGORA,
    });
    expect(r).toMatchObject({ tipo: "confere_principal", valorCents: 6700 });
  });

  it("valor solto continua barrado sem as provas de que o Pix é nosso", () => {
    expect(conferir(comprovante("R$ 67,00", "Beltrano Souza")).tipo).toBe("nao_confere");
    expect(conferir(comprovante("R$ 67,00", undefined, "E12345678202610201510abcDEF12345")).tipo).toBe("nao_confere");
  });

  it("sem cobrança enviada é dúvida, e foto comum nem conta como comprovante", () => {
    expect(conferir(comprovante("R$ 7,00"), []).tipo).toBe("nao_confere");
    expect(conferir("Uma foto de um gato no sofá.").tipo).toBe("nenhum");
    // 04/11/2026: a descrição da foto de um casal chamou a equipe para "conferir o comprovante".
    expect(conferir("O cliente enviou uma foto pessoal de um casal. Não se trata de um comprovante de pagamento.").tipo).toBe("nenhum");
  });

  it("a legenda digitada pela pessoa não vale como comprovante", () => {
    expect(textoDaMidia(`[Mídia]\nLegenda do cliente: ${comprovante("R$ 7,00")}\nConteúdo: foto de um gato`)).toBe("foto de um gato");
    expect(textoDaMidia("texto comum")).toBe("");
  });

  it("acha o produto pelo nome nas nossas falas, do mais novo para o mais velho", () => {
    const falas: FalaDaConversa[] = [
      { direction: "outbound", body: "A Abertura da Prosperidade é linda.", sent_at: COBROU_EM },
      { direction: "outbound", body: "Fica melhor a Abertura do Coração.", sent_at: COBROU_EM },
    ];
    expect(produtoCitado(falas, ["Abertura da Prosperidade", "Abertura do Coração"])).toBe("Abertura do Coração");
    expect(produtoCitado([], ["Abertura do Coração"])).toBeNull();
  });
});

describe("comprovante no turno", () => {
  const log = { info: vi.fn(), warn: vi.fn() };
  const pricing = { enabled: true, list_price_cents: 6000, steps: [], pix_key: CHAVE, extras: [PERGUNTA], list_product_links: [{ name: "Abertura do Coração", url: "https://x.co" }] } as never;
  const imagem = (valor: string): FalaDaConversa => ({ direction: "inbound", type: "image", body: `[Mídia]\nConteúdo: ${comprovante(valor)}`, sent_at: "2026-11-01T15:20:00.000Z" });
  const falas = [cobranca("R$ 7"), imagem("R$ 7,00")];
  const dublês = (uso: Awaited<ReturnType<DepsDoComprovante["lerUso"]>> = null) => ({
    lerUso: vi.fn(async () => uso),
    registrar: vi.fn<DepsDoComprovante["registrar"]>(async () => ({ resultado: "registrado", negocio: "sem_negocio", entrega: "nao_pedida" })),
  });
  const turno = (deps: DepsDoComprovante, mensagens: FalaDaConversa[] = falas) =>
    comprovanteDoTurno(deps, { contactId: "c1", conversationId: "v", pricing, mensagens, agora: AGORA, log });

  it("avulsa certa vai para o faturamento com extra e sem entrega por fluxo", async () => {
    const deps = dublês();
    expect(await turno(deps)).toBe("");
    expect(deps.registrar).toHaveBeenCalledWith("c1", expect.objectContaining({ chave: `comprovante-${ID}`, valor_cents: 700, extra: "pergunta-nova", iniciar_entrega: false, confirmar_repetido: true }));
  });

  it("produto principal certo vira venda, com o nome citado na conversa e a entrega pedida", async () => {
    const deps = dublês();
    deps.registrar.mockResolvedValue({ resultado: "registrado", negocio: "fechado", entrega: "iniciada" });
    const bloco = await turno(deps, [{ direction: "outbound", body: "O Abertura do Coração é o seu caminho.", sent_at: COBROU_EM }, cobranca("R$ 60"), imagem("R$ 60,00")]);
    expect(bloco).toContain("PAGAMENTO CONFIRMADO");
    expect(deps.registrar).toHaveBeenCalledWith("c1", expect.objectContaining({ produto: "Abertura do Coração", valor_cents: 6000, iniciar_entrega: true }));
  });

  it("⭐ venda já registrada à mão pela equipe não é registrada de novo (Sidnei, 20/11/2026)", async () => {
    const deps = { ...dublês(), registradoAMao: vi.fn(async () => true) };
    const aoConfirmar = vi.fn();
    const bloco = await comprovanteDoTurno(deps, { contactId: "c1", conversationId: "v", pricing, mensagens: [{ direction: "outbound", body: "O Abertura do Coração é o seu caminho.", sent_at: COBROU_EM }, cobranca("R$ 60"), imagem("R$ 60,00")], aoConfirmar, agora: AGORA, log });
    expect(deps.registradoAMao).toHaveBeenCalledWith("c1", 6000);
    expect(deps.registrar).not.toHaveBeenCalled();
    expect(aoConfirmar).toHaveBeenCalled();
    expect(bloco).not.toContain("não confere");
  });

  it("⭐ o lead que reenvia o comprovante de um atendimento anterior para e chama a equipe", async () => {
    const deps = dublês({ contactId: "c1", criadoEm: new Date("2026-10-30T15:00:00.000Z") });
    const bloco = await turno(deps);
    expect(bloco).toContain("atendimento anterior");
    expect(bloco).toContain("chame o atendimento humano AGORA");
    expect(deps.registrar).not.toHaveBeenCalled();
  });

  it("⭐ o comprovante de outro contato para e chama a equipe", async () => {
    const deps = dublês({ contactId: "outro", criadoEm: new Date("2026-11-01T15:25:00.000Z") });
    expect(await turno(deps)).toContain("outro contato");
    expect(deps.registrar).not.toHaveBeenCalled();
  });

  it("o mesmo turno rodando de novo não registra duas vezes nem acusa", async () => {
    const deps = dublês({ contactId: "c1", criadoEm: new Date("2026-11-01T15:25:00.000Z") });
    expect(await turno(deps)).toBe("");
    expect(deps.registrar).not.toHaveBeenCalled();
  });

  it("dúvida não registra nada", async () => {
    const deps = dublês();
    const outraPessoa: FalaDaConversa = { direction: "inbound", type: "image", body: `[Mídia]\nConteúdo: ${comprovante("R$ 7,00", "Beltrano Souza")}`, sent_at: "2026-11-01T15:20:00.000Z" };
    expect(await turno(deps, [cobranca("R$ 7"), outraPessoa])).toContain("COMPROVANTE COM DÚVIDA");
    expect(deps.registrar).not.toHaveBeenCalled();
  });

  it("⭐ 04/11: Pix nosso de valor solto vai ao faturamento, sem entrega, e a agente não cobra de novo", async () => {
    const deps = dublês();
    const aoConfirmar = vi.fn();
    const bloco = await comprovanteDoTurno(deps, { contactId: "c1", conversationId: "v", pricing, mensagens: [cobranca("R$ 7"), imagem("R$ 67,00")], aoConfirmar, agora: AGORA, log });
    expect(bloco).toContain("PIX RECEBIDO PELO COMPROVANTE");
    expect(bloco).toContain("NÃO cobre de novo");
    expect(deps.registrar).toHaveBeenCalledWith("c1", expect.objectContaining({ produto: PRODUTO_DO_VALOR_SOLTO, valor_cents: 6700, iniciar_entrega: false, chave: `comprovante-${ID}` }));
    expect(aoConfirmar).toHaveBeenCalledOnce();
  });

  it("⭐ a entrada do turno paga pelo comprovante vira venda do trabalho, e a cobrança dela some do turno", async () => {
    const deps = dublês();
    const aoConfirmar = vi.fn();
    await comprovanteDoTurno(deps, { contactId: "c1", conversationId: "v", pricing, mensagens: [cobranca("R$ 7"), imagem("R$ 67,00")], entradaDoTurnoCents: 6700, aoConfirmar, agora: AGORA, log });
    expect(deps.registrar).toHaveBeenCalledWith("c1", expect.objectContaining({ valor_cents: 6700, iniciar_entrega: true }));
    expect(aoConfirmar).toHaveBeenCalledOnce();
  });

  it("dúvida não avisa o turno de que está pago", async () => {
    const aoConfirmar = vi.fn();
    const outraPessoa: FalaDaConversa = { direction: "inbound", type: "image", body: `[Mídia]\nConteúdo: ${comprovante("R$ 7,00", "Beltrano Souza")}`, sent_at: "2026-11-01T15:20:00.000Z" };
    await comprovanteDoTurno(dublês(), { contactId: "c1", conversationId: "v", pricing, mensagens: [cobranca("R$ 7"), outraPessoa], aoConfirmar, agora: AGORA, log });
    expect(aoConfirmar).not.toHaveBeenCalled();
  });

  it("sem chave principal não faz nada, e falha do banco não derruba o turno", async () => {
    const deps = dublês();
    deps.lerUso.mockRejectedValue(new Error("fora do ar"));
    expect(await turno(deps)).toBe("");
    expect(await comprovanteDoTurno(deps, { contactId: "c", conversationId: "v", pricing: null, mensagens: falas, agora: AGORA, log })).toBe("");
  });

  describe("comprovante de rodada anterior — 11/11/2026 (IA sem saldo, turno do comprovante falhou)", () => {
    const depois: FalaDaConversa[] = [
      { direction: "outbound", body: "Recebi, já te falo", sent_at: "2026-11-01T15:21:00.000Z" },
      { direction: "inbound", body: "caiu?", sent_at: "2026-11-01T15:25:00.000Z" },
    ];

    it("⭐ nunca registrado: confere e registra na rodada seguinte", async () => {
      const deps = dublês();
      const aoConfirmar = vi.fn();
      await comprovanteDoTurno(deps, { contactId: "c1", conversationId: "v", pricing, mensagens: [...falas, ...depois], aoConfirmar, agora: AGORA, log });
      expect(deps.registrar).toHaveBeenCalledWith("c1", expect.objectContaining({ chave: `comprovante-${ID}`, valor_cents: 700 }));
      expect(aoConfirmar).toHaveBeenCalledOnce();
    });

    it("já registrado para a mesma pessoa: não acusa reaproveitamento nem registra de novo", async () => {
      const deps = dublês({ contactId: "c1", criadoEm: new Date("2026-11-01T15:00:00.000Z") });
      const aoConfirmar = vi.fn();
      expect(await comprovanteDoTurno(deps, { contactId: "c1", conversationId: "v", pricing, mensagens: [...falas, ...depois], aoConfirmar, agora: AGORA, log })).toBe("");
      expect(deps.registrar).not.toHaveBeenCalled();
      expect(aoConfirmar).toHaveBeenCalledOnce();
    });

    it("em dúvida ou de outro contato: fica em silêncio (a rodada dele já respondeu)", async () => {
      const outraPessoa: FalaDaConversa = { direction: "inbound", type: "image", body: `[Mídia]\nConteúdo: ${comprovante("R$ 7,00", "Beltrano Souza")}`, sent_at: "2026-11-01T15:20:00.000Z" };
      const aoDuvidar = vi.fn();
      const deps = dublês();
      expect(await comprovanteDoTurno(deps, { contactId: "c1", conversationId: "v", pricing, mensagens: [cobranca("R$ 7"), outraPessoa, ...depois], aoDuvidar, agora: AGORA, log })).toBe("");
      expect(aoDuvidar).not.toHaveBeenCalled();
      const deOutro = dublês({ contactId: "outro", criadoEm: new Date("2026-11-01T15:00:00.000Z") });
      expect(await turno(deOutro, [...falas, ...depois])).toBe("");
      expect(deOutro.registrar).not.toHaveBeenCalled();
    });

    it("foto comum de rodada anterior não é comprovante", async () => {
      const deps = dublês();
      const foto: FalaDaConversa = { direction: "inbound", type: "image", body: "[Mídia]\nConteúdo: Uma foto de um gato no sofá.", sent_at: "2026-11-01T15:20:00.000Z" };
      expect(await turno(deps, [cobranca("R$ 7"), foto, ...depois])).toBe("");
      expect(deps.lerUso).not.toHaveBeenCalled();
    });
  });
});

describe("produto de pós-venda ou catálogo", () => {
  const conferePorValor = (outrosProdutos: Array<{ produto: string; valor_cents: number }>) =>
    conferirComprovante({
      texto: comprovante("R$ 35,00"),
      chave: CHAVE,
      cobrancas: cobrancasEnviadas([cobranca("R$ 35")]),
      extras: [],
      valoresDoPrincipal: [6000],
      outrosProdutos,
      agora: AGORA,
    });

  it("⭐ a Oração dos Sonhos de R$ 35 confere e sai com o nome do produto", () => {
    const r = conferePorValor([{ produto: "Oração dos Sonhos", valor_cents: 3500 }, { produto: "Sons Vocálicos", valor_cents: 4500 }]);
    expect(r.tipo === "confere_produto" ? r.produto : r).toBe("Oração dos Sonhos");
  });

  it("dois produtos no mesmo valor: o dinheiro entra, o produto fica com a equipe", () => {
    expect(conferePorValor([{ produto: "A", valor_cents: 3500 }, { produto: "B", valor_cents: 3500 }]).tipo).toBe("confere_valor");
  });
});

describe("cobrança com o nome do produto", () => {
  it("⭐ R$ 60 com o nome confere a avulsa, mesmo com o trabalho e outra avulsa no mesmo valor", async () => {
    const { cobrancaNoTexto, baloesPelaChave } = await import("./como-pagar-pix");
    const [instrucao] = baloesPelaChave("R$ 60,00 (Reconstrução do Casamento)", "+5569999999999", "Fulano");
    expect(instrucao).toContain("Pra pagar no Pix (*R$ 60,00 (Reconstrução do Casamento)*):");
    expect(instrucao).toContain("coloque o valor *R$ 60,00* e confirme");
    expect(cobrancaNoTexto(instrucao!)).toEqual({ valorCents: 6000, quantidade: 1, nome: "Reconstrução do Casamento" });
    expect(cobrancaNoTexto("Pra pagar no Pix (*R$ 10 (2× Pergunta nova)*):")).toEqual({ valorCents: 1000, quantidade: 2, nome: "Pergunta nova" });
    expect(cobrancaNoTexto("Pra pagar no Pix (*R$ 130,00*):")).toEqual({ valorCents: 13000, quantidade: 1, nome: null });

    const RECONSTRUCAO: Extra = { name: "Reconstrução do Casamento", price_cents: 6000, when: "quer salvar o casamento." };
    const extras = [PERGUNTA, ACOMPANHAMENTO, RECONSTRUCAO];
    expect(conferir(comprovante("R$ 60,00"), [cobranca("R$ 60,00 (Reconstrução do Casamento)")], extras)).toMatchObject({
      tipo: "confere_extra",
      extra: { name: "Reconstrução do Casamento" },
      valorCents: 6000,
    });
    // Sem o nome é a cobrança do trabalho: toda avulsa sai com o nome (`corpoComPixDoExtra`).
    expect(conferir(comprovante("R$ 60,00"), [cobranca("R$ 60")], extras)).toMatchObject({ tipo: "confere_principal" });
  });
});

describe("comprovante Banrisul e o 'confere' em dúvida (22/11/2026)", () => {
  it("data e hora em linhas separadas são lidas", () => {
    const d = dataImpressa("- **Valor:** R$ 60,00\n- **Data:** 22/11/2026\n- **Hora:** 21:54:17\n- **Nome de quem recebeu:** FULANO");
    expect(d?.toISOString()).toBe("2026-11-22T21:54:00.000Z");
  });
  it("'o comprovante confere' com o comprovante em dúvida é recusado; 'estou conferindo' passa", () => {
    expect(confirmaPagamentoEmDuvida("Meu bem, o comprovante de *R$ 60* confere com o que a gente combinou, viu?", true)).not.toBeNull();
    expect(confirmaPagamentoEmDuvida("Recebi o seu comprovante. Já estou conferindo aqui com a equipe.", true)).toBeNull();
  });
});

describe("⭐ 22/11/2026: 7 vendas pela chave paradas na leitura do comprovante", () => {
  // Formatos reais da transcrição; nomes e IDs trocados. O ID traz 15:10 UTC = 12:10 no horário de Brasília.
  const MERCADO_PAGO = `Comprovante Pix pelo Mercado Pago. - **Valor:** R$ 7 / - **Data e hora:** 01/novembro/2026 às 12:10:30. / - **Nome de quem recebeu:** Fulano de Tal Silva / - **ID de transação Pix:** ${ID}`;
  const LINHAS_SEPARADAS = `Comprovante Pix.\n- **Valor:** R$ 7,00\n- **Data:** 01/11/2026\n- **Hora:** 12:10:17\n- **Nome de quem recebeu:** FULANO DE TAL SILVA\n- **ID da Transação:** ${ID}`;
  const ID_QUEBRADO = `Comprovante de Pix / 01/11/2026, 12:10:08 / Valor R$ 7,00 / Nome Fulano de Tal Silva / ID transação ${ID.slice(0, 23)} / ${ID.slice(23)} / Chave de segurança ABC`;

  it("lê a data por extenso entre barras e a data e a hora em linhas separadas", () => {
    expect(dataImpressa("01/novembro/2026 às 12:10:30")?.toISOString()).toBe("2026-11-01T12:10:00.000Z");
    expect(dataImpressa("- **Data:** 01/11/2026\n- **Hora:** 12:10:17")?.toISOString()).toBe("2026-11-01T12:10:00.000Z");
  });

  it.each([
    ["Mercado Pago, data por extenso", MERCADO_PAGO],
    ["data e hora em linhas separadas", LINHAS_SEPARADAS],
    ["ID quebrado em duas linhas", ID_QUEBRADO],
  ])("%s confere", (_n, texto) => {
    expect(conferir(texto)).toMatchObject({ tipo: "confere_extra", valorCents: 700, idDoPix: ID });
  });

  it("ID cortado continua em dúvida: palavra ao lado não completa o ID", () => {
    const cortado = `Comprovante de Pix / 01/11/2026, 12:10:08 / Valor R$ 7,00 / Nome Fulano de Tal Silva / ID transação ${ID.slice(0, 23)} / Chave Pix 69 99367 7810`;
    expect(conferir(cortado)).toMatchObject({ tipo: "nao_confere" });
  });

  it("'o comprovante confere' sem registro é recusado; 'a equipe confere' passa", () => {
    expect(confirmaPagamentoEmDuvida("O comprovante de *R$ 60* confere com o que a gente combinou, viu?", true)).not.toBeNull();
    expect(confirmaPagamentoSemRegistro("O comprovante de *R$ 60* confere com o que a gente combinou, viu?", true)).not.toBeNull();
    expect(confirmaPagamentoEmDuvida("Recebi o comprovante, a equipe confere e já te falo.", true)).toBeNull();
    expect(confirmaPagamentoSemRegistro("Já estou conferindo o seu comprovante com a equipe.", true)).toBeNull();
  });
});

describe("chave escrita pela agente fora do balão padrão", () => {
  const fala = (body: string, sent_at = COBROU_EM): FalaDaConversa => ({ direction: "outbound", body, sent_at });
  const falas = [
    fala("O que fica de pé é o combinado: você entra com R$ 50 hoje.", "2026-11-01T14:50:00.000Z"),
    fala("A chave do Pix de R$ 50 é 69900001234, no nome de Fulano de Tal Silva. O tipo é celular."),
  ];
  const conferirSolto = (cobrancas: ReturnType<typeof cobrancasEnviadas>) =>
    conferirComprovante({ texto: comprovante("R$ 50,00"), chave: CHAVE, cobrancas, extras: [PERGUNTA], valoresDoPrincipal: [13000], entradas: entradasCombinadas(falas), agora: AGORA });

  it("⭐ 23/11: comprovante certo de R$ 50 depois da chave em texto livre entra como entrada", () => {
    expect(cobrancasEnviadas(falas, CHAVE)).toEqual([{ valorCents: 5000, quantidade: 1, nome: null, enviadaEm: new Date(COBROU_EM) }]);
    expect(conferirSolto(cobrancasEnviadas(falas, CHAVE))).toMatchObject({ tipo: "confere_principal", valorCents: 5000, idDoPix: ID });
  });

  it("sem a chave na fala, segue sem cobrança", () => {
    expect(conferirSolto(cobrancasEnviadas(falas))).toEqual({ tipo: "nao_confere", motivo: "não há cobrança pela chave nesta conversa" });
    expect(cobrancasEnviadas([fala("Meu número é 69911112222, R$ 50")], CHAVE)).toEqual([]);
  });

  it("fala com a chave e mais de um valor vira cobrança sem valor", () => {
    expect(cobrancasEnviadas([fala("Chave (69) 9 0000-1234: R$ 50 agora e R$ 80 depois.")], CHAVE)[0]).toMatchObject({ valorCents: 0 });
  });
});
