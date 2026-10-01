import { describe, expect, it } from "vitest";

import { citaEtapa, interpolarVariaveisDoContato, type DadosDoContato } from "./variaveis-do-contato";

const completo: DadosDoContato = {
  nome: "Maria Silva",
  telefone: "+5511988887777",
  email: "maria@teste.dev",
  etapa: "Proposta enviada",
};
const vazio: DadosDoContato = { nome: null, telefone: null, email: null, etapa: null };

describe("interpolarVariaveisDoContato", () => {
  it("troca as cinco variáveis que a tela oferece", () => {
    expect(
      interpolarVariaveisDoContato(
        "{{nome}} | {{primeiro_nome}} | {{telefone}} | {{email}} | {{etapa}}",
        completo,
      ),
    ).toBe("Maria Silva | Maria | +5511988887777 | maria@teste.dev | Proposta enviada");
  });

  it("aceita espaço dentro das chaves e maiúsculas — é como as pessoas digitam", () => {
    expect(interpolarVariaveisDoContato("Oi {{ Primeiro_Nome }}!", completo)).toBe("Oi Maria!");
  });

  it("variável SEM valor some, e a frase é arrumada — nunca sai literal", () => {
    expect(interpolarVariaveisDoContato("Olá {{primeiro_nome}}, tudo bem?", vazio)).toBe("Olá, tudo bem?");
    expect(interpolarVariaveisDoContato("{{nome}} seja bem-vindo", vazio)).toBe("seja bem-vindo");
    expect(interpolarVariaveisDoContato("Seu e-mail: {{email}}", vazio)).toBe("Seu e-mail:");
  });

  it("texto que era só a variável sem valor fica vazio — quem chama decide pular", () => {
    expect(interpolarVariaveisDoContato("{{email}}", vazio)).toBe("");
  });

  it("a arrumação só mexe na LINHA da variável que sumiu: o resto sai byte a byte", () => {
    const texto = "Linha  com  dois  espaços\nOlá {{nome}} !\n   recuo de propósito";
    expect(interpolarVariaveisDoContato(texto, vazio)).toBe(
      "Linha  com  dois  espaços\nOlá!\n   recuo de propósito",
    );
  });

  it("texto sem variável sai intacto, inclusive espaços nas pontas", () => {
    const texto = "  duplo  espaço , e vírgula solta  ";
    expect(interpolarVariaveisDoContato(texto, completo)).toBe(texto);
  });

  it("variável DESCONHECIDA fica como está — não é deste módulo apagar", () => {
    expect(interpolarVariaveisDoContato("Volta {{volta}} de {{voltas}}, {{campo_do_fluxo}}", vazio)).toBe(
      "Volta {{volta}} de {{voltas}}, {{campo_do_fluxo}}",
    );
  });

  it("o valor do contato entra como texto, mesmo que pareça variável", () => {
    expect(interpolarVariaveisDoContato("Oi {{nome}}", { ...vazio, nome: "{{email}}" })).toBe("Oi {{email}}");
  });
});

describe("citaEtapa", () => {
  it("só é verdadeiro quando o texto cita {{etapa}}", () => {
    expect(citaEtapa("Você está em {{ etapa }}")).toBe(true);
    expect(citaEtapa("Olá {{nome}}, a etapa é outra conversa")).toBe(false);
  });
});
