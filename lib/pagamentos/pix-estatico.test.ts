/**
 * O Pix copia e cola gerado da chave da empresa. Um código com um caractere errado não é pago: o CRC e os
 * tamanhos dos campos são conferidos contra valores conhecidos do padrão.
 */
import { describe, expect, it } from "vitest";

import { ehCodigoDoPix } from "@/lib/agent-engine/agent/split-message";

import { chavePixNormalizada, codigoPixEstatico, crc16 } from "./pix-estatico";

describe("crc16", () => {
  it("bate com o valor de referência do CRC16-CCITT (0x1021, início 0xFFFF)", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
});

describe("chavePixNormalizada", () => {
  it("CNPJ e CPF vão só com dígitos; telefone com +55; e-mail em minúsculas; aleatória como veio", () => {
    expect(chavePixNormalizada("62.917.956/0001-00")).toBe("62917956000100");
    expect(chavePixNormalizada("123.456.789-09")).toBe("12345678909");
    expect(chavePixNormalizada("+55 (69) 98108-4871")).toBe("+5569981084871");
    expect(chavePixNormalizada("Financeiro@Exemplo.com.br")).toBe("financeiro@exemplo.com.br");
    expect(chavePixNormalizada("123E4567-E89B-12D3-A456-426614174000")).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it("o que não parece chave é recusado", () => {
    for (const ruim of ["", "abc", "12345", "nome@", "69 98108-4871 9999"]) expect(chavePixNormalizada(ruim), ruim).toBeNull();
  });
});

describe("codigoPixEstatico", () => {
  const pedido = { chave: "62.917.956/0001-00", nome: "Arcanum Imperium Digital", valorCentavos: 9000, identificador: "conv-1234" };

  it("⭐ monta o código com a chave, o valor, o nome e um CRC que fecha", () => {
    const codigo = codigoPixEstatico(pedido)!;
    expect(codigo.startsWith("000201")).toBe(true);
    expect(codigo).toContain("0014br.gov.bcb.pix011462917956000100");
    expect(codigo).toContain("540590.00");
    expect(codigo).toContain("5924ARCANUM IMPERIUM DIGITAL");
    expect(codigo).toContain("6006BRASIL");
    expect(codigo).toContain("0508conv1234");
    // O CRC do fim é o do próprio código sem ele.
    expect(codigo.slice(-4)).toBe(crc16(codigo.slice(0, -4)));
    // E o corte de balões o reconhece como código, para ir sozinho num balão.
    expect(ehCodigoDoPix(codigo)).toBe(true);
  });

  it("valor com centavos, nome com acento e cidade informada", () => {
    const codigo = codigoPixEstatico({ chave: "12345678909", nome: "João da Conceição Araújo Filho Segundo", cidade: "São Paulo", valorCentavos: 3750 })!;
    expect(codigo).toContain("540537.50");
    // Cortado em 25 caracteres e sem espaço sobrando no fim.
    expect(codigo).toContain("5924JOAO DA CONCEICAO ARAUJO60");
    expect(codigo).toContain("6009SAO PAULO");
    expect(codigo).toContain("0503***");
  });

  it("chave que não serve, nome vazio ou valor inválido não geram código", () => {
    expect(codigoPixEstatico({ ...pedido, chave: "abc" })).toBeNull();
    expect(codigoPixEstatico({ ...pedido, nome: "  " })).toBeNull();
    expect(codigoPixEstatico({ ...pedido, valorCentavos: 0 })).toBeNull();
  });
});
