/**
 * A RECUSA — a pessoa disse "não tenho mais interesse", "não me interessa mais", "já disse que não quero".
 *
 * Até 29/10/2026 estas frases silenciavam o agente para sempre e mandavam "Encerro os envios automáticos deste
 * canal" (ver `ehRecusaDaOferta` em `lib/opt-out/deteccao.ts`). Recusar a oferta não é pedir para a conversa
 * acabar: o turno segue, e este bloco diz como — sem repetir o que ela recusou e sem anunciar parada nenhuma.
 *
 * Tudo aqui é puro.
 */
import { ehRecusaDaOferta } from '@/lib/opt-out/deteccao';

/** Alguma das falas ainda sem resposta é uma recusa da oferta. */
export function recusouNoTurno(pendentes: readonly string[]): boolean {
  return pendentes.some((texto) => ehRecusaDaOferta(texto));
}

/** O bloco do turno em que a pessoa recusou. '' quando não é o caso. */
export function blocoDaRecusa(recusou: boolean): string {
  if (!recusou) return '';
  return [
    '',
    '',
    'A PESSOA RECUSOU A OFERTA ("não tenho mais interesse", "não me interessa mais") — vale só para este turno',
    '- Ela NÃO pediu para encerrar a conversa. Continue falando com ela, com calor, e responda ao resto do que ela disse.',
    '- É PROIBIDO dizer que vai parar de mandar mensagens, encerrar o atendimento, cancelar algo ou passar a conversa para outra pessoa.',
    '- Não repita a oferta que ela recusou e não cobre: sem valor, link ou Pix dessa oferta neste turno. Se o roteiro tem uma alternativa menor que caiba no que ela contou, pode apresentá-la UMA vez, com leveza.',
    '- Feche deixando a porta aberta, com uma pergunta sobre ela (não sobre a compra).',
  ].join('\n');
}
