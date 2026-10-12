/**
 * O boleto pronto na conversa. A marca traz o CPF de quem paga: ela nunca pode passar crua, e o CPF nunca pode
 * voltar no texto enviado.
 */
import { describe, expect, it, vi } from "vitest";

import { boletoNoLugarDaMarca } from "@/lib/agent-engine/agent/boleto-no-envio";
import { enderecoDoCep } from "@/lib/pagamentos/cep";
import { criarClienteStripe } from "@/lib/pagamentos/stripe";

import { blocoDoBoletoPronto, corpoComBoleto, cpfValido, marcaDeBoletoNoCorpo, temMarcaDeBoleto } from "./boleto-pronto";

// CPF de exemplo com dígitos verificadores certos, usado em documentação de validadores.
const CPF = "529.982.247-25";
const MARCA = `[[BOLETO: 130 | Maria da Silva Souza | ${CPF} | 76801-000]]`;

describe("cpfValido", () => {
  it("confere os dois dígitos verificadores e recusa dígito repetido", () => {
    expect(cpfValido(CPF)).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("529.982.247-26")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("123")).toBe(false);
  });
});

describe("marcaDeBoletoNoCorpo", () => {
  it("⭐ lê valor, nome, CPF, CEP e e-mail opcional", () => {
    const lida = marcaDeBoletoNoCorpo(`Prontinho.\n\n${MARCA}`);
    expect(lida).toMatchObject({ tipo: "uma", pedido: { valorCents: 13000, nome: "Maria da Silva Souza", cpf: "52998224725", cep: "76801000", email: null } });
    const comEmail = marcaDeBoletoNoCorpo(`[[BOLETO: R$ 60 | Maria Souza | ${CPF} | 76801000 | Maria@Exemplo.com]]`);
    expect(comEmail).toMatchObject({ tipo: "uma", pedido: { valorCents: 6000, email: "maria@exemplo.com" } });
    expect(marcaDeBoletoNoCorpo("Me conta mais.")).toEqual({ tipo: "nenhuma" });
  });

  it("⭐ dado faltando ou errado volta ao modelo com o motivo, sem adivinhar", () => {
    for (const corpo of [
      "[[BOLETO: 130 | Maria Souza]]",
      `[[BOLETO: cento e trinta | Maria Souza | ${CPF} | 76801-000]]`,
      `[[BOLETO: 130 | Maria | ${CPF} | 76801-000]]`,
      "[[BOLETO: 130 | Maria Souza | 123.456.789-00 | 76801-000]]",
      `[[BOLETO: 130 | Maria Souza | ${CPF} | 7680]]`,
      `${MARCA}\n\n${MARCA}`,
      "[[BOLETO]]",
    ]) {
      expect(marcaDeBoletoNoCorpo(corpo).tipo, corpo).toBe("invalida");
      expect(temMarcaDeBoleto(corpo)).toBe(true);
    }
  });
});

describe("corpoComBoleto e o bloco", () => {
  it("⭐ o CPF e o CEP somem do que é enviado; ficam o link, a linha digitável e o prazo", () => {
    const original = `Prontinho, Maria.\n\n${MARCA}\n\nConseguiu abrir?`;
    const lida = marcaDeBoletoNoCorpo(original);
    if (lida.tipo !== "uma") throw new Error("era para ler a marca");
    const corpo = corpoComBoleto(original, lida.pedido, { url: "https://boleto.exemplo.com/abc", linhaDigitavel: "23793.38128 60000.000003 00000.000400 1 84340000013000" });
    expect(corpo).not.toContain("529");
    expect(corpo).not.toContain("76801");
    expect(corpo).not.toContain("[[");
    expect(corpo).toContain("*R$ 130*");
    expect(corpo).toContain("https://boleto.exemplo.com/abc");
    expect(corpo).toContain("23793.38128");
    expect(corpo.endsWith("Conseguiu abrir?")).toBe(true);
  });

  it("o bloco pede os três dados de uma vez e lista os valores liberados", () => {
    const bloco = blocoDoBoletoPronto([6000, 13000]);
    expect(bloco).toContain("*nome completo*, *CPF* e *CEP*");
    expect(bloco).toContain("[[BOLETO: 130 |");
    expect(bloco).toContain("R$ 130, R$ 60");
    expect(blocoDoBoletoPronto([])).toBe("");
  });
});

describe("boletoNoLugarDaMarca", () => {
  const endereco = { cep: "76801000", logradouro: "Avenida Sete de Setembro", cidade: "Porto Velho", uf: "RO" };
  const base = {
    corpo: `Prontinho.\n\n${MARCA}`,
    valoresPermitidosCents: [13000, 6000],
    metadadosDoValor: () => ({ organization_id: "org", contact_id: "contato", conversation_id: "conversa", produto: "Abertura do Coração" }),
    descricaoDoValor: () => "Abertura do Coração",
    emailPadrao: "sem-email+contato@exemplo.com" as string | null,
    organizationId: "org",
    conversationId: "conversa",
    supabase: {} as never,
    log: { info: vi.fn(), warn: vi.fn() },
    lerConexao: async (): Promise<{ id: string; organizationId: string; chave: string; segredoDoAviso: string } | null> => ({ id: "c", organizationId: "org", chave: "sk_x", segredoDoAviso: "w" }),
    buscarEndereco: async (): Promise<typeof endereco | null> => endereco,
  };

  it("⭐ emite o boleto com o pagador completo e troca a marca", async () => {
    const criarBoleto = vi.fn(async (_c: unknown, _p: unknown) => ({ id: "pi_1", url: "https://boleto.exemplo.com/abc", linhaDigitavel: "23793.38128" }));
    const saida = await boletoNoLugarDaMarca({ ...base, criarBoleto });
    expect("corpo" in saida && saida.corpo).toContain("https://boleto.exemplo.com/abc");
    expect(criarBoleto.mock.calls[0]![1]).toMatchObject({
      valorCentavos: 13000,
      metadados: { contact_id: "contato", produto: "Abertura do Coração" },
      pagador: { nome: "Maria da Silva Souza", cpf: "52998224725", email: "sem-email+contato@exemplo.com", endereco },
    });
  });

  it("⭐ valor não liberado, CEP não encontrado, sem e-mail possível e sem conta: recusa sem emitir nada", async () => {
    const criarBoleto = vi.fn(async (_c: unknown, _p: unknown) => ({ id: "pi_1", url: "https://boleto.exemplo.com/abc", linhaDigitavel: null }));
    const casos = [
      { ...base, valoresPermitidosCents: [6000], criarBoleto },
      { ...base, buscarEndereco: async () => null, criarBoleto },
      { ...base, emailPadrao: null, criarBoleto },
      { ...base, lerConexao: async () => null, criarBoleto },
    ];
    for (const caso of casos) expect("recusa" in (await boletoNoLugarDaMarca(caso))).toBe(true);
    expect(criarBoleto).not.toHaveBeenCalled();
  });

  it("provedor fora do ar recusa o envio, e o registro do boleto emitido não leva o CPF", async () => {
    const fora = await boletoNoLugarDaMarca({
      ...base,
      criarBoleto: async () => {
        throw new Error("fora");
      },
    });
    expect("recusa" in fora).toBe(true);
    const log = { info: vi.fn(), warn: vi.fn() };
    await boletoNoLugarDaMarca({ ...base, log, criarBoleto: async () => ({ id: "pi_1", url: "https://boleto.exemplo.com/abc", linhaDigitavel: null }) });
    expect(JSON.stringify(log.info.mock.calls)).not.toContain("52998224725");
  });
});

describe("contratos de rede: o CEP e o boleto", () => {
  const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

  it("o CEP vira endereço; CEP geral sem rua usa o bairro ou a cidade; inexistente e fora do ar devolvem null", async () => {
    expect(await enderecoDoCep("76801-000", { fetch: async () => resposta({ logradouro: "Avenida Sete", bairro: "Centro", localidade: "Porto Velho", uf: "ro" }) })).toEqual({
      cep: "76801000",
      logradouro: "Avenida Sete",
      cidade: "Porto Velho",
      uf: "RO",
    });
    expect(await enderecoDoCep("76801000", { fetch: async () => resposta({ logradouro: "", bairro: "", localidade: "Candeias", uf: "RO" }) })).toMatchObject({ logradouro: "Candeias" });
    expect(await enderecoDoCep("76801000", { fetch: async () => resposta({ erro: true }) })).toBeNull();
    expect(
      await enderecoDoCep("76801000", {
        fetch: async () => {
          throw new Error("rede");
        },
      }),
    ).toBeNull();
    expect(await enderecoDoCep("123", { fetch: async () => resposta({}) })).toBeNull();
  });

  it("o boleto vai com CPF, nome, e-mail e endereço, e devolve a página e a linha digitável", async () => {
    const buscar = vi.fn(async (_url: string, _init: RequestInit) =>
      resposta({ id: "pi_1", next_action: { boleto_display_details: { number: "23793.38128", hosted_voucher_url: "https://boleto.exemplo.com/abc" } } }),
    );
    const boleto = await criarClienteStripe({ chave: "sk_x" }, { fetch: buscar }).criarBoleto({
      valorCentavos: 13000,
      descricao: "Abertura do Coração",
      referencia: "boleto-c-13000-1",
      metadados: { contact_id: "contato" },
      pagador: { nome: "Maria Souza", cpf: "52998224725", email: "m@exemplo.com", endereco: { cep: "76801000", logradouro: "Avenida Sete", cidade: "Porto Velho", uf: "RO" } },
      venceEmDias: 5,
    });
    expect(boleto).toEqual({ id: "pi_1", url: "https://boleto.exemplo.com/abc", linhaDigitavel: "23793.38128" });
    const campos = new URLSearchParams(String(buscar.mock.calls[0]![1].body));
    expect(campos.get("payment_method_types[0]")).toBe("boleto");
    expect(campos.get("payment_method_data[boleto][tax_id]")).toBe("52998224725");
    expect(campos.get("payment_method_data[billing_details][address][postal_code]")).toBe("76801000");
    expect(campos.get("payment_method_options[boleto][expires_after_days]")).toBe("5");
    expect(campos.get("metadata[contact_id]")).toBe("contato");
  });
});
