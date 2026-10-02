/**
 * O cliente do Asaas é a borda onde dinheiro sai. O que estes casos guardam:
 * a cobrança NUNCA é criada duas vezes (replay do job reencontra a que existe), a chave vai em header e nunca
 * em URL, cada tipo de falha tem o tratamento certo (chave inválida e recusa não repetem; indisponibilidade
 * sim), e o que o Asaas devolve de incompleto vira erro visível em vez de link vazio para o cliente.
 */
import { describe, expect, it, vi } from "vitest";

import { celularParaAsaas, criarClienteAsaas, ErroDeCobranca, vencimentoDeAmanha, type PedidoDeCobranca } from "./asaas";

type Chamada = { url: string; metodo: string; corpo: unknown; headers: Record<string, string> };

/** Um Asaas de mentira: responde pela rota e guarda o que foi chamado. */
function asaas(rotas: Array<[RegExp, () => { status?: number; json?: unknown; texto?: string } | Error]>) {
  const chamadas: Chamada[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const metodo = init.method ?? "GET";
    chamadas.push({ url, metodo, corpo: init.body ? JSON.parse(init.body as string) : undefined, headers: init.headers as Record<string, string> });
    const rota = rotas.find(([rx]) => rx.test(`${metodo} ${url}`));
    if (!rota) throw new Error(`rota não prevista: ${metodo} ${url}`);
    const r = rota[1]();
    if (r instanceof Error) throw r;
    return new Response(r.texto ?? JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  });
  return { fetch, chamadas };
}

const pedido: PedidoDeCobranca = {
  referencia: "enr-1:cobranca",
  cliente: { referencia: "lead-1", nome: "Maria Souza", telefone: "5511999990000", email: "maria@exemplo.com" },
  valorCentavos: 19700,
  descricao: "Consulta",
};
const cred = { apiKey: "chave-secreta-de-teste-123", ambiente: "sandbox" as const };
const agora = () => new Date("2026-09-30T15:00:00.000Z");

const SEM_COBRANCA = /GET .*\/payments\?externalReference/;
const SEM_CLIENTE = /GET .*\/customers\?externalReference/;

describe("cobrar — criação", () => {
  it("cria cliente, cobrança PIX de amanhã e devolve link + copia-e-cola", async () => {
    const { fetch, chamadas } = asaas([
      [SEM_COBRANCA, () => ({ json: { data: [] } })],
      [SEM_CLIENTE, () => ({ json: { data: [] } })],
      [/POST .*\/customers$/, () => ({ json: { id: "cus_1" } })],
      [/POST .*\/payments$/, () => ({ json: { id: "pay_1", invoiceUrl: "https://asaas/i/pay_1" } })],
      [/GET .*\/payments\/pay_1\/pixQrCode/, () => ({ json: { payload: "00020126...COPIA" } })],
    ]);
    const r = await criarClienteAsaas(cred, { fetch, agora }).cobrar(pedido);

    expect(r).toEqual({ id: "pay_1", link: "https://asaas/i/pay_1", pixCopiaECola: "00020126...COPIA", reaproveitada: false });
    const cobranca = chamadas.find((c) => c.metodo === "POST" && c.url.endsWith("/payments"))!;
    expect(cobranca.corpo).toEqual({
      customer: "cus_1",
      billingType: "PIX",
      value: 197,
      dueDate: "2026-10-01",
      description: "Consulta",
      externalReference: "enr-1:cobranca",
    });
    const cliente = chamadas.find((c) => c.url.endsWith("/customers") && c.metodo === "POST")!;
    expect(cliente.corpo).toMatchObject({ name: "Maria Souza", externalReference: "lead-1", mobilePhone: "11999990000", email: "maria@exemplo.com" });
  });

  it("a chave vai no header e NUNCA na URL; o ambiente escolhe o host", async () => {
    const { fetch, chamadas } = asaas([
      [SEM_COBRANCA, () => ({ json: { data: [{ id: "p", invoiceUrl: "https://x" }] } })],
      [/GET .*pixQrCode/, () => ({ json: {} })],
    ]);
    await criarClienteAsaas(cred, { fetch }).cobrar(pedido);
    await criarClienteAsaas({ ...cred, ambiente: "production" }, { fetch }).cobrar(pedido);
    expect(chamadas.every((c) => c.headers.access_token === cred.apiKey && !c.url.includes(cred.apiKey))).toBe(true);
    expect(chamadas[0]!.url.startsWith("https://api-sandbox.asaas.com/v3")).toBe(true);
    expect(chamadas.find((c) => c.url.startsWith("https://api.asaas.com/v3"))).toBeDefined();
  });

  it("cliente já cadastrado para este contato é reaproveitado, não duplicado", async () => {
    const { fetch, chamadas } = asaas([
      [SEM_COBRANCA, () => ({ json: { data: [] } })],
      [SEM_CLIENTE, () => ({ json: { data: [{ id: "cus_antigo" }] } })],
      [/POST .*\/payments$/, () => ({ json: { id: "pay_2", invoiceUrl: "https://asaas/i/pay_2" } })],
      [/GET .*pixQrCode/, () => ({ json: { payload: "x" } })],
    ]);
    await criarClienteAsaas(cred, { fetch, agora }).cobrar(pedido);
    expect(chamadas.some((c) => c.metodo === "POST" && c.url.endsWith("/customers"))).toBe(false);
    expect(chamadas.find((c) => c.url.endsWith("/payments") && c.metodo === "POST")!.corpo).toMatchObject({ customer: "cus_antigo" });
  });
});

describe("cobrar — idempotência (o replay do job não cobra duas vezes)", () => {
  it("cobrança com a mesma referência é REAPROVEITADA: nada é criado", async () => {
    const { fetch, chamadas } = asaas([
      [SEM_COBRANCA, () => ({ json: { data: [{ id: "pay_1", invoiceUrl: "https://asaas/i/pay_1" }] } })],
      [/GET .*pixQrCode/, () => ({ json: { payload: "COPIA" } })],
    ]);
    const r = await criarClienteAsaas(cred, { fetch }).cobrar(pedido);
    expect(r).toMatchObject({ id: "pay_1", reaproveitada: true, pixCopiaECola: "COPIA" });
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });
});

describe("cobrar — o que dá errado", () => {
  it.each([401, 403])("%i: chave inválida — erro que NÃO se repete, com instrução", async (status) => {
    const { fetch } = asaas([[/.*/, () => ({ status, json: { errors: [{ description: "invalid_access_token" }] } })]]);
    const e = await criarClienteAsaas(cred, { fetch }).cobrar(pedido).catch((x) => x);
    expect(e).toBeInstanceOf(ErroDeCobranca);
    expect(e.codigo).toBe("chave_invalida");
    expect(e.message).toContain("Configurações › Pagamentos");
  });

  it("400 com a descrição do Asaas: recusa permanente que repete a causa real", async () => {
    const { fetch } = asaas([
      [SEM_COBRANCA, () => ({ json: { data: [] } })],
      [SEM_CLIENTE, () => ({ json: { data: [] } })],
      [/POST .*\/customers$/, () => ({ status: 400, json: { errors: [{ description: "CPF ou CNPJ é obrigatório" }] } })],
    ]);
    const e = await criarClienteAsaas(cred, { fetch }).cobrar(pedido).catch((x) => x);
    expect(e).toBeInstanceOf(ErroDeCobranca);
    expect(e.codigo).toBe("recusada");
    expect(e.message).toContain("CPF ou CNPJ é obrigatório");
  });

  it.each([500, 502, 429])("%i: indisponibilidade é erro COMUM (o job tenta de novo), não recusa", async (status) => {
    const { fetch } = asaas([[/.*/, () => ({ status, texto: "oops" })]]);
    const e = await criarClienteAsaas(cred, { fetch }).cobrar(pedido).catch((x) => x);
    expect(e).not.toBeInstanceOf(ErroDeCobranca);
    expect(e.message).toMatch(/asaas_indisponivel/);
  });

  it("rede caída também é transitória", async () => {
    const { fetch } = asaas([[/.*/, () => new Error("ECONNRESET")]]);
    const e = await criarClienteAsaas(cred, { fetch }).cobrar(pedido).catch((x) => x);
    expect(e).not.toBeInstanceOf(ErroDeCobranca);
    expect(e.message).toContain("ECONNRESET");
  });

  it("cobrança criada sem link de pagamento vira erro — nunca uma mensagem com link vazio para o cliente", async () => {
    const { fetch } = asaas([
      [SEM_COBRANCA, () => ({ json: { data: [] } })],
      [SEM_CLIENTE, () => ({ json: { data: [{ id: "c" }] } })],
      [/POST .*\/payments$/, () => ({ json: { id: "pay_x" } })],
    ]);
    await expect(criarClienteAsaas(cred, { fetch, agora }).cobrar(pedido)).rejects.toThrow(/sem devolver o link/);
  });

  it("o copia-e-cola é um extra: se o QR falhar, a cobrança segue com o link", async () => {
    const { fetch } = asaas([
      [SEM_COBRANCA, () => ({ json: { data: [{ id: "p", invoiceUrl: "https://x" }] } })],
      [/GET .*pixQrCode/, () => ({ status: 400, json: { errors: [{ description: "sem qr" }] } })],
    ]);
    expect(await criarClienteAsaas(cred, { fetch }).cobrar(pedido)).toMatchObject({ link: "https://x", pixCopiaECola: null });
  });

  it.each([0, -5, 1.5, Number.NaN])("valor %s em centavos nem chega ao Asaas", async (valorCentavos) => {
    const { fetch } = asaas([]);
    await expect(criarClienteAsaas(cred, { fetch }).cobrar({ ...pedido, valorCentavos })).rejects.toBeInstanceOf(ErroDeCobranca);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("validarChave", () => {
  it("chave boa passa; recusada vira ErroDeCobranca chave_invalida", async () => {
    const boa = asaas([[/GET .*\/customers\?limit=1/, () => ({ json: { data: [] } })]]);
    await expect(criarClienteAsaas(cred, { fetch: boa.fetch }).validarChave()).resolves.toBeUndefined();
    const ruim = asaas([[/.*/, () => ({ status: 401 })]]);
    await expect(criarClienteAsaas(cred, { fetch: ruim.fetch }).validarChave()).rejects.toMatchObject({ codigo: "chave_invalida" });
  });
});

describe("formatos", () => {
  it.each([
    ["5511999990000", "11999990000"],
    ["+55 (11) 99999-0000", "11999990000"],
    ["1133334444", "1133334444"],
    ["551133334444", "1133334444"],
  ])("celular %s → %s", (entrada, saida) => expect(celularParaAsaas(entrada)).toBe(saida));

  it.each([null, "", "123", "99999999999999999"])("telefone %j não cabe: fica de fora em vez de ir errado", (t) => {
    expect(celularParaAsaas(t)).toBeUndefined();
  });

  it("o vencimento é amanhã no fuso de Brasília — às 01h de Brasília ainda é o dia anterior em UTC", () => {
    expect(vencimentoDeAmanha(new Date("2026-09-30T15:00:00Z"))).toBe("2026-10-01");
    // 2026-10-01T02:00Z = 2026-09-30 23:00 em Brasília → amanhã é 01/10, não 02/10.
    expect(vencimentoDeAmanha(new Date("2026-10-01T02:00:00Z"))).toBe("2026-10-01");
    expect(vencimentoDeAmanha(new Date("2026-12-31T12:00:00Z"))).toBe("2027-01-01");
  });
});
