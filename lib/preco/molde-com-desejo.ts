/**
 * DESEJO ANTES DO PREÇO — o molde de oferta a quem já está na conversa (cliente da casa, sequência,
 * segunda oferta). O molde antigo ia direto ao valor ("tem algo que combina: X. Fica R$ 35. Quer?"):
 * a pessoa ouvia o preço antes de querer a coisa. Agora a 1ª bolha liga o que ELA contou ao que o
 * produto faz e mostra como vai ser ter aquilo; o valor só vem na 2ª. O mesmo desenho já valia na
 * porta aberta dos extras (`blocoDaOportunidade`) e na primeira venda (mecanismos antes do valor).
 */
export function moldeComDesejo(nome: string, valor: string, oQueFaz = ""): string {
  const faz = oQueFaz !== "" ? ` (o que ele faz: ${oQueFaz})` : "";
  return (
    `em 3 bolhas, o preço só na 2ª: ` +
    `1ª, o DESEJO, sem valor: pegue UMA coisa que ela contou, com as palavras dela, ligue ao que *${nome}* faz${faz} ` +
    `e diga como vai ser para ela ter isso nas mãos — o que ela vai fazer, sentir ou deixar de carregar no dia a dia. ` +
    `Sem prometer resultado, volta nem data, e sem dizer o que outra pessoa sente. ` +
    `2ª "*${nome}* fica ${valor}, pagamento único. Quer que eu te mande?" ` +
    `3ª (só se ela disser que sim) o link.`
  );
}
