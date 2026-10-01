import { describe, expect, it } from "vitest";

import { citaDadoDoLead, interpolarVariaveisDoContato, type DadosDoContato } from "./variaveis-do-contato";

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

describe("campos de fluxo do lead", () => {
  const comCampos: DadosDoContato = { ...vazio, campos: { cidade: "Recife", url_imagem_lead: "https://cdn.teste/a.jpg", Plano: "Ouro", vazio: "  " } };

  it("{{chave}} que é campo do lead é trocada pelo valor", () => {
    expect(interpolarVariaveisDoContato("Você mora em {{cidade}}?", comCampos)).toBe("Você mora em Recife?");
    expect(interpolarVariaveisDoContato("{{url_imagem_lead}}", comCampos)).toBe("https://cdn.teste/a.jpg");
  });

  it("acha a chave como foi escrita, com maiúscula", () => {
    expect(interpolarVariaveisDoContato("Plano {{Plano}}", comCampos)).toBe("Plano Ouro");
  });

  it("campo que existe mas está vazio some, como as outras variáveis", () => {
    expect(interpolarVariaveisDoContato("Obs: {{vazio}} fim", comCampos)).toBe("Obs: fim");
  });

  it("chave que nem é campo do lead fica literal; {{volta}} nunca é procurada nos campos", () => {
    const comVolta: DadosDoContato = { ...vazio, campos: { volta: "não deve usar" } };
    expect(interpolarVariaveisDoContato("{{nao_existe}} {{volta}}", comVolta)).toBe("{{nao_existe}} {{volta}}");
  });
});

describe("citaDadoDoLead — quando vale consultar o lead", () => {
  it("verdadeiro para {{etapa}} e para campo de fluxo", () => {
    expect(citaDadoDoLead("Você está em {{ etapa }}")).toBe(true);
    expect(citaDadoDoLead("Sua cidade: {{cidade}}")).toBe(true);
  });

  it("falso para o que o turno já tem (nome, telefone…) e para o laço", () => {
    expect(citaDadoDoLead("Olá {{nome}}, {{telefone}} — volta {{volta}} de {{voltas}}")).toBe(false);
    expect(citaDadoDoLead("sem variável nenhuma")).toBe(false);
  });
});
