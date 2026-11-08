import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { VETOS_DE_CONTEUDO } from "@/lib/agent-engine/agent/inbound-turn";

/**
 * Caso de produção (08/11/2026): o cliente disse quanto pagaria ("40 a 50"), a resposta com a chave
 * Pix foi barrada pela trava de promessa, o modelo não reescreveu e o turno terminou sem nada
 * enviado — o cliente ficou esperando a chave. Turno mudo depois de veto de conteúdo é refeito.
 */
const FONTE = fs.readFileSync(
  path.join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"),
  "utf8",
);

describe("turno mudo depois de veto de conteúdo", () => {
  it("vetos que reescrever resolve entram; os de silêncio correto ficam de fora", () => {
    for (const code of ["promise_semantic", "promise_out_of_table", "internal_vocabulary_leak"]) {
      expect(VETOS_DE_CONTEUDO.has(code)).toBe(true);
    }
    // Refazer o turno nesses só repetiria o veto: o silêncio ali é a resposta certa.
    for (const code of ["contato_bloqueado", "warmup_cap", "daily_cap", "mass_identical"]) {
      expect(VETOS_DE_CONTEUDO.has(code)).toBe(false);
    }
  });

  it("o veto do send_message marca o turno", () => {
    expect(FONTE).toMatch(/if \(VETOS_DE_CONTEUDO\.has\(chain\.code\)\) vetoDeConteudo = chain\.code;/);
  });

  it("nada enviado + veto de conteúdo + mensagem do cliente = o run é refeito pela fila", () => {
    const i = FONTE.indexOf("vetoDeConteudo !== null &&");
    expect(i).toBeGreaterThan(0);
    const bloco = FONTE.slice(i, i + 400);
    expect(bloco).toMatch(/!preview/);
    expect(bloco).toMatch(/outcomes\.length === 0/);
    expect(bloco).toMatch(/input\.inboundMessageId !== undefined/);
    expect(bloco).toMatch(/throw new Error\(/);
  });

  it("a checagem vem DEPOIS da fala em texto solto — que ainda pode mandar a resposta", () => {
    expect(FONTE.indexOf("vetoDeConteudo !== null &&")).toBeGreaterThan(
      FONTE.indexOf("a fala em texto solto foi vetada pela cadeia de envio"),
    );
  });
});
