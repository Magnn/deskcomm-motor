import { describe, expect, it } from "vitest";
import { agenteEncerrou, fechouPorHoje, fechouPorHojeNasFalas, jaPerguntouQuantoCabe } from "./fechou-por-hoje";

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

describe("fechouPorHojeNasFalas", () => {
  it("⭐ caso de 21/11: despedida seguida de 'Ok' fecha por hoje", () => {
    expect(fechouPorHojeNasFalas(["Vou mandando aos poucos", "Obrigada, até mais tarde", "Ok"])).toBe(true);
    expect(fechouPorHojeNasFalas(["Obrigada", "👍"])).toBe(true);
  });
  it("'ok' depois de conversa que segue não fecha; 'ok?' é pergunta", () => {
    expect(fechouPorHojeNasFalas(["Quanto fica?", "Ok"])).toBe(false);
    expect(fechouPorHojeNasFalas(["Obrigada", "ok?"])).toBe(false);
    expect(fechouPorHojeNasFalas(["Ok"])).toBe(false);
    expect(fechouPorHojeNasFalas([])).toBe(false);
    expect(fechouPorHojeNasFalas(null)).toBe(false);
  });
});

describe("agenteEncerrou", () => {
  it("⭐ a agente se despediu sem pergunta no ar", () => {
    expect(agenteEncerrou("Combinado, minha flor. Até mais tarde. 🌙")).toBe(true);
    expect(agenteEncerrou("Fica com Deus, minha flor. Boa noite 🌙")).toBe(true);
  });
  it("saudação no começo, ou pergunta no ar, não é encerramento", () => {
    expect(agenteEncerrou("Boa noite, meu bem. Consegui deixar o seu trabalho por R$ 60, uma vez só.")).toBe(false);
    expect(agenteEncerrou("Amanhã cedo passo aqui. Descansa hoje, tá bom?")).toBe(false);
    expect(agenteEncerrou(null)).toBe(false);
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
