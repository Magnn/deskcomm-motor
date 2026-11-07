/**
 * Os quizzes na língua de quem lê (`textos-dos-quizzes.ts`): toda pergunta, resposta e prévia calculada dos quatro
 * quizzes tem tradução nos cinco idiomas da área; o dicionário entregue ao navegador traduz só o que a tela mostra, e
 * a resposta gravada segue em português (a pontuação dos caminhos compara o texto em português).
 */
import { describe, expect, it } from "vitest";

import { perfilDosCaminhos, PERGUNTAS_DOS_CAMINHOS, previaDaProsperidade, previaDaSombra, previaDoPar } from "@/lib/area-do-cliente/quizzes";
import { previaDaSinastria } from "@/lib/area-do-cliente/sinastria";
import { dicionarioDosQuizzes, textosDosQuizzes, tradutorDoQuiz } from "@/lib/area-do-cliente/textos-dos-quizzes";
import { traduzirNaArea, type IdiomaDaArea } from "@/lib/i18n/area";
import { AREA_DE } from "@/lib/i18n/area/de";
import { AREA_EN } from "@/lib/i18n/area/en";
import { AREA_FR } from "@/lib/i18n/area/fr";
import { AREA_IT } from "@/lib/i18n/area/it";
import { DICIONARIO } from "@/lib/i18n/dicionario";

describe("quizzes em outros idiomas", () => {
  it("⭐ todo texto fixo dos quatro quizzes tem espanhol, inglês, francês, italiano e alemão", () => {
    const textos = textosDosQuizzes();
    expect(textos.length).toBeGreaterThan(300);
    const faltando = (dic: Record<string, unknown>) => textos.filter((s) => !(s in dic));
    expect(textos.filter((s) => !DICIONARIO[s]?.es), "es").toEqual([]);
    expect(faltando(AREA_EN), "en").toEqual([]);
    expect(faltando(AREA_FR), "fr").toEqual([]);
    expect(faltando(AREA_IT), "it").toEqual([]);
    expect(faltando(AREA_DE), "de").toEqual([]);
  });

  it("⭐ a prévia calculada cai inteira no dicionário: sinastria, prosperidade, caminhos e Vênus do par", () => {
    const t = tradutorDoQuiz(dicionarioDosQuizzes((s) => traduzirNaArea(s, "en")));
    const sin = previaDaSinastria("1990-08-10", "1988-01-15")!;
    expect([t(sin.signoDela), t(sin.elementoDela), t(sin.titulo), t(sin.forte)]).toEqual([
      "Leo",
      "fire",
      "Fire and ground",
      "One brings passion, the other brings security.",
    ]);
    const pro = previaDaProsperidade("1990-08-10", new Date("2026-11-06T12:00:00Z"))!;
    expect(t(pro.titulo)).not.toBe(pro.titulo);
    expect(t(pro.texto)).not.toBe(pro.texto);
    expect(t(pro.tomDoAno)).not.toBe(pro.tomDoAno);
    const par = previaDoPar("1990-08-10", {})!;
    expect(t(par.retrato.venus.atrai)).not.toBe(par.retrato.venus.atrai);
    expect(t("Vênus em")).toBe("Venus in");
  });

  it("a pontuação segue em português: a resposta gravada é a opção original, não a traduzida", () => {
    const respostas = Object.fromEntries(PERGUNTAS_DOS_CAMINHOS.map((p) => [p.id, p.opcoes[0]![0]]));
    const t = tradutorDoQuiz(dicionarioDosQuizzes((s) => traduzirNaArea(s, "de")));
    expect(t(respostas.area!)).toBe("Arbeit und Geld");
    expect(perfilDosCaminhos(respostas)).toBe("coragem");
  });

  it("em português o dicionário é vazio (nada muda na tela de hoje)", () => {
    expect(dicionarioDosQuizzes((s) => traduzirNaArea(s, "pt-BR" as IdiomaDaArea))).toEqual({});
  });

  it("⭐ O Código da Sombra inteiro no dicionário: perguntas, respostas, Sombra, erro e o nível dela (06/11: em francês saía meio português)", () => {
    const respostas = { perto: "Se irrita com qualquer coisa", mensagens_dele: "Responde atravessado, com ironia", briga: "Levanta a voz", reacao: "Cobro e acabo brigando", quer: "Parar de me sentir assim" };
    const s = previaDaSombra(respostas);
    for (const idioma of ["es", "en", "fr", "it", "de"] as IdiomaDaArea[]) {
      const t = tradutorDoQuiz(dicionarioDosQuizzes((x) => traduzirNaArea(x, idioma)));
      for (const x of [s.titulo, s.texto, s.erro, s.dela.nome, respostas.quer, "Há quanto tempo ele está diferente com você?"]) expect(t(x), `${idioma}: ${x}`).not.toBe(x);
    }
  });
});
