import { describe, expect, it, vi } from "vitest";

import { baloesPelaChave, cobrancaNoTexto } from "@/lib/pagamentos/como-pagar-pix";
import type { ChavePixDaEmpresa } from "@/lib/preco/chave-pix";
import type { Extra } from "@/lib/preco/tipos";

import { comprovanteDoTurno } from "./comprovante-no-turno";
import { cobrancasEnviadas, conferirComprovante, textoDaMidia, type FalaDaConversa } from "./comprovante-pix";

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
const COBROU_EM = "2026-11-01T15:00:00.000Z";
const AGORA = new Date("2026-11-01T15:30:00.000Z");
const ID = "E12345678202611011510abcDEF12345";
const comprovante = (valor: string, nome = "Fulano de Tal Silva", id = ID) => `Comprovante de Pix. Valor ${valor}. Para ${nome}. ID da transação ${id}`;
const cobranca = (valor: string): FalaDaConversa => ({ direction: "outbound", body: baloesPelaChave(valor, CHAVE.key, CHAVE.holder)[0]!, sent_at: COBROU_EM });

const conferir = (texto: string, falas: FalaDaConversa[] = [cobranca("R$ 7,00")]) =>
  conferirComprovante({ texto, chave: CHAVE, cobrancas: cobrancasEnviadas(falas), extras: [PERGUNTA], valoresDoPrincipal: [6000], agora: AGORA });

describe("conferência do comprovante Pix", () => {
  it("lê valor e quantidade da nossa própria cobrança", () => {
    expect(cobrancaNoTexto(baloesPelaChave("R$ 7,00", "x", "y")[0]!)).toEqual({ valorCents: 700, quantidade: 1, nome: null });
    expect(cobrancaNoTexto(baloesPelaChave("R$ 10,00 (2× Pergunta nova)", "x", "y")[0]!)).toEqual({ valorCents: 1000, quantidade: 2, nome: "Pergunta nova" });
    expect(cobrancaNoTexto("oi, tudo bem?")).toBeNull();
  });

  it("comprovante certo libera a avulsa com a quantidade cobrada", () => {
    expect(conferir(comprovante("R$ 7,00"))).toMatchObject({ tipo: "confere_extra", quantidade: 1, valorCents: 700, idDoPix: ID });
    expect(conferir(comprovante("R$ 10,00"), [cobranca("R$ 10,00 (2× Pergunta nova)")])).toMatchObject({ tipo: "confere_extra", quantidade: 2 });
  });

  it("aceita a chave no lugar do nome, mascarada como os bancos mostram", () => {
    expect(conferir(`Comprovante. R$ 7,00. Chave ***900001234. ID ${ID}`)).toMatchObject({ tipo: "confere_extra" });
  });

  it("produto principal em ordem vai para a pessoa confirmar no extrato", () => {
    expect(conferir(comprovante("R$ 60,00"), [cobranca("R$ 60,00")])).toMatchObject({ tipo: "confere_principal", valorCents: 6000 });
  });

  it.each([
    ["valor diferente", comprovante("R$ 5,00"), "valor"],
    ["outra pessoa recebeu", comprovante("R$ 7,00", "Beltrano Souza"), "recebeu"],
    ["sem ID", "Comprovante. R$ 7,00. Fulano de Tal Silva.", "ID da transação"],
    ["pago antes da cobrança", comprovante("R$ 7,00", undefined, "E12345678202610201510abcDEF12345"), "data"],
    ["data impossível", comprovante("R$ 7,00", undefined, "E12345678202613451510abcDEF12345"), "válido"],
  ])("não confere: %s", (_nome, texto, trecho) => {
    const r = conferir(texto);
    expect(r.tipo).toBe("nao_confere");
    if (r.tipo === "nao_confere") expect(r.motivo).toContain(trecho);
  });

  it("sem cobrança enviada não confere, e foto comum nem conta como comprovante", () => {
    expect(conferir(comprovante("R$ 7,00"), []).tipo).toBe("nao_confere");
    expect(conferir("Uma foto de um gato no sofá.").tipo).toBe("nenhum");
  });

  it("a legenda digitada pela pessoa não vale como comprovante", () => {
    expect(textoDaMidia(`[Mídia]\nLegenda do cliente: ${comprovante("R$ 7,00")}\nConteúdo: foto de um gato`)).toBe("foto de um gato");
    expect(textoDaMidia("texto comum")).toBe("");
  });
});

describe("comprovante no turno", () => {
  const log = { info: vi.fn(), warn: vi.fn() };
  const pricing = { enabled: true, list_price_cents: 6000, steps: [], pix_key: CHAVE, extras: [PERGUNTA] } as never;
  const falas: FalaDaConversa[] = [cobranca("R$ 7,00"), { direction: "inbound", type: "image", body: `[Mídia]\nConteúdo: ${comprovante("R$ 7,00")}`, sent_at: "2026-11-01T15:20:00.000Z" }];
  const turno = (pool: { query: ReturnType<typeof vi.fn> }, contactId = "c1") =>
    comprovanteDoTurno(pool as never, { organizationId: "o", contactId, conversationId: "v", pricing, mensagens: falas, agora: AGORA, log });

  it("grava o pagamento com extra e marca o contato, e o turno segue sem bloco extra", async () => {
    const pool = { query: vi.fn(async () => ({ rows: [{ id: "1" }] })) };
    expect(await turno(pool)).toBe("");
    expect(pool.query).toHaveBeenCalledTimes(2);
    const [sql, args] = pool.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("revenue_ledger");
    expect(args[2]).toBe(`comprovante-${ID}`);
    expect(JSON.parse(args[5] as string)).toMatchObject({ extra: "pergunta-nova", conferido_por: "comprovante" });
  });

  it("o mesmo comprovante de outro contato é recusado; o do mesmo contato é repetição do turno", async () => {
    const pool = { query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ contact_id: "outro" }] }) };
    expect(await turno(pool)).toContain("já foi usado");
    const repetido = { query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ contact_id: "c1" }] }) };
    expect(await turno(repetido)).toBe("");
  });

  it("sem chave principal não faz nada, e banco fora do ar não derruba o turno", async () => {
    const pool = { query: vi.fn(async () => { throw new Error("fora do ar"); }) };
    expect(await turno(pool)).toBe("");
    expect(await comprovanteDoTurno(pool as never, { organizationId: "o", contactId: "c", conversationId: "v", pricing: null, mensagens: falas, agora: AGORA, log })).toBe("");
  });

  it("mensagem nossa depois da mídia encerra: o comprovante já foi tratado", async () => {
    const pool = { query: vi.fn() };
    const depois = [...falas, { direction: "outbound" as const, body: "Recebi", sent_at: "2026-11-01T15:21:00.000Z" }];
    expect(await comprovanteDoTurno(pool as never, { organizationId: "o", contactId: "c", conversationId: "v", pricing, mensagens: depois, agora: AGORA, log })).toBe("");
    expect(pool.query).not.toHaveBeenCalled();
  });
});
