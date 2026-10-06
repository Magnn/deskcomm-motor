/**
 * A NOTA DE SENTIMENTO PEDIDA COMO TEXTO — a reserva de quando o modelo não devolve objeto.
 *
 * `generateObject` depende de o provedor suportar saída estruturada (modo ferramenta ou JSON com esquema).
 * Medido em produção em 05/10/2026: com o modelo de linguagem da organização num provedor
 * OpenAI-compatível sem esse suporte, TODA classificação falhava — 351 em 24 horas, entre
 * "No object generated: the model did not return a response" e "could not parse the response" — e o
 * clima da conversa nunca era medido, com o painel dizendo que estava configurado.
 *
 * Aqui a pergunta é a mesma, a resposta é texto, e quem acha o número é o código: aceita o JSON pedido,
 * JSON com cerca de código ou prosa em volta, e por último um número solto entre 0 e 1. Fora disso,
 * `null` — nunca um palpite.
 */
import { generateText, type LanguageModel } from "ai";

export const INSTRUCAO_DA_NOTA_POR_TEXTO =
  'Responda SOMENTE com um JSON nesta forma, sem mais nada: {"sentiment_score": <número de 0 a 1>}';

const valida = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

/** A nota (0–1) que o texto do modelo carrega, ou `null` se não houver uma utilizável. Pura. */
export function notaDoTexto(texto: string): number | null {
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio !== -1 && fim > inicio) {
    try {
      const nota = (JSON.parse(texto.slice(inicio, fim + 1)) as { sentiment_score?: unknown }).sentiment_score;
      if (valida(nota)) return nota;
      if (typeof nota === "string" && valida(Number(nota.replace(",", ".")))) return Number(nota.replace(",", "."));
    } catch {
      // JSON cortado ou malformado: tenta o número pelo rótulo, abaixo.
    }
  }
  const rotulado = /sentiment_score["'\s:]{0,6}([01](?:[.,]\d+)?)/i.exec(texto);
  if (rotulado) {
    const nota = Number(rotulado[1]!.replace(",", "."));
    if (valida(nota)) return nota;
  }
  // Só o número, e mais nada (o modelo que ignorou o pedido de JSON e respondeu "0.3").
  const solto = /^\s*([01](?:[.,]\d+)?)\s*$/.exec(texto);
  if (solto) {
    const nota = Number(solto[1]!.replace(",", "."));
    if (valida(nota)) return nota;
  }
  return null;
}

export interface NotaPorTexto {
  score: number;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Pergunta a nota como texto. Lança quando o modelo responde algo sem nota utilizável — quem chama
 * registra a falha como já registrava a do caminho estruturado.
 */
export async function classificarPorTexto(
  model: LanguageModel,
  system: string,
  mensagem: string,
  opcoes: { timeoutMs: number },
): Promise<NotaPorTexto> {
  const aborto = new AbortController();
  const relogio = setTimeout(() => aborto.abort(), opcoes.timeoutMs);
  try {
    const r = await generateText({
      model,
      system: `${system}\n\n${INSTRUCAO_DA_NOTA_POR_TEXTO}`,
      prompt: mensagem,
      temperature: 0,
      // Folga para o modelo que raciocina antes de responder: com o teto curto do caminho
      // estruturado, o raciocínio consumia tudo e a resposta vinha vazia.
      maxOutputTokens: 1024,
      abortSignal: aborto.signal,
    });
    const nota = notaDoTexto(r.text);
    if (nota === null) throw new Error("a resposta em texto não trouxe uma nota de 0 a 1");
    const uso = r.usage as { inputTokens?: number; outputTokens?: number } | undefined;
    return { score: nota, promptTokens: uso?.inputTokens ?? 0, completionTokens: uso?.outputTokens ?? 0 };
  } finally {
    clearTimeout(relogio);
  }
}
