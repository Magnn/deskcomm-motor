/**
 * O AGENTE NÃO REENVIA O MESMO BALÃO.
 *
 * ─── O caso ───────────────────────────────────────────────────────────────────────────
 * Medido em produção em 11/10/2026: três vezes em seis horas a pessoa recebeu de novo, palavra
 * por palavra, balões que tinha acabado de receber. Em duas, a retomada de silêncio (três minutos
 * sem resposta) refez a etapa inteira que o turno anterior já tinha enviado; na terceira, o mesmo
 * balão saiu duas vezes dentro da mesma resposta. Texto idêntico repetido é o sinal mais claro de
 * automação que uma conversa pode dar.
 *
 * ─── A regra ──────────────────────────────────────────────────────────────────────────
 * Antes de enviar, os balões do corpo são comparados com o que a conversa já recebeu de nós na
 * última hora. Balão igual sai do envio; os outros seguem. Se não sobrar nada, a ferramenta devolve
 * um erro de ensino, e o modelo escreve algo novo.
 *
 * Balão curto ("Sim, meu bem.", um link, uma saudação) NÃO entra na comparação: repetir uma frase
 * curta é conversa normal, e link de pagamento reenviado a pedido é função do produto.
 *
 * Puro. Quem lê o histórico é o turno.
 */

/** Abaixo disto o balão não é comparado. */
export const TAMANHO_MINIMO_DO_BALAO_COMPARADO = 60;

/** Minúsculas, sem acento, sem pontuação e com espaços colapsados: "igual" para quem lê. */
export function chaveDoBalao(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function comparavel(balao: string): boolean {
  const t = balao.trim();
  return t.length >= TAMANHO_MINIMO_DO_BALAO_COMPARADO && !/https?:\/\//i.test(t);
}

export interface CorpoSemRepeticao {
  /** O corpo que segue para o envio (pode ser vazio). */
  corpo: string;
  /** Quantos balões saíram por já terem sido enviados. */
  retirados: number;
}

/**
 * Tira do corpo os balões que a conversa já recebeu — e os que se repetem dentro do próprio corpo.
 * `jaEnviados` são os textos das mensagens que já saíram para esta conversa (cada mensagem é um balão).
 */
export function semBaloesJaEnviados(corpo: string, jaEnviados: readonly string[]): CorpoSemRepeticao {
  const vistos = new Set<string>();
  for (const anterior of jaEnviados) {
    for (const b of anterior.split(/\n{2,}/)) if (comparavel(b)) vistos.add(chaveDoBalao(b));
  }
  const ficam: string[] = [];
  let retirados = 0;
  for (const balao of corpo.split(/\n{2,}/)) {
    if (balao.trim() === '') continue;
    if (!comparavel(balao)) {
      ficam.push(balao);
      continue;
    }
    const chave = chaveDoBalao(balao);
    if (vistos.has(chave)) {
      retirados += 1;
      continue;
    }
    vistos.add(chave);
    ficam.push(balao);
  }
  return { corpo: ficam.join('\n\n'), retirados };
}

export const ERRO_DE_TEXTO_JA_ENVIADO = {
  ok: false as const,
  error: {
    code: 'texto_ja_enviado',
    message:
      'Você já enviou exatamente este texto nesta conversa há pouco. NÃO repita. Se a pessoa não respondeu, ' +
      'escreva UMA mensagem curta e nova (uma pergunta simples sobre o que ela achou); se respondeu, responda ao que ela disse.',
  },
};
