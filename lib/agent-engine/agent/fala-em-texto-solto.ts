/**
 * A FALA EM TEXTO SOLTO — a resposta que o modelo escreveu e não enviou.
 *
 * O agente fala com a pessoa pela ferramenta `send_message`. Às vezes o modelo escreve a resposta
 * inteira como texto do turno e não aciona ferramenta nenhuma: o turno termina `ok`, com
 * `messages_sent: 0`, e a pessoa fica sem resposta. Medido em produção em 06/10/2026: a cliente
 * respondeu à leitura, o modelo gerou 338 tokens de resposta num passo só, e nada saiu.
 *
 * A regra é estreita de propósito:
 *   - só vale quando NADA foi enviado no turno;
 *   - só vale quando o modelo não acionou NENHUMA ferramenta. Quem acionou ferramenta (passou para uma
 *     pessoa, atualizou o funil, consultou o conhecimento) e não falou, escolheu não falar — e esse
 *     silêncio é respeitado;
 *   - o texto precisa existir.
 *
 * Quem envia é o MESMO `send_message` do turno, com a cadeia inteira de travas (opt-out, janela, piso de
 * preço, vocabulário interno, etapa da jornada, balões). Esta função só decide SE há o que enviar.
 */
export interface PassoDoTurno {
  toolCalls?: readonly unknown[] | null;
}

export interface ResultadoDoTurno {
  text?: string | null;
  steps?: readonly PassoDoTurno[] | null;
}

/** O texto a enviar, ou `null` quando o silêncio do turno deve ser respeitado. Pura. */
export function falaEmTextoSolto(resultado: ResultadoDoTurno, mensagensEnviadas: number): string | null {
  if (mensagensEnviadas > 0) return null;
  const acionouFerramenta = (resultado.steps ?? []).some((p) => (p.toolCalls?.length ?? 0) > 0);
  if (acionouFerramenta) return null;
  const texto = (resultado.text ?? "").trim();
  return texto === "" ? null : texto;
}
