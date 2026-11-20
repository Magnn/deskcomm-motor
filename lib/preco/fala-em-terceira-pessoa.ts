/**
 * A AGENTE NARRANDO A PRÓPRIA INSTRUÇÃO. Em 19–20/11/2026 a Cigana escreveu, para a própria pessoa:
 * "Ele perguntou o valor, então vem na primeira frase, Angelo: …", "Ele perguntou o valor, Paulinho." e
 * "Ela perguntou o que pode ser feito, Larissa." — o raciocínio do modelo (quem perguntou o quê, o que a regra
 * manda) saiu no balão, falando da pessoa em terceira pessoa. Soa robô e quebra a confiança na hora do preço.
 *
 * Só barra o que a PESSOA pergunta à agente (valor, como pagar, o que pode ser feito): "Ele perguntou o que
 * falaram dele pra você, Fabiana" fala do ex dela e passa.
 */
const NARRACAO =
  /(?:^|[.!?\n]\s*)(?:ele|ela)\s+(?:perguntou|pediu|quer\s+saber|t[áa]\s+perguntando)\s+(?:o\s+valor|o\s+pre[çc]o|quanto|como\s+(?:paga|pagar|funciona|[ée]\s+feito)|o\s+que\s+(?:pode\s+ser\s+feito|d[áa]\s+pra\s+fazer))/i;
const REGRA_NO_BALAO = /\bvem\s+na\s+primeira\s+frase\b|\bna\s+primeira\s+frase\s*[,:]/i;

/** A recusa (texto para a agente) quando o balão narra a pessoa em terceira pessoa; senão null. */
export function falaEmTerceiraPessoa(corpo: string): string | null {
  if (!NARRACAO.test(corpo) && !REGRA_NO_BALAO.test(corpo)) return null;
  return (
    "Sua mensagem falou da pessoa em terceira pessoa (\"ele perguntou…\", \"ela perguntou…\") ou repetiu a regra que você " +
    "segue (\"vem na primeira frase\"). Ela está lendo. Reescreva falando direto com ela, em segunda pessoa, sem narrar o " +
    "que ela perguntou nem o que a regra manda: se ela perguntou o valor, a primeira frase já É o valor."
  );
}
