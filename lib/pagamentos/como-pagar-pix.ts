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

/**
 * A instrução, com o valor já formatado ("R$ 5,00") e, se houver, quem aparece no banco. Só o passo a passo:
 * decisão do dono em 29/10/2026 — a página com o botão "Copiar código Pix" (#415) era mais um link na conversa,
 * e mais um link atrapalha quem já tem dificuldade. O código vai sozinho no balão seguinte.
 */
export function instrucaoDoPixCopiaECola(valor: string, noBancoAparece?: string): string {
  const noBanco = noBancoAparece ? ` No banco aparece ${noBancoAparece}, é assim mesmo.` : "";
  return [
    `Pra pagar no Pix (*${valor}*):`,
    "1. Toque e segure no código da próxima mensagem e escolha *Copiar*.",
    "2. No app do seu banco, entre em *Pix* e escolha *Pix Copia e Cola*. Não é em \"Pagar com chave\" nem em \"Transferir\": lá o banco não acha o código.",
    `3. Cole o código, confira o valor *${valor}* e confirme.${noBanco}`,
  ].join("\n");
}

/** O balão depois do código da chave da empresa: esse pagamento só anda com o comprovante. */
export const PEDIDO_DO_COMPROVANTE = "Assim que fizer, me manda o comprovante aqui, que eu confiro.";

/**
 * Os balões do Pix pela chave da empresa: a instrução, a chave sozinha para copiar com um toque e o pedido do
 * comprovante. Decisão do dono em 01/11/2026: a chave vem primeiro, e o copia e cola só sai para quem teve problema
 * com ela (a marca `[[CHAVE PIX: valor]]`, em `lib/preco/chave-pix.ts`).
 */
export function baloesPelaChave(valor: string, chave: string, titular: string): string[] {
  return [
    [
      `Pra pagar no Pix (*${valor}*):`,
      "1. Toque e segure na chave da próxima mensagem e escolha *Copiar*.",
      "2. No app do seu banco, entre em *Pix* e escolha *Pagar com chave* ou *Transferir*.",
      `3. Cole a chave, confira o nome *${titular}*, coloque o valor *${valor}* e confirme.`,
    ].join("\n"),
    chave,
    PEDIDO_DO_COMPROVANTE,
  ];
}

/**
 * Lê de volta o valor da cobrança no primeiro balão ("Pra pagar no Pix (*R$ 10 (2× Pergunta nova)*):"), o mesmo texto
 * que as duas instruções acima escrevem. É o que a conferência do comprovante compara (`comprovante-pix.ts`).
 */
export function cobrancaNoTexto(texto: string): { valorCents: number; quantidade: number; nome: string | null } | null {
  const achada = texto.match(/Pra pagar no Pix \(\*R\$ ([\d.,]+)(?: \((\d+)× ([^)]+)\))?\*\)/);
  if (!achada) return null;
  const valorCents = Math.round(Number(achada[1]!.replace(/\./g, "").replace(",", ".")) * 100);
  if (!Number.isFinite(valorCents) || valorCents <= 0) return null;
  return { valorCents, quantidade: achada[2] ? Number(achada[2]) : 1, nome: achada[3]?.trim() ?? null };
}

/**
 * A linha do link de cartão que vai depois do código. Só cartão (decisão do dono em 29/10/2026): o Pix já foi no
 * balão de cima, e oferecer outro caminho de Pix aqui confundia quem tentava pagar.
 */
export function linhaDoLinkDePagamento(url: string): string {
  return `Se preferir pagar no cartão, é por este link: ${url}`;
}
