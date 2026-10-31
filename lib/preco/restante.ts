/**
 * O RESTANTE DE QUEM JÁ PAGOU A ENTRADA.
 *
 * Medido em produção em 31/10/2026: quem pagou entrada recebia, no dia combinado, o Pix do valor cheio.
 * O agente escrevia "o restante de R$ 70", usava o link do produto, e o envio trocava o link pela cobrança
 * daquele link: R$ 130. Não há link para um valor qualquer, por isso é marca e não link, como na entrada, e
 * o modelo nunca escolhe o valor.
 *
 * O valor vem do retorno combinado (`payload.restante_cents`, ou o que o agente escreveu nele) e, quando o
 * retorno não diz, da conta entre o valor de venda e o que entrou no livro de receita. Sem nada pago, não
 * há restante: é uma venda comum.
 *
 * Pura. Quem lê o banco é `buscaRestanteCombinado`, em `lib/followup/retorno-pg.ts`.
 */
import { reais } from "./tipos";

/** O nome da marca que o agente escreve para pedir o Pix do restante: `[[PIX: Restante]]`. */
export const MARCA_DO_RESTANTE = "Restante";

/** O `metadata.extra` da cobrança: o aviso de pagamento registra a receita sem iniciar outra entrega. */
export const EXTRA_DO_RESTANTE = "restante";

const VALOR_NO_TEXTO = /restante\s+(?:de\s+)?R\$\s*(\d{1,5})(?:[.,](\d{2}))?/i;
const NA_MARCA = /\[\[\s*PIX\s*:\s*restante\s*\]\]/i;

export const temMarcaDoRestante = (corpo: string): boolean => NA_MARCA.test(corpo);

export function restanteEscritoNoRetorno(texto: string): number | null {
  const achado = VALOR_NO_TEXTO.exec(texto);
  if (achado === null) return null;
  return Number(achado[1]) * 100 + Number(achado[2] ?? 0);
}

export function restanteDoCombinado(e: {
  /** `payload.restante_cents`, quando o retorno guardou o valor. */
  guardadoCents: number | null;
  /** O motivo e a promessa do retorno, nas palavras do agente. */
  texto: string;
  listPriceCents: number;
  /** O que entrou pelo produto principal, sem as cobranças avulsas. */
  pagoCents: number;
}): number | null {
  if (e.pagoCents <= 0 || e.pagoCents >= e.listPriceCents) return null;
  const dito = e.guardadoCents ?? restanteEscritoNoRetorno(e.texto) ?? e.listPriceCents - e.pagoCents;
  return dito > 0 && dito < e.listPriceCents ? dito : null;
}

export function blocoDoRestante(restanteCents: number | null): string {
  if (restanteCents === null) return "";
  const r = reais(restanteCents);
  return [
    "",
    "",
    `RESTANTE EM ABERTO (ESTE BLOCO VENCE O BLOCO DE PREÇO NESTE TURNO)`,
    `Esta pessoa já pagou a entrada. Falta só ${r}, e esse é o único valor do trabalho que você pode cobrar dela.`,
    `Para cobrar, escreva sozinha em um balão a marca [[PIX: ${MARCA_DO_RESTANTE}]]: o sistema troca a marca pelo código do Pix de ${r}.`,
    `NÃO envie link de pagamento do trabalho, NÃO fale do valor cheio e NÃO ofereça desconto.`,
    `Se ela disser que não pode pagar agora, acolha e combine outro dia, sem pressão.`,
  ].join("\n");
}
