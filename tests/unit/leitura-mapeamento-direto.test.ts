import { describe, expect, it } from "vitest";
import { sortearCartas } from "@/lib/leitura/sorteio";
import { passoDaLeitura } from "@/lib/leitura/estado-da-leitura";
import { blocoDaLeitura } from "@/lib/leitura/bloco-do-prompt";
import { imagemDaLeitura } from "@/lib/leitura/imagens";

describe("Leitura de Tarot — Mapeamento Direto e Blindagem de Produção", () => {
  it("mapeia diretamente os números escolhidos para as cartas do baralho", () => {
    const cartas = sortearCartas("contato-123", [3, 6, 9]);
    expect(cartas[0].id).toBe(3);
    expect(cartas[0].nome).toBe("A Sacerdotisa");
    expect(cartas[1].id).toBe(6);
    expect(cartas[1].nome).toBe("O Hierofante");
    expect(cartas[2].id).toBe(9);
    expect(cartas[2].nome).toBe("A Força");
  });

  it("acumula números picados e resolve o passo da leitura com numeroEscolhido", () => {
    const historico = [
      { direction: "inbound", body: "Bom dia" },
      { direction: "outbound", body: "Bom dia! Salva meu contato. Vamos iniciar?" },
      { direction: "inbound", body: "vamos" },
      { direction: "outbound", body: "Passa seus dados..." },
      { direction: "inbound", body: "Magno, 19/11/1989, marinheiro" },
      { direction: "outbound", body: "Estou com as 22 cartas viradas pra baixo... escolhe 3 números de 1 a 22." },
      { direction: "inbound", body: "3" },
      { direction: "inbound", body: "6" },
      { direction: "inbound", body: "9" },
    ];

    const passo1 = passoDaLeitura("contato-123", historico);
    expect(passo1?.passo).toBe("revelar_carta");
    if (passo1?.passo === "revelar_carta") {
      expect(passo1.indice).toBe(1);
      expect(passo1.numeroEscolhido).toBe(3);
      expect(passo1.carta.id).toBe(3);
    }
  });

  it("reconhece a foto da carta mesmo com variações no marcador", () => {
    const passoMock = {
      passo: "revelar_carta" as const,
      indice: 1 as const,
      numeroEscolhido: 3,
      carta: { id: 3, nome: "A Sacerdotisa", simbolos: [], sentido: { geral: "", amor: "", dinheiro: "", saude: "" } },
      cartas: [] as any,
    };

    const img = imagemDaLeitura(
      "org-1",
      "CARTA 1: *A Sacerdotisa* (carta número 3 da mesa).\n\nOlha o véu...",
      passoMock,
      true,
    );
    expect(img?.caminho).toBe("org-1/leitura/cartas/03.jpg");
    expect(img?.tipo).toBe("carta");
  });
});
