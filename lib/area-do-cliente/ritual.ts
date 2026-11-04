/**
 * O RITUAL DE HOJE — carta e diário, com conversa opcional, no ritmo de quem lê.
 *
 * Modelo estudado em 02/11/2026 (app de alma gêmea por assinatura): a tela inicial diz o que fazer
 * primeiro — "seu pequeno ritual diário 1/3" — com UM cartão grande para o passo da vez. A nossa área
 * tinha tudo empilhado (carta, horóscopo, recado, diário) e nenhuma ordem. Os passos aqui são os que já
 * existem e têm registro no servidor: virar a carta (`area_eventos` carta_do_dia), anotar no diário
 * (`area_diario`) e conversar com a guia (mensagem dela hoje, pela área ou pelo WhatsApp).
 */
export type PassoDoRitual = "carta" | "diario" | "conversa";

/** Avisos entre as partes do navegador: a carta virou, o diário salvou. O ritual anda sem recarregar. */
export const EVENTO_CARTA_REVELADA = "area-carta-revelada";
export const EVENTO_DIARIO_SALVO = "area-diario-salvo";
export const EVENTO_CONVERSA_ENVIADA = "area-conversa-enviada";

/** A conversa é um convite opcional: concluir o ritual nunca exige iniciar um atendimento. */
export function progressoDoRitual(passos: ReadonlyArray<{ passo: PassoDoRitual; feito: boolean }>) {
  const essenciais = passos.filter((p) => p.passo !== "conversa");
  const feitos = essenciais.filter((p) => p.feito).length;
  return { feitos, total: essenciais.length, completo: essenciais.length > 0 && feitos === essenciais.length };
}

/** Os passos de hoje, na ordem, e quais já foram feitos. Sem carta do dia ligada, o ritual começa no diário. */
export function passosDoRitual(s: { temCarta: boolean; cartaHoje: boolean; diarioHoje: boolean; conversouHoje: boolean }): Array<{
  passo: PassoDoRitual;
  feito: boolean;
}> {
  return [
    ...(s.temCarta ? [{ passo: "carta" as const, feito: s.cartaHoje }] : []),
    { passo: "diario" as const, feito: s.diarioHoje },
    { passo: "conversa" as const, feito: s.conversouHoje },
  ];
}

/** O passo da vez: o primeiro não feito. Tudo feito = `null` (o ritual de hoje está completo). */
export function passoDaVez(passos: ReadonlyArray<{ passo: PassoDoRitual; feito: boolean }>): PassoDoRitual | null {
  return passos.find((p) => !p.feito)?.passo ?? null;
}
