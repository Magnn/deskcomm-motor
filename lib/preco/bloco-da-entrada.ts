/**
 * O bloco do turno em que a pessoa propôs ENTRADA HOJE + RESTANTE NUMA DATA (`entradaComRestante`).
 *
 * Vai depois do bloco de preço e vence o que ele disser: a escada manda oferecer um valor à vista, e
 * aqui a compra já está fechada em duas partes. O link da entrada vem daqui (o do degrau igual à
 * entrada), e o envio dele vira Pix na conversa quando há conta de Pix conectada. O restante fica com o
 * retorno agendado — o valor dito por ÚLTIMO na mensagem é o que o retorno guarda como combinado.
 */
import type { PricingConfig } from "./tipos";
import { reais } from "./tipos";

export function blocoDaEntrada(
  pricing: Pick<PricingConfig, "steps"> | null | undefined,
  entrada: { entradaCents: number; restanteCents: number } | null,
): string {
  if (!pricing || entrada === null) return "";
  const degrau = pricing.steps.find((s) => s.price_cents === entrada.entradaCents);
  const links = (degrau?.product_links ?? []).map((l) => `  - ${l.name}: ${l.url}`);
  if (links.length === 0 && degrau?.payment_url) links.push(`  - ${degrau.payment_url}`);
  if (links.length === 0) return "";
  const e = reais(entrada.entradaCents);
  const r = reais(entrada.restanteCents);
  return [
    "",
    "",
    `ENTRADA + RESTANTE (ESTE BLOCO VENCE O BLOCO DE PREÇO E O MOTOR 13 NESTE TURNO)`,
    `A pessoa propôs pagar uma parte hoje e o restante em uma data. Isso é venda fechada: ACEITE. Não ofereça cartão, não ofereça outro valor e não peça o valor cheio.`,
    `A entrada é ${e} hoje e o restante é ${r} na data que ela disse. O total não muda.`,
    `Faça, nesta ordem, numa resposta só:`,
    `1. Um balão confirmando, com o restante dito POR ÚLTIMO: "Combinado, [nome]. Você entra com ${e} hoje, e o restante de ${r} fica para o dia [data que ela disse]."`,
    `2. Um balão dizendo que o pagamento da entrada vai agora, e que no banco aparece o nome da empresa de pagamentos.`,
    `3. O link da entrada do trabalho dela, SOZINHO em um balão (o sistema acrescenta o Pix desse valor):`,
    ...links,
    `4. Um balão final com pergunta: "Conseguiu copiar o código do Pix?"`,
    `Depois de enviar, chame a ferramenta de agendar retorno para a data que ela disse, com a promessa "Enviar o pagamento do restante de ${r}". Se ela não disse o dia exato, pergunte o dia ANTES de enviar o link.`,
    `NÃO chame a equipe humana por causa disto.`,
  ].join("\n");
}

/**
 * O bloco do turno em que a pessoa disse quanto tem hoje e ainda não falou de data (`entradaAPropor`):
 * a agente propõe entrada + restante ANTES de qualquer desconto. O valor da venda não muda.
 */
export function blocoDaPropostaDeEntrada(entrada: { entradaCents: number; restanteCents: number } | null): string {
  if (entrada === null) return "";
  const e = reais(entrada.entradaCents);
  const r = reais(entrada.restanteCents);
  return [
    "",
    "",
    `PROPONHA ENTRADA + RESTANTE (ESTE BLOCO VENCE O DESCONTO DO BLOCO DE PREÇO NESTE TURNO)`,
    `A pessoa disse quanto tem hoje. NÃO ofereça desconto agora e NÃO ofereça cartão. Proponha, em 2 balões:`,
    `1. "Dá pra fazer assim, [nome]: você entra com ${e} hoje e o restante de ${r} fica para um dia que for bom pra você."`,
    `2. "Que dia fica bom pra você mandar o restante?"`,
    `NÃO envie link nem código neste turno: o pagamento da entrada vai quando ela disser o dia.`,
    `Se ela responder que não consegue pagar o restante em dia nenhum, aí sim siga a negociação de valor do bloco de preço.`,
  ].join("\n");
}

/**
 * O bloco do turno em que a pessoa OFERECEU PAGAR AGORA um valor que cabe num degrau (`valorOferecidoParaPagarAgora`),
 * depois de a entrada + restante já ter sido proposta. A venda fecha nesse degrau, neste turno.
 */
export function blocoDoValorAceito(pricing: Pick<PricingConfig, "steps"> | null | undefined, aceitoCents: number | null): string {
  if (!pricing || aceitoCents === null) return "";
  const degrau = pricing.steps.find((s) => s.price_cents === aceitoCents);
  const links = (degrau?.product_links ?? []).map((l) => `  - ${l.name}: ${l.url}`);
  if (links.length === 0 && degrau?.payment_url) links.push(`  - ${degrau.payment_url}`);
  if (links.length === 0) return "";
  const v = reais(aceitoCents);
  return [
    "",
    "",
    `VALOR ACEITO (ESTE BLOCO VENCE O BLOCO DE PREÇO NESTE TURNO)`,
    `A pessoa ofereceu pagar AGORA. Isso é venda: feche em ${v}. NÃO defenda o valor cheio, NÃO ofereça outro valor e NÃO peça para ela esperar.`,
    `Faça, nesta ordem, numa resposta só:`,
    `1. Um balão: "Fechado, [nome]: fica ${v}, uma vez só, e eu começo o seu trabalho hoje."`,
    `2. O link de ${v} do trabalho dela, SOZINHO em um balão (o sistema acrescenta o Pix desse valor):`,
    ...links,
    `3. Um balão final com pergunta: "Conseguiu copiar o código do Pix?"`,
    `NÃO chame a equipe humana por causa disto.`,
  ].join("\n");
}
