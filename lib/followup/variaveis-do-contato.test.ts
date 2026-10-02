import { describe, expect, it } from "vitest";

import { preencherVariaveisDoContato } from "./variaveis-do-contato";

const maria = { name: "  Maria das Dores Silva ", phone: "5511999990000", email: "maria@exemplo.com" };

describe("preencherVariaveisDoContato", () => {
  it("resolve as três grafias que os formulários oferecem, em inglês e em português", () => {
    const t = (s: string) => preencherVariaveisDoContato(s, maria);
    expect(t("{full_name}")).toBe("Maria das Dores Silva");
    expect(t("{{nome_completo}}")).toBe("Maria das Dores Silva");
    expect(t("{nome}")).toBe("Maria das Dores Silva");
    expect(t("{first_name}")).toBe("Maria");
    expect(t("{primeiro_nome}")).toBe("Maria");
    expect(t("{phone_number}")).toBe("5511999990000");
    expect(t("{telefone}")).toBe("5511999990000");
    expect(t("{{email}}")).toBe("maria@exemplo.com");
  });

  it("aceita espaço dentro das chaves duplas", () => {
    expect(preencherVariaveisDoContato("Oi {{ primeiro_nome }}!", maria)).toBe("Oi Maria!");
  });

  it("variável que o contato não tem vira vazio — nunca o token cru na mensagem do cliente", () => {
    expect(preencherVariaveisDoContato("Olá {full_name}!", { name: null, phone: null, email: null })).toBe("Olá !");
    expect(preencherVariaveisDoContato("{email}", { name: "A", phone: null, email: "  " })).toBe("");
  });

  it("token desconhecido fica como está: pode ser outro mecanismo ou erro de digitação que o dono precisa ver", () => {
    expect(preencherVariaveisDoContato("Volta {{volta}} de {{voltas}} — {chave_pix}", maria)).toBe(
      "Volta {{volta}} de {{voltas}} — {chave_pix}",
    );
  });

  it("várias ocorrências e texto sem variável", () => {
    expect(preencherVariaveisDoContato("{nome} {nome}", maria)).toBe("Maria das Dores Silva Maria das Dores Silva");
    expect(preencherVariaveisDoContato("sem variável", maria)).toBe("sem variável");
  });

  it("não é vulnerável a nome com caracteres de substituição", () => {
    // `$&` no nome não pode virar "o trecho casado" — a substituição é por função, não por string.
    expect(preencherVariaveisDoContato("{nome}", { name: "A$&B", phone: null, email: null })).toBe("A$&B");
  });
});
