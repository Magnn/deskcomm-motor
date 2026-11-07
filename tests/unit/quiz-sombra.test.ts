import { describe, expect, it } from "vitest";

import { pedidoDoQuiz } from "@/lib/area-do-cliente/circulo-ia";
import { LINHA_DOS_200, NIVEIS_DELA, PERGUNTAS_DA_SOMBRA, SOMBRAS, nivelDela, previaDoQuiz, sombraDele, votosDaSombra } from "@/lib/area-do-cliente/quizzes";

const r = (perto: string, mensagens: string, briga: string, reacao = "Cobro e acabo brigando") => ({ tempo: "Meses", perto, mensagens_dele: mensagens, briga, reacao, quer: "Saber o que falar e o que não falar" });

describe("O Código da Sombra", () => {
  it("a Sombra dele é a maioria das respostas sobre ele", () => {
    expect(sombraDele(r("Se irrita com qualquer coisa", "Responde atravessado, com ironia", "Sai e some por um tempo"))).toBe("raiva");
    expect(votosDaSombra(r("Se irrita com qualquer coisa", "Responde atravessado, com ironia", "Sai e some por um tempo"))).toHaveLength(3);
  });

  it("empate fica com a última resposta; sem resposta, o Orgulho", () => {
    expect(sombraDele({ perto: "Diz que está cansado ou ocupado", mensagens_dele: "Demora horas para responder" })).toBe("medo");
    expect(sombraDele({})).toBe("orgulho");
  });

  it("o nível dela sai da reação; todos os níveis ficam abaixo da linha dos 200", () => {
    expect(nivelDela({ reacao: "Fico quieta e magoada" })).toEqual({ nome: "Tristeza", nivel: 75 });
    expect(nivelDela({ reacao: "resposta forjada" }).nivel).toBe(100);
    for (const n of Object.values(NIVEIS_DELA)) expect(n.nivel).toBeLessThan(LINHA_DOS_200);
    for (const s of Object.values(SOMBRAS)) expect(s.nivel).toBeLessThan(LINHA_DOS_200);
  });

  it("toda opção da pergunta da reação tem um nível, e as perguntas sobre ele apontam as quatro Sombras", () => {
    const reacao = PERGUNTAS_DA_SOMBRA.find((p) => p.id === "reacao")!;
    expect(reacao.opcoes.map(([o]) => o).sort()).toEqual(Object.keys(NIVEIS_DELA).sort());
    for (const id of ["perto", "mensagens_dele", "briga"]) {
      const p = PERGUNTAS_DA_SOMBRA.find((q) => q.id === id)!;
      expect(new Set(p.opcoes.map(([, s]) => s))).toEqual(new Set(Object.keys(SOMBRAS)));
    }
  });

  it("a prévia leva ao pedido da leitura os dois níveis e a linha", () => {
    const p = previaDoQuiz("sombra", { respostas: r("Diz que está tudo bem e muda de assunto", "Visualiza e não responde", "Não reage, tanto faz", "Fico quieta e magoada") })!;
    expect(p.titulo).toBe("A Sombra da Apatia");
    expect(p.fato).toContain("nível 50");
    expect(p.fato).toContain("Tristeza, nível 75");
    expect(p.fato).toContain("linha dos 200");
    const pedido = pedidoDoQuiz("Templo", { tipo: "sombra", nome: "Ana", titulo: p.titulo, detalhe: p.detalhe, fato: p.fato, respostas: {} });
    expect(pedido).toContain("O Código da Sombra");
    expect(pedido).toContain("180");
    expect(pedido).toMatch(/não ciência/);
  });
});
