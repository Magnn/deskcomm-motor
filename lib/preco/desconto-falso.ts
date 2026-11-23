/**
 * DESCONTO FALSO — "consegui deixar o seu trabalho em *R$ 130*" quando R$ 130 é o preço de tabela.
 *
 * Medido em 23/11/2026, 03:32: o toque de silêncio anunciou como conquista o valor que a pessoa já tinha ouvido, e três
 * horas depois o mesmo molde anunciou R$ 60. Quem lê as duas aprende que o preço não quer dizer nada. "Consegui deixar
 * por" e "deixei em" só podem vir com valor ABAIXO do de tabela. Puro.
 */
const CONQUISTA = /\b(?:consegui|deixei)\b[^.!?\n]{0,60}?\b(?:por|em)\b/i;
const VALOR = /R\$\s*(\d{1,4})(?:,(\d{2}))?|\*(\d{1,4})\*/g;

/** A recusa para o modelo, ou `null`. `precoDeTabelaCents`: o valor cheio do trabalho principal. */
export function descontoFalso(texto: string, precoDeTabelaCents: number | null | undefined): string | null {
  if (!precoDeTabelaCents || precoDeTabelaCents <= 0) return null;
  for (const frase of texto.split(/(?<=[.!?\n])\s+/)) {
    if (!CONQUISTA.test(frase)) continue;
    for (const m of frase.matchAll(VALOR)) {
      const cents = Number(m[1] ?? m[3]) * 100 + Number(m[2] ?? 0);
      if (cents >= precoDeTabelaCents) {
        return `Envio recusado: a mensagem anuncia como conquista ("consegui", "deixei por") o valor de ${(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}, que é o preço de sempre. Não fale em desconto: retome a conversa de onde ela parou, sem repetir o valor como se fosse novo.`;
      }
    }
  }
  return null;
}
