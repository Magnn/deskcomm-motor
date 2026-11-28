/**
 * PORTAS DE ENTRADA — por onde a conversa de quem ainda não comprou começa. Uma decisão só, tomada aqui:
 *
 *   - INDICAÇÃO: ela chegou porque alguém a indicou ("a Maria me indicou"). Com `indicacao_trabalho_direto`, o trabalho
 *     é apresentado direto, sem a leitura antes (a leitura só se ela pedir).
 *   - JÁ TEVE LEITURA: com `leitura_gratis_so_primeira`, quem já teve uma leitura com a empresa (em qualquer número, numa
 *     conversa anterior ou há mais de 12 h) não ganha outra de graça; leitura nova é a Leitura Completa.
 *   - PRIMEIRA LEITURA: a leitura simples é de graça; se ela perguntar o valor antes de começar, a resposta é aberta (a
 *     primeira é presente; a completa, mais funda, tem o valor dela) em vez de "te falo depois".
 *
 * Fora daqui: quem já comprou é da CLIENTE DA CASA (refazer o trabalho é uma cobrança do tema dela); uma rodada paga ou
 * a leitura em andamento são do motor da leitura. Sem `portas_de_entrada` na configuração, nada muda. Puro.
 *
 * Decisão do dono do produto em 27/11/2026: "a leitura simples, se for a primeira da pessoa na empresa, vai de graça;
 * a completa por 50 se ela quiser já no começo; quem vem por indicação, vende direto o trabalho".
 */
import type { Extra, PricingConfig } from "@/lib/preco/tipos";

import { abreLeitura } from "./extras";

/** Há quanto tempo uma leitura passa a ser "anterior" (não é a desta conversa que ainda está correndo). */
export const LEITURA_ANTERIOR_HORAS = 12;

/** Como as pessoas dizem que foram indicadas. Comparado na fala DELA, sem acento. */
const INDICACAO =
  /\b(?:me\s+indic(?:ou|aram|ou\s+voce)|indicacao|indicad[oa]\s+(?:por|pel[oa]|da|do)|(?:minha|meu)\s+(?:amiga|amigo|prima|primo|irma|irmao|mae|tia|vizinha|colega|cunhada|comadre)\s+(?:\S+\s+)?(?:me\s+)?(?:indicou|falou\s+(?:de\s+)?(?:voce|da\s+senhora|de\s+ti)|fez\s+(?:um\s+)?trabalho\s+com\s+voce)|(?:falaram|falou)\s+(?:muito\s+)?bem\s+de\s+voce)\b/;

const semAcento = (t: string) => t.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();

export interface FalaDaConversa {
  direction: string;
  body?: string | null;
}

/** Ela disse, em alguma fala desta conversa, que chegou por indicação. */
export function veioPorIndicacao(mensagens: readonly FalaDaConversa[]): boolean {
  return mensagens.some((m) => m.direction === "inbound" && INDICACAO.test(semAcento(m.body ?? "")));
}

export type PortasDeEntrada = NonNullable<PricingConfig["portas_de_entrada"]>;

export type PortaDeEntrada =
  | { porta: "indicacao" }
  | { porta: "ja_teve_leitura"; leituraCompleta: Extra | null; quando: Date }
  | { porta: "primeira_leitura"; leituraCompleta: Extra };

export interface EntradaDaPorta {
  mensagens: readonly FalaDaConversa[];
  extras: readonly Extra[];
  /** Ela já comprou (cliente da casa). */
  jaComprou: boolean;
  /** Há uma leitura correndo nesta conversa (o motor da leitura achou a escolha dos números) ou uma rodada paga. */
  leituraEmAndamento: boolean;
  /** A leitura anterior dela com a empresa (outra conversa, ou há mais de `LEITURA_ANTERIOR_HORAS`). `null` = nunca teve. */
  leituraAnterior: Date | null;
}

/** A cobrança configurada como Leitura Completa, se existe e abre leitura. */
export function leituraCompletaDaConfig(cfg: PortasDeEntrada | undefined, extras: readonly Extra[]): Extra | null {
  if (!cfg?.leitura_completa) return null;
  const alvo = semAcento(cfg.leitura_completa.trim());
  return extras.find((e) => semAcento(e.name.trim()) === alvo && abreLeitura(e)) ?? null;
}

/** A porta deste turno, ou `null` quando outra parte do atendimento é dona dele. */
export function portaDeEntrada(cfg: PortasDeEntrada | undefined, e: EntradaDaPorta): PortaDeEntrada | null {
  if (!cfg || e.jaComprou) return null;
  const completa = leituraCompletaDaConfig(cfg, e.extras);
  if (cfg.leitura_gratis_so_primeira && e.leituraAnterior !== null) {
    return { porta: "ja_teve_leitura", leituraCompleta: completa, quando: e.leituraAnterior };
  }
  if (e.leituraEmAndamento) return null;
  if (cfg.indicacao_trabalho_direto && veioPorIndicacao(e.mensagens)) return { porta: "indicacao" };
  return completa ? { porta: "primeira_leitura", leituraCompleta: completa } : null;
}

/** O trabalho pode ser apresentado e cobrado neste turno sem a leitura antes. */
export const liberaOTrabalho = (p: PortaDeEntrada | null): boolean => p?.porta === "indicacao";

const reais = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",").replace(",00", "")}`;
const cartas = (e: Extra) => e.reading_cards ?? 3;

/** O bloco do turno. Fato decidido pelo código + o que fazer com ele; `""` sem porta. */
export function blocoDaPortaDeEntrada(p: PortaDeEntrada | null, fuso = "America/Sao_Paulo"): string {
  if (p === null) return "";
  if (p.porta === "indicacao") {
    return [
      "",
      "",
      "PORTA DE ENTRADA — ELA CHEGOU POR INDICAÇÃO (o sistema leu na fala dela)",
      "- Não abra a mesa de cartas por conta própria. Acolha agradecendo a confiança de quem indicou (sem citar o que essa pessoa comprou), entenda em 1 ou 2 perguntas curtas o que ela precisa e, na resposta seguinte, apresente o trabalho certo para a dor dela, com o valor do bloco PREÇO E NEGOCIAÇÃO (MOTOR 9 e MOTOR 12, sem as cartas).",
      "- Se ELA pedir a leitura, faça a leitura simples de graça, como na sequência de sempre.",
    ].join("\n");
  }
  if (p.porta === "ja_teve_leitura") {
    // Só os números de dia e mês no fuso da organização: é texto do prompt, não data de interface.
    const partes = new Intl.DateTimeFormat("en-US", { timeZone: fuso, day: "2-digit", month: "2-digit" }).formatToParts(p.quando);
    const dia = `${partes.find((x) => x.type === "day")?.value}/${partes.find((x) => x.type === "month")?.value}`;
    const completa = p.leituraCompleta
      ? `a *${p.leituraCompleta.name}* (${cartas(p.leituraCompleta)} cartas, ${reais(p.leituraCompleta.price_cents)}), como está em COBRANÇAS À PARTE`
      : "a cobrança de COBRANÇAS À PARTE que abre as cartas";
    return [
      "",
      "",
      `PORTA DE ENTRADA — ELA JÁ TEVE A LEITURA GRÁTIS (em ${dia})`,
      `- A leitura grátis é uma por pessoa. Se ela pedir uma leitura nova ou para abrir as cartas de novo, não abra de graça: diga com carinho que a primeira foi presente seu e ofereça ${completa}. Uma dúvida pontual sobre o que já saiu na leitura continua sendo a cobrança de pergunta, como está em COBRANÇAS À PARTE.`,
      "- Fora disso, siga a conversa de onde ela está: isto não é uma oferta para fazer agora.",
    ].join("\n");
  }
  const c = p.leituraCompleta;
  return [
    "",
    "",
    "PORTA DE ENTRADA — PRIMEIRA LEITURA DELA COM A CASA",
    `- A leitura simples, de 3 cartas, é de graça (uma por pessoa). Existe também a *${c.name}*, com ${cartas(c)} cartas, por ${reais(c.price_cents)}, para quem quer ir mais fundo já no começo.`,
    `- Se ela perguntar o valor ou como funciona ANTES da leitura, responda NESTE turno, sem "te falo depois": "A sua primeira leitura é presente meu, com 3 cartas. Se quiser ir mais fundo já agora, tem a ${c.name}, com ${cartas(c)} cartas, por ${reais(c.price_cents)}." e pergunte qual ela prefere. Escolheu a grátis: abra a mesa. Escolheu a completa: cobre como está em COBRANÇAS À PARTE e abra as cartas depois do pagamento.`,
    "- Se ela não perguntar, siga a sequência: a leitura grátis primeiro, sem oferecer a completa.",
    "- Se ela perguntar o valor do TRABALHO, vale a EXCEÇÃO DO VALOR do roteiro.",
  ].join("\n");
}
