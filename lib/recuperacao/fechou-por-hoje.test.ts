import { describe, expect, it } from "vitest";
import { fechouPorHoje, jaPerguntouQuantoCabe } from "./fechou-por-hoje";

describe("fechouPorHoje", () => {
  it("⭐ as falas medidas em 02/11 fecham por hoje", () => {
    for (const fala of [
      "Não tenho esse $ agora",
      "Nao",
      "Não tenho por.agora",
      "Obrigada",
      "Infelizmente eu não tenho dinheiro nenhum mãe. Tô zerado",
      "Em breve eu volto não tenho esse valor e nem cartão",
      "No momento não tenho dinheiro para realizar esse trabalho",
      "Agora não",
      "Ta bem , muito obrigada",
      "Amém 🙏🏻",
      "Pode deixa",
      "Não tenho condicoaes agora obrigado",
    ]) {
      expect(fechouPorHoje(fala), fala).toBe(true);
    }
  });

  it("quem segue conversando não fecha", () => {
    for (const fala of [
      "Não sei",
      "Sim",
      "Eu quero que ele me procure",
      "obrigada, quanto é?",
      "Ele não me bloqueou mais não falar nada comigo",
      "Não, eu sei o que eu tenho que fazer eu só quero saber o que eu te falei",
      "",
    ]) {
      expect(fechouPorHoje(fala), fala).toBe(false);
    }
    expect(fechouPorHoje(null)).toBe(false);
  });
});

describe("jaPerguntouQuantoCabe", () => {
  it("reconhece a pergunta de valor ou de dia", () => {
    expect(jaPerguntouQuantoCabe("Me diz só quanto caberia hoje, mesmo que seja pouquinho.")).toBe(true);
    expect(jaPerguntouQuantoCabe("Quanto você consegue colocar hoje? O restante a gente acerta depois.")).toBe(true);
    expect(jaPerguntouQuantoCabe("Prefere quinta ou sexta? Eu separo o seu nome.")).toBe(true);
    expect(jaPerguntouQuantoCabe("Que dia o dinheiro costuma cair pra você?")).toBe(true);
  });
  it("não confunde com a cobrança ou a conversa", () => {
    expect(jaPerguntouQuantoCabe("Conseguiu copiar a chave do Pix?")).toBe(false);
    expect(jaPerguntouQuantoCabe("Faz sentido pra você o que essa carta está mostrando?")).toBe(false);
    expect(jaPerguntouQuantoCabe(null)).toBe(false);
  });
});
