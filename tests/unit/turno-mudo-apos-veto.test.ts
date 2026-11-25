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
    const i = FONTE.indexOf("vetoNestaOuEmTentativaAnterior !== null &&");
    expect(i).toBeGreaterThan(0);
    const bloco = FONTE.slice(i, i + 400);
    expect(bloco).toMatch(/!preview/);
    expect(bloco).toMatch(/outcomes\.length === 0/);
    expect(bloco).toMatch(/input\.inboundMessageId !== undefined/);
    expect(bloco).toMatch(/throw new Error\(/);
  });

  it("a checagem vem DEPOIS da fala em texto solto — que ainda pode mandar a resposta", () => {
    expect(FONTE.indexOf("vetoNestaOuEmTentativaAnterior !== null &&")).toBeGreaterThan(
      FONTE.indexOf("a fala em texto solto foi vetada pela cadeia de envio"),
    );
  });
});

describe("veto numa tentativa anterior do mesmo job (Obede, 20/11/2026)", () => {
  it("a nova tentativa muda também é refeita — antes ela terminava ok", () => {
    expect(FONTE).toMatch(
      /vetoNestaOuEmTentativaAnterior =\s*vetoDeConteudo \?\? \(preview \? null : vetoDeTentativaAnterior\(liveJob\(\)\.last_error\)\)/,
    );
  });
  it("e a checagem vem ANTES do checkpoint: a fala vetada não entra no resumo como dita", () => {
    expect(FONTE.indexOf("vetoNestaOuEmTentativaAnterior !== null &&")).toBeLessThan(
      FONTE.indexOf("await insertCheckpoint(pool"),
    );
  });
});

describe("recusa das travas de dentro do envio também refaz o turno mudo (Obede, 20/11/2026)", () => {
  it("valor errado, link copiado e oferta em conflito são vetos de conteúdo", () => {
    for (const code of ["valor_do_extra_errado", "link_de_cobranca_copiado", "oferta_em_conflito", "link_fora_do_valor"]) {
      expect(VETOS_DE_CONTEUDO.has(code)).toBe(true);
    }
    // Falha do provedor não é conteúdo: reescrever não resolve.
    expect(VETOS_DE_CONTEUDO.has("cobranca_indisponivel")).toBe(false);
  });
  it("a ferramenta de envio do run passa pelo marcador antes do breaker", () => {
    expect(FONTE).toMatch(/wrapToolsWithBreaker\(comRecusaDoEnvioMarcada\(previewTools/);
  });
  it("⭐ 25/11/2026: link copiado e fala do pagamento leem o texto da agente, guardado antes de QUALQUER troca de marca", () => {
    // O Pix da entrada e a chave da empresa trocam a marca bem antes das travas: o link de cartão novo era lido como cópia.
    expect(FONTE).toContain("linkDeCobrancaCopiado(corpoDaAgente, agentConfig)");
    expect(FONTE).toContain("falaErradaDoPagamento(corpoDaAgente, [");
    const guardado = FONTE.indexOf("const corpoDaAgente = body;");
    expect(guardado).toBeGreaterThan(-1);
    for (const troca of ["pixPelaChaveNoLugarDaMarca({", "await pixDaEntradaNoLugarDaMarca({", "await pixDoRestanteNoLugarDaMarca({", "await pixDoExtraNoLugarDaMarca({"]) {
      expect(guardado).toBeLessThan(FONTE.indexOf(troca));
    }
  });
});
