/**
 * A guia lembra o que a pessoa viveu na área (`lib/agent-engine/agent/area-do-cliente-block.ts`): o bloco entra
 * no ritual de abertura do turno; vazio quando não há área; diário fora; teto de tamanho.
 */
import { describe, expect, it } from "vitest";

import { buildAreaDoClienteBlock, renderAreaDoContato, type AreaDoContato } from "@/lib/agent-engine/agent/area-do-cliente-block";
import { buildOpeningMessage } from "@/lib/agent-engine/agent/inbound-turn";

const vazia: AreaDoContato = { nascimento: null, foco: null, oQuePesa: null, leituras: [], mao: null, quizzes: [], sinastrias: [] };

describe("a guia lembra a área", () => {
  it("sem nada na área, o bloco é vazio (não custa token)", () => {
    expect(renderAreaDoContato(vazia)).toBe("");
  });

  it("⭐ lembra o céu, o foco, o que pesa, as cartas que saíram, a mão e as compras", () => {
    const b = renderAreaDoContato({
      nascimento: "1990-08-10",
      foco: "amor",
      oQuePesa: "ele sumiu depois da briga",
      leituras: [{ quando: "2026-10-30T22:00:00Z", modalidade: "tarot", pergunta: "Ele vai voltar?", cartas: [{ id: 17, nome: "A Estrela", posicao: "Agora", sentido: "" }] }],
      mao: { quando: "2026-11-01T10:00:00Z", paga: true, leitura: { sintese: "Coração intenso, cabeça prática." } },
      quizzes: [{ quando: "2026-10-20T10:00:00Z", tipo: "par" }],
      sinastrias: [{ quando: "2026-10-21T10:00:00Z", nomeDele: "Carlos" }],
    });
    expect(b).toContain("Sol em Leão");
    expect(b).toContain("Amor e relacionamento");
    expect(b).toContain('"ele sumiu depois da briga"');
    expect(b).toContain('30/10/2026, Mesa (tarot): perguntou "Ele vai voltar?" — saíram A Estrela.');
    expect(b).toContain("leitura da mão completa: Coração intenso, cabeça prática.");
    expect(b).toContain('comprou "O Retrato do Par"');
    expect(b).toContain("sinastria com Carlos");
    expect(b).toMatch(/não invente/);
  });

  it("a mão grátis não vaza o que ainda não foi pago", () => {
    const b = renderAreaDoContato({ ...vazia, mao: { quando: "2026-11-01T10:00:00Z", paga: false, leitura: { sintese: "SEGREDO PAGO" } } });
    expect(b).toContain("só a linha do coração, grátis");
    expect(b).not.toContain("SEGREDO PAGO");
  });

  it("tem teto: muitas leituras longas não estouram o bloco", () => {
    const leituras = Array.from({ length: 30 }, (_, i) => ({ quando: "2026-10-01T00:00:00Z", modalidade: "tarot", pergunta: "x".repeat(300) + i, cartas: [] }));
    const b = renderAreaDoContato({ ...vazia, leituras });
    expect(b.length).toBeLessThan(1800);
    expect(b).toContain("há mais na área");
  });

  it("falha do banco não derruba o turno: bloco vazio", async () => {
    const db = { query: async () => { throw new Error("banco fora"); } };
    expect(await buildAreaDoClienteBlock(db as never, "org", "contato")).toBe("");
  });

  it("⭐ o bloco entra na abertura do turno, depois da memória do lead", () => {
    const ctx = { contact: {}, messages: [], conversation_id: null } as never;
    const abertura = buildOpeningMessage(null, null, ctx, "—", false, [], "", "oi", "- Céu de nascimento: Sol em Leão.");
    expect(abertura).toContain("## O que ela já viveu na área do cliente (memória da guia)");
    expect(abertura.indexOf("## O que ela já viveu")).toBeGreaterThan(abertura.indexOf("## Memória do lead"));
    expect(buildOpeningMessage(null, null, ctx, "—", false, [], "", "oi")).not.toContain("O que ela já viveu");
  });
});
