/**
 * A IA DA MESA DE LEITURAS — o emissor do ponto `area_leitura`.
 *
 * Passa por `runModelCall`, como o resto da área (`circulo-ia.ts`): mesma chave, mesmo teto de gasto, mesmo
 * registro em `llm_calls`. As regras de tom são as da área (`REGRAS_DE_TOM`) e mais duas, próprias da Mesa:
 * a leitura é automática, então nunca se apresenta como pessoa nem como ritual feito por alguém; e as cartas
 * já vêm sorteadas pelo código — a IA interpreta, não escolhe.
 */
import type pg from "pg";

import { runModelCall, type LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/run-model-call";

import { REGRAS_DE_TOM } from "./circulo-ia";
import { NOME_DA_MODALIDADE, type CartaDaLeitura, type Modalidade } from "./leituras";

export interface LeituraEscrita {
  /** Um texto por carta, na ordem das posições. */
  cartas: string[];
  sintese: string;
  passo: string;
}

export function pedidoDaLeitura(
  empresa: string,
  d: { modalidade: Modalidade; pergunta: string; cartas: readonly CartaDaLeitura[]; primeiroNome: string },
): string {
  const cartas = d.cartas.map((c, i) => `${i + 1}. Posição "${c.posicao}": ${c.nome}. Sentido de base: ${c.sentido}`).join("\n");
  return [
    `Você escreve uma leitura de ${NOME_DA_MODALIDADE[d.modalidade]} para uma cliente de ${empresa}${d.primeiroNome ? `, ${d.primeiroNome}` : ""}, nos métodos da casa.`,
    `A pergunta dela: """${d.pergunta.slice(0, 400)}"""`,
    `As três cartas já foram sorteadas, nesta ordem:\n${cartas}`,
    "Escreva, falando com ela (você), uma leitura profunda e acolhedora: para cada carta, o que ela diz SOBRE A PERGUNTA naquela posição (60 a 110 palavras cada); depois uma síntese que junta as três (até 120 palavras); e um passo pequeno e concreto que ela pode dar nos próximos dias (uma ou duas frases).",
    `Regras:\n- ${REGRAS_DE_TOM}\n- Esta leitura é automática: não diga que é uma pessoa, não fale de altar, vela acesa por você ou trabalho feito por alguém.\n- Use exatamente as cartas dadas; não troque, não acrescente cartas.\n- Use o nome dela no máximo uma vez.`,
    'Responda só com JSON, sem texto fora dele: {"cartas": ["…", "…", "…"], "sintese": "…", "passo": "…"}.',
  ].join("\n\n");
}

/** Lê o JSON da leitura; `null` se a resposta não servir. */
export function lerLeitura(texto: string): LeituraEscrita | null {
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  try {
    const j = JSON.parse(texto.slice(inicio, fim + 1)) as { cartas?: unknown; sintese?: unknown; passo?: unknown };
    if (!Array.isArray(j.cartas) || j.cartas.length !== 3 || !j.cartas.every((c) => typeof c === "string" && c.trim() !== "")) return null;
    if (typeof j.sintese !== "string" || typeof j.passo !== "string") return null;
    const cartas = (j.cartas as string[]).map((c) => c.trim().slice(0, 2000));
    const sintese = j.sintese.trim().slice(0, 2000);
    const passo = j.passo.trim().slice(0, 600);
    return sintese && passo ? { cartas, sintese, passo } : null;
  } catch {
    return null;
  }
}

export async function escreverLeitura(
  pool: pg.Pool,
  cfg: LlmEdgeConfig,
  d: {
    organizationId: string;
    contactId: string;
    empresa: string;
    modalidade: Modalidade;
    pergunta: string;
    cartas: readonly CartaDaLeitura[];
    primeiroNome: string;
  },
): Promise<{ leitura: LeituraEscrita; modelo: string | null } | null> {
  const chamada = await runModelCall(pool, cfg, {
    tenantId: d.organizationId,
    leadId: d.contactId,
    jobId: null,
    purpose: "area_leitura",
    messages: [{ role: "user", content: pedidoDaLeitura(d.empresa, d) }],
  });
  const leitura = lerLeitura(chamada.result.text ?? "");
  return leitura ? { leitura, modelo: chamada.model ?? null } : null;
}
