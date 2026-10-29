/**
 * O TAMANHO MÁXIMO das instruções de um agente — um número só, lido pela tela e pelo servidor.
 *
 * Era 20.000, escrito à mão em cinco lugares (a validação, três pontos da tela e a frase do
 * aviso). Medido em produção (07/10/2026): o roteiro publicado de um agente tinha 32.399
 * caracteres, gravado por fora da tela, e por isso ninguém conseguia editá-lo e salvar — a
 * tela recusava um texto que já estava no ar.
 *
 * Subiu para 120.000 em 29/10/2026 pelo mesmo motivo: o roteiro publicado de um agente tinha
 * 80.039 caracteres, gravado por fora, e nem a tela nem a API aceitavam a versão seguinte.
 *
 * 120.000 caracteres são cerca de 34 mil tokens de instrução. O custo é de quem escreve: o
 * roteiro inteiro vai em todo turno, e o contador de tokens ao lado do campo mostra isso.
 *
 * Sem dependência nenhuma, de propósito: este arquivo é importado pelo componente da tela.
 */
export const MAX_CARACTERES_DO_ROTEIRO = 120_000;
