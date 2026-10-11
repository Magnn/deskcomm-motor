/**
 * OS PASSOS DE UMA CHAMADA — o que cada volta do laço de ferramentas fez, em números.
 *
 * `llm_calls` grava UMA linha por chamada, com os tokens de todos os passos somados. Com isso não dá
 * para responder a pergunta que decide custo e latência do turno: o passo depois do envio faz alguma
 * coisa, ou só relê o contexto inteiro para encerrar? Medido em 11/10/2026: ~104 mil tokens lidos por
 * resposta, e nenhum registro de quantos passos nem de qual deles chamou o quê.
 *
 * Aqui sai o resumo que vai para o log da chamada concluída. Só métrica e NOME de ferramenta — nunca o
 * texto do modelo, nunca argumento de ferramenta (é onde mora dado do cliente).
 */
export interface PassoParaResumir {
  toolCalls?: ReadonlyArray<{ toolName?: unknown }> | undefined;
  text?: unknown;
  usage?: { inputTokens?: unknown; outputTokens?: unknown } | undefined;
  finishReason?: unknown;
}

export interface ResumoDoPasso {
  /** Nomes das ferramentas chamadas neste passo, na ordem. */
  ferramentas: string[];
  entrada: number;
  saida: number;
  /** Tamanho do texto solto do passo, em caracteres. Zero = o passo só chamou ferramenta (ou nada). */
  texto: number;
  fim: string;
}

/** Teto de passos resumidos por chamada: o log não cresce com um laço que se perdeu. */
export const MAXIMO_DE_PASSOS_NO_LOG = 12;

const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function resumoDosPassos(passos: ReadonlyArray<PassoParaResumir> | null | undefined): ResumoDoPasso[] {
  return (passos ?? []).slice(0, MAXIMO_DE_PASSOS_NO_LOG).map((p) => ({
    ferramentas: (p.toolCalls ?? [])
      .map((c) => c.toolName)
      .filter((n): n is string => typeof n === "string" && n !== ""),
    entrada: numero(p.usage?.inputTokens),
    saida: numero(p.usage?.outputTokens),
    texto: typeof p.text === "string" ? p.text.length : 0,
    fim: typeof p.finishReason === "string" ? p.finishReason : "",
  }));
}
