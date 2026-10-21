/**
 * COMO PAGAR O PIX COPIA E COLA — o texto que vai antes do código, num lugar só.
 *
 * Pix Copia e Cola não é chave Pix. Quem cola o código no campo de CHAVE ("Pagar com chave", "Transferir",
 * "Pix por chave") recebe do banco "chave não encontrada" ou "sem resultado" e acha que o código está
 * errado. Medido em 21/10/2026: uma cliente travou assim num Pix de R$ 5, e a agente desistiu do Pix e foi
 * pedir CPF para um boleto. O passo a passo diz ONDE colar, para o erro não acontecer.
 *
 * Folha pura: usada por todo caminho que manda um código copia e cola para a pessoa.
 */

/** A instrução, com o valor já formatado ("R$ 5,00") e, se houver, quem aparece no banco. */
export function instrucaoDoPixCopiaECola(valor: string, noBancoAparece?: string): string {
  return [
    `Pra pagar no Pix (*${valor}*):`,
    "1. Toque e segure no código da próxima mensagem e escolha *Copiar*.",
    "2. No app do seu banco, entre em *Pix* e escolha *Pix Copia e Cola*. Não é em \"Pagar com chave\" nem em \"Transferir\": lá o banco não acha o código.",
    `3. Cole o código, confira o valor *${valor}* e confirme.${noBancoAparece ? ` No banco aparece ${noBancoAparece}, é assim mesmo.` : ""}`,
  ].join("\n");
}

/**
 * A linha do link que vai depois do código. O link da Stripe tem o Pix com botão de copiar, além do cartão e do
 * boleto — e quem não conseguiu colar o código só ia para ele se soubesse disso (medido em 21/10/2026: a linha
 * dizia "Se preferir cartão de crédito", e quem travou no Pix desistiu).
 */
export function linhaDoLinkDePagamento(url: string): string {
  return `Se o código não colar, ou se preferir cartão, abre este link: lá tem o Pix com botão de copiar e o cartão. ${url}`;
}
