/**
 * O TETO DA MEMÓRIA DA ORGANIZAÇÃO — quanto dela entra em CADA passo de CADA atendimento.
 *
 * Os aprendizados ativos entram inteiros no começo do prompt, e o prompt é relido a cada passo do
 * agente. Medido em produção em 10/10/2026: o agente tinha gravado 79 anotações em quinze dias
 * (70 mil caracteres), que sozinhas eram 44% do que ele lia — cerca de 19 mil tokens por passo, três
 * passos por resposta. Sem teto, o bloco cresce para sempre e leva junto o custo e o tempo de
 * resposta de todo atendimento.
 *
 * A regra de quem cabe:
 *   - o que uma PESSOA escreveu ou aprovou (origem `manual` ou `flywheel`) cabe sempre;
 *   - o que a IA anotou (origem `agent`) entra do mais recente para o mais antigo, até o teto.
 * A ordem em que os que cabem aparecem no prompt continua a de criação: o prefixo só muda quando a
 * lista muda.
 *
 * Pura e sem dependência de servidor: a tela de Memória usa a MESMA função para dizer quantos
 * aprendizados ficaram de fora.
 */

/** Cerca de 5,5 mil tokens em português. */
export const TETO_DE_CARACTERES_DOS_APRENDIZADOS = 20_000;

export interface AprendizadoParaMedir {
  id: string;
  title: string;
  body: string;
  /** `manual`, `flywheel` ou `agent`. Ausente conta como escrito por pessoa. */
  source?: string | null;
  created_at?: string | null;
}

const tamanho = (e: AprendizadoParaMedir): number => e.title.length + e.body.length;

/**
 * Quais aprendizados entram no prompt. Devolve os ids que cabem e quantos ficaram de fora.
 * `entries` em qualquer ordem; a decisão não depende dela.
 */
export function aprendizadosQueCabem(
  entries: readonly AprendizadoParaMedir[],
  teto: number = TETO_DE_CARACTERES_DOS_APRENDIZADOS,
): { dentro: Set<string>; fora: number } {
  const dentro = new Set<string>();
  let usado = 0;
  for (const e of entries) {
    if (e.source === "agent") continue;
    dentro.add(e.id);
    usado += tamanho(e);
  }
  const daIa = entries
    .filter((e) => e.source === "agent")
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "") || b.id.localeCompare(a.id));
  let fora = 0;
  let estourou = false;
  for (const e of daIa) {
    // Depois da primeira que não cabe, as mais antigas também ficam de fora: pular uma grande para
    // encaixar uma pequena mais velha faria a lista mudar de forma difícil de explicar na tela.
    if (!estourou && usado + tamanho(e) <= teto) {
      dentro.add(e.id);
      usado += tamanho(e);
    } else {
      estourou = true;
      fora += 1;
    }
  }
  return { dentro, fora };
}
