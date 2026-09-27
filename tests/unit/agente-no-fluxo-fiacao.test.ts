import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { READ_ONLY_TOOLS } from "@/lib/agent-engine/agent/tool-breaker";

/**
 * A FIAÇÃO do agente no comando de um fluxo dentro do turno de produção (`inbound-turn.ts`).
 *
 * O que estes testes leem do CÓDIGO-FONTE, e por quê: o arquivo tem milhares de linhas e roda por dentro de uma
 * fila, então o que decide se um agente NO COMANDO se comporta certo — quando a ferramenta existe, em que
 * momento o turno é contado, quem fica de fora — é a POSIÇÃO de poucas linhas. O comportamento das peças
 * (bloco, contagem, saída) é provado em `lib/followup/agente-no-fluxo.test.ts` e, contra um Postgres de verdade,
 * em `tests/invariants/agente-no-fluxo-runtime.test.ts`. Aqui só a costura.
 */

const turno = readFileSync("lib/agent-engine/agent/inbound-turn.ts", "utf8");

/** O trecho entre dois marcadores (o primeiro depois do início), para afirmar ordem sem depender de número de linha. */
function entre(inicio: string, fim: string): string {
  const i = turno.indexOf(inicio);
  expect(i, `marcador não achado: ${inicio}`).toBeGreaterThanOrEqual(0);
  const j = turno.indexOf(fim, i + inicio.length);
  expect(j, `marcador não achado depois de "${inicio}": ${fim}`).toBeGreaterThan(i);
  return turno.slice(i, j);
}

describe("o estado do agente do fluxo só é carregado quando faz sentido", () => {
  const carga = entre("let agenteDoFluxo: EstadoDoAgenteNoFluxo | null = null;", "const blocoDoFluxoDoTurno");

  it("só no turno de RESPOSTA à pessoa, nunca no painel de Teste, e só se o resolvedor escolheu o agente do fluxo", () => {
    expect(carga).toContain("!preview");
    expect(carga).toContain("liveJob().kind === 'inbound_turn'");
    expect(carga).toContain("routed.outcome === 'fluxo'");
  });

  it("falha de leitura vira 'ninguém no comando': o turno segue, com aviso", () => {
    expect(carga).toContain("catch (err)");
    expect(carga).toContain("runLog.warn(");
    expect(carga).not.toContain("throw");
  });
});

describe("a ferramenta concluir_etapa", () => {
  const registro = entre("if (agenteDoFluxo !== null) {\n    const estadoDoFluxo = agenteDoFluxo;", "// Fase 2 (Task 6): read_skill_reference");

  it("só existe quando há agente no comando, e usa a inscrição do closure — nunca um id vindo do modelo", () => {
    expect(registro).toContain("rawTools.concluir_etapa = tool(");
    expect(registro).toContain("estado: estadoDoFluxo");
    expect(registro).toContain("saida: AGENT_CONCLUDED_BRANCH_ID");
    // o único campo que o modelo controla é o resumo
    expect(registro).toContain("typeof raw?.resumo === 'string'");
    expect(registro).not.toMatch(/raw\??\.(enrollment|enrollment_id|contact|contact_id|org|organization_id|node|saida)/);
  });

  it("é MUTANTE: não está em READ_ONLY_TOOLS (o breaker a trata como escrita, e não como leitura repetível)", () => {
    expect((READ_ONLY_TOOLS as readonly string[]).includes("concluir_etapa")).toBe(false);
    // e a ferramenta existe de verdade no turno (senão a asserção acima seria vazia)
    expect(turno).toContain("concluir_etapa: {");
  });

  it("uma segunda saída não é erro: quem chega depois recebe 'etapa já encerrada'", () => {
    expect(registro).toContain("'etapa_ja_encerrada'");
    expect(registro).toContain("'etapa_concluida'");
  });
});

describe("a contagem do turno e o limite", () => {
  const contagem = entre("if (agenteDoFluxo !== null) {\n      try {", "// ROTEIRO: a pergunta pendente é compromisso.");

  it("conta pela mensagem que motivou o turno (idempotente por retry) e só sai por limite quando o turno é NOVO", () => {
    expect(contagem).toContain("chave: input.inboundMessageId ?? liveJob().id");
    expect(contagem).toContain("contado.novo && limiteAtingido(");
    expect(contagem).toContain("saida: AGENT_LIMIT_BRANCH_ID");
  });

  it("nunca derruba o turno: a resposta já saiu, e falha aqui só atrasa a saída (o relógio de silêncio a pega)", () => {
    expect(contagem).toContain("catch (err)");
    expect(contagem).not.toContain("throw");
  });

  it("vem DEPOIS de o envio ter dado certo: um envio marcado como failed relança o run antes de contar", () => {
    const iFalha = turno.indexOf("envio marcado como failed pelo CRM");
    const iContagem = turno.indexOf("if (agenteDoFluxo !== null) {\n      try {");
    expect(iFalha).toBeGreaterThan(0);
    expect(iContagem).toBeGreaterThan(iFalha);
  });
});

describe("o bloco", () => {
  it("entra na fila pela chave `fluxo`, alimentada por `blocoDoFluxoDoTurno`", () => {
    expect(turno).toContain("fluxo: blocoDoFluxoDoTurno,");
    expect(turno).toContain("const blocoDoFluxoDoTurno = blocoDoFluxo(agenteDoFluxo);");
  });
});
