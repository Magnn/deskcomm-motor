/**
 * O ACOMPANHAMENTO QUE VEM COM O TRABALHO TEM PRAZO.
 *
 * O roteiro vende o trabalho com "de bônus o meu acompanhamento todos os dias" e nunca disse até quando. Medido em
 * 20/10/2026: uma cliente que comprou em 08/10 seguia, doze dias depois, com 87 mensagens numa manhã — conversa do
 * dia a dia, ritual novo que não está no material — enquanto o Acompanhamento (a cobrança de período do bloco
 * COBRANÇAS À PARTE) nunca chegou a ser oferecido a ela. Decisão do dono no mesmo dia: o incluso vale 7 dias, o
 * prazo da garantia; depois, a conversa diária é o Acompanhamento pago.
 *
 * Isto NÃO corta quem pagou: dúvida sobre as etapas do material dela segue respondida. O que deixa de ser de graça
 * é a consultoria aberta. Tudo aqui é puro.
 */
import { marcaDoExtra, slugDoExtra, type ExtraPago } from "@/lib/preco/extras";
import { reais, type Extra } from "@/lib/preco/tipos";

/** Dias de acompanhamento que vêm com o trabalho: o mesmo prazo da garantia. */
export const DIAS_DO_ACOMPANHAMENTO_INCLUSO = 7;

/** A cobrança de período que É o acompanhamento: a primeira com `valid_days` > 1 e "acompanhamento" no nome. */
export function acompanhamentoDosExtras(extras: readonly Extra[]): Extra | null {
  return extras.find((e) => (e.valid_days ?? 1) > 1 && /acompanhamento/i.test(e.name)) ?? null;
}

export interface EntradaDoAcompanhamentoIncluso {
  /** A pessoa comprou o trabalho (tag `pago`). */
  comprou: boolean;
  /** Dias desde a compra do trabalho; `null` = não se sabe (aí não se corta nada). */
  diasDesdeACompra: number | null;
  extras: readonly Extra[];
  pagos: readonly ExtraPago[];
}

/** O bloco do turno quando o incluso acabou; `""` enquanto ele vale, para quem não comprou, ou com o pago ativo. */
export function blocoDoAcompanhamentoIncluso(e: EntradaDoAcompanhamentoIncluso): string {
  if (!e.comprou || e.diasDesdeACompra === null || e.diasDesdeACompra < DIAS_DO_ACOMPANHAMENTO_INCLUSO) return "";
  const pago = acompanhamentoDosExtras(e.extras);
  if (pago !== null) {
    const ativo = e.pagos.some((p) => p.slug === slugDoExtra(pago.name) && (p.diasAtras ?? 0) < (pago.valid_days ?? 1));
    if (ativo) return "";
  }
  const caminhoPago =
    pago !== null
      ? `*${pago.name}*, ${reais(pago.price_cents)}, para você seguir com ela todos os dias (para cobrar, a marca ${marcaDoExtra(pago.name)} sozinha num balão, como em COBRANÇAS À PARTE)`
      : "uma pergunta nova às cartas";
  return [
    "",
    "",
    `O ACOMPANHAMENTO INCLUSO TERMINOU (a compra do trabalho foi há ${e.diasDesdeACompra} dias; o acompanhamento que vem com ele é de ${DIAS_DO_ACOMPANHAMENTO_INCLUSO} dias). Vale mais que o "acompanhamento todos os dias" escrito antes neste prompt:`,
    "- Dúvida sobre as ETAPAS do material dela (o que fazer, como fazer, em que ordem): responda normalmente, em até 2 balões.",
    `- Todo o resto (conversa do dia a dia, desabafo, conselho, o que a outra pessoa disse, pedido de leitura ou de ritual novo): NÃO é mais de graça. Responda UMA vez, curto: acolha em meia frase, diga com carinho que o acompanhamento do trabalho dela terminou e mostre os caminhos: ${caminhoPago}, ou uma pergunta nova às cartas. Termine perguntando qual ela prefere.`,
    "- NUNCA conduza ritual, vela, banho, oração ou passo que não esteja no MATERIAL DE ENTREGA dela, mesmo que ela peça ou já esteja fazendo por conta própria.",
  ].join("\n");
}
