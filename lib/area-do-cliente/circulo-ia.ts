/**
 * A IA do Círculo — o EMISSOR dos pontos `area_circulo_conteudo` (o conteúdo do
 * mês) e `area_circulo_resposta` (a resposta à pergunta do mês).
 *
 * Passa por `runModelCall`: mesma chave (da empresa ou da plataforma), mesmo
 * teto de gasto e mesmo registro em `llm_calls` de qualquer outra chamada.
 *
 * As regras de tom moram AQUI, no pedido, e não no roteiro do agente: quem lê
 * este texto já pagou e está numa página só dela, sem ninguém da equipe olhando
 * antes. Orientação, nunca promessa — sem resultado garantido, sem prazo, sem
 * cura, sem medo, sem pedir dinheiro e sem oferecer produto.
 */
import type pg from "pg";

import { runModelCall, type LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/run-model-call";
import { BARALHO, type Carta } from "@/lib/leitura/baralho";

export const REGRAS_DE_TOM = [
  "Escreva em português do Brasil, com acolhimento e simplicidade.",
  "É orientação e reflexão, nunca previsão certa: não prometa resultado, não dê prazo, não fale em cura.",
  "Não use medo, ameaça, \"energia bloqueada\", \"trabalho feito\" nem urgência.",
  "Não peça dinheiro, não ofereça produto, serviço, desconto ou link.",
  "Não dê diagnóstico nem conselho médico, jurídico ou financeiro; se o assunto for esse, sugira procurar um profissional.",
].join("\n- ");

export function pedidoDoConteudo(empresa: string, mes: string): string {
  return [
    `Você escreve o conteúdo mensal do "Círculo", o espaço de assinantes de ${empresa}.`,
    `Mês: ${mes}.`,
    "Escreva três partes curtas: (1) a energia do mês, (2) um ritual simples para fazer em casa, em passos numerados, com itens comuns, e (3) uma reflexão para o diário.",
    `Regras:\n- ${REGRAS_DE_TOM}`,
    "Até 450 palavras no total.",
    'Responda só com JSON, sem texto fora dele: {"titulo": "…", "texto": "…"}. No "texto", separe as partes com uma linha em branco.',
  ].join("\n\n");
}

export function pedidoDaResposta(empresa: string, pergunta: string, carta: Carta): string {
  return [
    `Você é a taróloga de ${empresa}. Uma assinante do Círculo fez a pergunta do mês.`,
    `Pergunta: """${pergunta.slice(0, 600)}"""`,
    `A carta tirada para ela foi ${carta.nome} (símbolos: ${carta.simbolos.join(", ")}). Sentido geral: ${carta.sentido.geral}`,
    "Responda a ela em até 180 palavras: diga qual carta saiu, o que ela sugere para a pergunta e um pequeno passo que ela pode dar.",
    `Regras:\n- ${REGRAS_DE_TOM}`,
    "Responda só com o texto da resposta, sem título.",
  ].join("\n\n");
}

/** Lê o JSON do conteúdo; `null` se a resposta não servir. */
export function lerConteudo(texto: string): { titulo: string; texto: string } | null {
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  try {
    const j = JSON.parse(texto.slice(inicio, fim + 1)) as { titulo?: unknown; texto?: unknown };
    if (typeof j.titulo !== "string" || typeof j.texto !== "string") return null;
    const titulo = j.titulo.trim().slice(0, 120);
    const corpo = j.texto.trim().slice(0, 8000);
    return titulo && corpo ? { titulo, texto: corpo } : null;
  } catch {
    return null;
  }
}

/** A carta da pergunta: sorteio de verdade, feito pelo código e não pela IA. */
export function cartaDaPergunta(aleatorio: () => number = Math.random): Carta {
  return BARALHO[Math.floor(aleatorio() * BARALHO.length)] as Carta;
}

export async function gerarConteudoDoMes(
  pool: pg.Pool,
  cfg: LlmEdgeConfig,
  d: { organizationId: string; empresa: string; mes: string },
): Promise<{ titulo: string; texto: string; modelo: string | null } | null> {
  const chamada = await runModelCall(pool, cfg, {
    tenantId: d.organizationId,
    leadId: null,
    jobId: null,
    purpose: "area_circulo_conteudo",
    messages: [{ role: "user", content: pedidoDoConteudo(d.empresa, d.mes) }],
  });
  const lido = lerConteudo(chamada.result.text ?? "");
  return lido ? { ...lido, modelo: chamada.model ?? null } : null;
}

export async function responderPergunta(
  pool: pg.Pool,
  cfg: LlmEdgeConfig,
  d: { organizationId: string; contactId: string; empresa: string; pergunta: string; carta: Carta },
): Promise<string | null> {
  const chamada = await runModelCall(pool, cfg, {
    tenantId: d.organizationId,
    leadId: d.contactId,
    jobId: null,
    purpose: "area_circulo_resposta",
    messages: [{ role: "user", content: pedidoDaResposta(d.empresa, d.pergunta, d.carta) }],
  });
  const texto = (chamada.result.text ?? "").trim();
  return texto ? texto.slice(0, 4000) : null;
}
