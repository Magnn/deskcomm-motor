/**
 * A CONFIRMAÇÃO CURTA — a pessoa respondeu só "ok", "👍", "tá bom" ou uma figurinha.
 *
 * ─── O que se via em produção ─────────────────────────────────────────────────────────
 * Medido em 12/10/2026: em um dia, 132 vezes (59 conversas) o agente respondeu a uma confirmação curta com
 * mais de 200 caracteres. Uma cliente que já tinha comprado recebeu a mesma instrução ("5ª vela, entre 22h e
 * 23h, vela branca nova") três vezes em seis minutos, uma a cada "👍", e escreveu: "Essas mensagens são
 * automáticas. Repetidas e iguais!". O corte de balão repetido (`balao-ja-enviado.ts`) só pega texto idêntico;
 * aqui o texto muda e o conteúdo é o mesmo.
 *
 * ─── A régua ──────────────────────────────────────────────────────────────────────────
 * Tudo o que a pessoa escreveu depois da última fala do agente é confirmação: palavra de concordância ou
 * agradecimento, emoji, figurinha ou reação — curto, sem número e sem pergunta. Número fica de fora porque
 * é escolha (as cartas, um valor, um dia); pergunta fica de fora porque pede resposta.
 *
 * O bloco NÃO manda calar: "sim" também é a resposta a uma oferta, e aí o próximo passo é a cobrança. Ele
 * proíbe repetir o que já foi dito. Quem chama deixa o bloco de fora no meio de uma sequência que o código
 * conduz (a leitura), onde "sim" é o gatilho do passo seguinte.
 *
 * Tudo aqui é puro.
 */
export interface MensagemDaConversa {
  direction: string;
  body: string | null | undefined;
}

const CONFIRMACAO = new RegExp(
  '^(?:' +
    [
      'ok(?:ay)?', 'okey', 't[áa]', 't[áa]\\s+(?:bom|certo|[óo]timo|bem|ok)', 'certo', 'sim', 'isso', 'blz', 'beleza', 'combinado',
      'entendi', 'pode\\s+ser', 'am[ée]m', 'obrigad[oa]', 'muito\\s+obrigad[oa]', 'valeu', 'gratid[ãa]o', 'vou\\s+fazer', 'fa[çc]o\\s+sim',
      'assim\\s+seja', 'deus\\s+(?:te\\s+)?aben[çc]oe', 'at[ée]\\s+(?:logo|mais|amanh[ãa])', 'boa\\s+noite', 'bom\\s+dia', 'boa\\s+tarde',
    ].join('|') +
    ')$',
  'i',
);
const MARCADOR_DE_MIDIA_CURTA = /^\[(?:sticker|reaction|figurinha|rea[çc][ãa]o)[^\]]*\]$/i;
const LETRAS = /[\p{L}\p{N}]/u;

/** Uma mensagem que só confirma: palavra de concordância, emoji sozinho, figurinha ou reação. Pura. */
export function ehConfirmacaoCurta(corpo: string | null | undefined): boolean {
  const texto = (corpo ?? '').trim();
  if (texto === '' || texto.length > 40) return false;
  if (MARCADOR_DE_MIDIA_CURTA.test(texto)) return true;
  if (/[?\d]/.test(texto)) return false;
  // Só emoji e pontuação: 👍, 🙏🏻, ❤️.
  if (!LETRAS.test(texto)) return true;
  const semEnfeite = texto
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return CONFIRMACAO.test(semEnfeite);
}

/** A rodada inteira da pessoa (o que ela escreveu depois da última fala do agente) é só confirmação. */
export function rodadaSoDeConfirmacao(mensagens: readonly MensagemDaConversa[]): boolean {
  const rodada: MensagemDaConversa[] = [];
  for (let i = mensagens.length - 1; i >= 0 && mensagens[i]!.direction === 'inbound'; i--) rodada.push(mensagens[i]!);
  // Sem fala anterior do agente não há o que repetir: é a primeira mensagem da conversa.
  if (rodada.length === 0 || rodada.length === mensagens.length) return false;
  return rodada.every((m) => ehConfirmacaoCurta(m.body));
}

/** O bloco do turno em que a pessoa só confirmou. '' quando não é o caso. */
export function blocoDaConfirmacaoCurta(soConfirmou: boolean): string {
  if (!soConfirmou) return '';
  return [
    '',
    '',
    'A PESSOA SÓ CONFIRMOU ("ok", "sim", "👍", figurinha) — vale só para este turno',
    '- É PROIBIDO repetir o que você já disse: instrução, horário, data, combinado, explicação ou lembrete. Ela leu e confirmou.',
    '- Se a sua última fala era uma oferta ou pedia uma decisão, a confirmação é o "sim": dê o PRÓXIMO passo (a cobrança, a etapa seguinte).',
    '- Se a sua última fala era um lembrete, uma orientação já dada ou uma despedida, responda com UM balão curto, de poucas palavras, e pare: sem repetir, sem resumo e sem pergunta nova. Exemplo: "Combinado, [nome]. 🌙"',
  ].join('\n');
}
