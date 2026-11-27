import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { VETOS_DE_CONTEUDO } from "@/lib/agent-engine/agent/inbound-turn";

import { baloesPelaChave } from "./como-pagar-pix";

describe("Pix pela chave: a chave num balão, o nome em outro (pedido do dono em 27/11/2026)", () => {
  it("instrução, chave sozinha, nome sozinho, comprovante", () => {
    const b = baloesPelaChave("R$ 130,00 (Abertura do Coração)", "69993677810", "Matheus Lobato", "Celular");
    expect(b).toHaveLength(4);
    expect(b[1]).toBe("69993677810");
    expect(b[2]).toBe("No nome de *Matheus Lobato*");
    expect(b[3]).toMatch(/comprovante/);
  });
});

describe("cobrança não deixa a agente muda (medido em 27/11/2026)", () => {
  it("cobrança recusada refaz o turno que terminou sem mensagem", () => {
    expect(VETOS_DE_CONTEUDO.has("cobranca_avulsa_indisponivel")).toBe(true);
    expect(VETOS_DE_CONTEUDO.has("cobranca_anunciada_sem_cobranca")).toBe(true);
  });

  it("o balão da cobrança cabe um acima do teto, nas duas checagens do envio", () => {
    // O turno não tem seam isolável (ver tests/unit/gate-vazamento-interno.test.ts): a asserção é sobre a fonte.
    const fonte = readFileSync(path.join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"), "utf8");
    expect(fonte).toMatch(/const tetoDoBalao = \(corpo: string\): number => maxSendsPerTurn \+ \(trazCobranca\(corpo\) \? 1 : 0\)/);
    expect(fonte.match(/if \(seq >= tetoDoBalao\(body\)\)/g)).toHaveLength(2);
  });
});
