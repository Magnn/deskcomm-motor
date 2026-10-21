import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { recusouMarketing } from "@/lib/campanhas/elegibilidade";
import {
  MARCA_DE_ENCERRAMENTO,
  blocoDoEncerramento,
  semAMarcaDeEncerramento,
  temMarcaDeEncerramento,
} from "@/lib/contacts/encerrar-acompanhamento";

/**
 * Quem pede para parar o acompanhamento não recebe mais oferta: a agente marca a despedida, o envio tira
 * a marca e grava `consent.marketing.declined_at` — a recusa que campanhas e automações já respeitam —,
 * e o turno deixa de montar o pós-venda para quem a tem. (A gravação no banco é provada em
 * `tests/invariants/encerrar-acompanhamento.test.ts`.)
 */

describe("a marca", () => {
  it("sai do texto sem deixar bolha vazia nem espaço sobrando", () => {
    const corpo = `Respeito a sua decisão, meu bem.\n\nA porta fica aberta. Fica com Deus.\n\n${MARCA_DE_ENCERRAMENTO}`;
    expect(temMarcaDeEncerramento(corpo)).toBe(true);
    expect(semAMarcaDeEncerramento(corpo)).toBe("Respeito a sua decisão, meu bem.\n\nA porta fica aberta. Fica com Deus.");
    expect(semAMarcaDeEncerramento(`Fica com Deus. ${MARCA_DE_ENCERRAMENTO}`)).toBe("Fica com Deus.");
  });

  it("texto sem a marca não muda", () => {
    expect(temMarcaDeEncerramento("Oi!")).toBe(false);
    expect(semAMarcaDeEncerramento("Oi!")).toBe("Oi!");
  });
});

describe("o bloco", () => {
  it("ensina quando usar e, com exemplo, quando NÃO usar (a história dela não é o atendimento)", () => {
    const b = blocoDoEncerramento();
    expect(b).toContain(MARCA_DE_ENCERRAMENTO);
    expect(b).toContain("não quero mais continuar");
    expect(b).toContain("não quero mais saber dele");
    expect(b).toContain("NÃO use a marca");
  });
});

describe("a recusa gravada é a que o produto já respeita", () => {
  it("campanha exclui quem tem declined_at — o mesmo campo que a marca grava", () => {
    expect(recusouMarketing({ marketing: { declined_at: "2026-10-17T18:00:00.000Z", declined_source: "conversa" } })).toBe(true);
    expect(recusouMarketing({})).toBe(false);
  });

  it("o turno não monta pós-venda para quem recusou, e o bloco da marca só entra para quem não recusou", () => {
    const fonte = readFileSync(join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"), "utf8");
    expect(fonte).toMatch(/consent->'marketing'->>'declined_at' as recusou/);
    // `pagouNoTurno` = `pagouAlgo(tags)`: quem pagou o principal OU uma cobrança avulsa (#391).
    expect(fonte).toMatch(/if \(!preview && temPosVenda && pagouNoTurno && !recusouOfertasNoTurno\)/);
    expect(fonte).toMatch(/includes\('pago'\) && !recusouOfertasNoTurno\) \{\s*blocoDaEntrega \+= blocoDoEncerramento\(\);/);
    // Falha de leitura vira NÃO oferecer.
    expect(fonte).toMatch(/catch \{\s*\/\/ Na dúvida, NÃO oferece[^\n]*\n\s*recusouOfertasNoTurno = true;/);
  });
});
