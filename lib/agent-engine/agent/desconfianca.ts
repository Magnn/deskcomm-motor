/**
 * A DESCONFIANÇA — a pessoa disse que acha que é golpe, ou que vai denunciar.
 *
 * ─── O que se via em produção ─────────────────────────────────────────────────────────
 * Em 15/10/2026 a conta oficial de um cliente foi desativada em definitivo por "spam ou outro tipo de
 * comunicação não permitida". Medido nas conversas dos 9 dias anteriores: 93% das mensagens do número
 * saíram menos de 5 minutos depois de a pessoa escrever, e quem só clicou no anúncio recebeu 2 mensagens
 * (mediana). O volume não ia para quem estava calado. Ia para quem conversava, chegava à oferta e
 * desconfiava: 72 conversas chamaram o atendimento de golpe ("Pois é golpe", "Golpista", "tô com medo de
 * ser golpe"), e a resposta seguinte era mais oferta e, no silêncio, a retomada. No canal, bloquear
 * oferece "denunciar", e a denúncia conta como spam.
 *
 * ─── A régua ──────────────────────────────────────────────────────────────────────────
 * É a ACUSAÇÃO, não a palavra. "Levei um golpe do banco" e "a pessoa que me deu o golpe" são a história
 * da pessoa, e num atendimento sobre a vida dela são o assunto da conversa. Vale quando "golpe" vem como
 * juízo sobre o que está acontecendo ("é golpe", "isso é golpe?", "parece golpe", "medo de ser golpe"),
 * quando a pessoa chama quem atende de golpista/picareta/charlatã, ou quando anuncia denúncia ou bloqueio.
 * A pergunta ("não é golpe, né?") conta: é a mesma dúvida, dita com educação.
 *
 * ─── O que muda ───────────────────────────────────────────────────────────────────────
 * Quem desconfia recebe UMA resposta calma, sem valor, link nem pressão (`blocoDaDesconfianca`), e a
 * retomada por silêncio não volta a chamá-la (`recuperacao-por-silencio.ts`). Se ela quiser seguir, ela
 * escreve — e aí a conversa volta ao normal, porque a régua olha a fala MAIS RECENTE.
 *
 * Tudo aqui é puro.
 */
import { normalizarTexto } from '@/lib/opt-out/deteccao';

/** "golpe" como juízo sobre o atendimento: depois de ser/parecer, ou como medo do que está acontecendo. */
const JUIZO_DE_GOLPE =
  /\b(?:e|eh|seja|ser|sera|parece|parecendo|isso|isto|so|tipo|medo\s+de(?:\s+ser|\s+cair\s+(?:em|num|no|nesse|neste))?|cara\s+de)\s+(?:um\s+)?golpes?\b/u;
/** Chamar quem atende pelo nome do golpe. */
const XINGAMENTO = /\b(?:golpist\w*|picaret\w*|charlat\w*|estelionat\w*|vigarist\w*|trambiqueir\w*|enganad[oa]r\w*)\b/u;
/** Anunciar denúncia ou bloqueio do número. */
const DENUNCIA =
  /\b(?:vou|vo|irei|ja\s+vou)\s+(?:te\s+|lhe\s+|voce\s+|vc\s+)?(?:denunciar|bloquear|reportar)\b|\b(?:denunciar|bloquear|reportar)\s+(?:voce|vc|vcs|voces|esse\s+numero|este\s+numero|esse\s+contato|isso\s+aqui)\b|\b(?:e|eh|isso\s+e)\s+spam\b/u;

/** A mensagem traz desconfiança de golpe, ou anuncia denúncia/bloqueio? */
export function ehDesconfianca(corpo: string | null | undefined): boolean {
  const texto = normalizarTexto((corpo ?? '').trim());
  if (texto === '') return false;
  return JUIZO_DE_GOLPE.test(texto) || XINGAMENTO.test(texto) || DENUNCIA.test(texto);
}

export interface MensagemDaConversa {
  direction: string;
  body: string | null | undefined;
}

/** Alguma fala da rodada da pessoa (o que ela escreveu depois da última fala do agente) é desconfiança. */
export function rodadaComDesconfianca(mensagens: readonly MensagemDaConversa[]): boolean {
  for (let i = mensagens.length - 1; i >= 0 && mensagens[i]!.direction === 'inbound'; i--) {
    if (ehDesconfianca(mensagens[i]!.body)) return true;
  }
  return false;
}

/** O bloco do turno em que a pessoa desconfiou. '' quando não é o caso. */
export function blocoDaDesconfianca(desconfiou: boolean): string {
  if (!desconfiou) return '';
  return [
    '',
    '',
    'A PESSOA DESCONFIOU (disse que pode ser golpe, ou falou em denunciar/bloquear) — vale só para este turno',
    '- Responda em UMA mensagem curta e calma. Reconheça o receio dela como legítimo, sem se ofender e sem se justificar demais.',
    '- É PROIBIDO neste turno: dizer valor, mandar link, Pix ou forma de pagamento, oferecer desconto, pedir o pagamento ou o comprovante, contar depoimento de cliente, falar de urgência, vaga ou prazo, e dizer o que acontece se ela não fizer.',
    '- Diga que ela não precisa decidir nada agora e que, se quiser seguir, é só escrever. Não termine com pergunta que force uma resposta.',
    '- Se ela pediu para parar ou disse que não quer mais, apenas confirme com respeito e se despeça.',
  ].join('\n');
}
