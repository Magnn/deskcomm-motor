/**
 * O PREÇO DE QUEM ESCREVE DE FORA DO BRASIL.
 *
 * ─── Por que existe ───────────────────────────────────────────────────────────────────
 * A escada de preço, o Pix e os links do checkout são em reais. Quem escreve de um número de outro país
 * não tem como pagar um Pix, e um link em reais cobra dela um valor que a conversa nunca disse. O
 * operador define UM preço por moeda (euro, dólar), fixo, e o código decide pela pessoa: o DDI do
 * telefone diz a moeda, o bloco do turno diz o valor, e o envio troca o link em reais por uma cobrança
 * criada naquela moeda (`lib/agent-engine/agent/link-internacional-no-envio.ts`).
 *
 * ─── Como a pessoa é reconhecida ──────────────────────────────────────────────────────
 * Só pelo telefone em formato internacional (`+DDI…`). Telefone sem o `+` NÃO é lido: um número brasileiro
 * guardado sem DDI ("11 9…") começa com 1, o DDI dos Estados Unidos, e seria cobrado em dólar por engano.
 * Na dúvida, a pessoa segue em reais — que é o que acontecia antes de este arquivo existir.
 *
 * Tudo aqui é puro.
 */
import type { MoedaInternacional, PricingConfig } from "./tipos";

/** DDI do país onde os valores em reais valem. */
const DDI_DO_BRASIL = "55";

/** DDIs dos países que usam o euro. Do mais longo para o mais curto não importa: nenhum é prefixo de outro. */
const DDIS_DO_EURO: readonly string[] = [
  "30", // Grécia
  "31", // Países Baixos
  "32", // Bélgica
  "33", // França
  "34", // Espanha
  "39", // Itália
  "43", // Áustria
  "49", // Alemanha
  "351", // Portugal
  "352", // Luxemburgo
  "353", // Irlanda
  "356", // Malta
  "357", // Chipre
  "358", // Finlândia
  "370", // Lituânia
  "371", // Letônia
  "372", // Estônia
  "377", // Mônaco
  "385", // Croácia
  "386", // Eslovênia
  "421", // Eslováquia
];

export interface PrecoInternacionalDoContato {
  moeda: MoedaInternacional;
  precoCents: number;
}

/** O telefone é internacional e de fora do Brasil? Devolve só os dígitos; `null` quando não dá para afirmar. */
function digitosDeFora(telefone: string | null | undefined): string | null {
  const bruto = (telefone ?? "").trim();
  if (!bruto.startsWith("+")) return null;
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length < 8 || digitos.length > 15) return null;
  return digitos.startsWith(DDI_DO_BRASIL) ? null : digitos;
}

/**
 * O preço desta pessoa em moeda estrangeira, ou `null` quando ela paga em reais (número do Brasil, telefone
 * que não dá para ler, ou operador que não configurou preço internacional).
 *
 * País do euro paga em euro; o resto do mundo, em dólar. Se o operador configurou só UMA das moedas, ela
 * vale para todo número de fora: melhor cobrar em euro de quem está nos Estados Unidos do que mandar um Pix.
 */
export function precoInternacionalDoContato(
  pricing: Pick<PricingConfig, "enabled" | "international_prices"> | null | undefined,
  telefone: string | null | undefined,
): PrecoInternacionalDoContato | null {
  const precos = pricing?.enabled ? (pricing.international_prices ?? []) : [];
  if (precos.length === 0) return null;
  const digitos = digitosDeFora(telefone);
  if (digitos === null) return null;
  const preferida: MoedaInternacional = DDIS_DO_EURO.some((ddi) => digitos.startsWith(ddi)) ? "EUR" : "USD";
  const escolhido = precos.find((p) => p.currency === preferida) ?? precos[0]!;
  return { moeda: escolhido.currency, precoCents: escolhido.price_cents };
}

/** "€ 20" / "US$ 25", com centavos só quando há: é como a agente escreve o valor e como a tela o mostra. */
export function valorNaMoeda(cents: number, moeda: MoedaInternacional): string {
  const inteiro = Math.floor(cents / 100);
  const resto = cents % 100;
  const numero = resto === 0 ? String(inteiro) : `${inteiro},${String(resto).padStart(2, "0")}`;
  return `${moeda === "EUR" ? "€" : "US$"} ${numero}`;
}

/** O nome da moeda por extenso, para a frase do preço. */
export function nomeDaMoeda(moeda: MoedaInternacional): string {
  return moeda === "EUR" ? "euros" : "dólares";
}

/**
 * O bloco de preço do turno de quem paga em moeda estrangeira. SUBSTITUI o bloco em reais inteiro: escada,
 * entrada, Pix e parcelamento são de quem paga em reais, e deixá-los no prompt faria a agente oferecer a uma
 * pessoa em Portugal um Pix que ela não consegue pagar.
 *
 * Os links listados são os do valor de venda: a agente manda o do produto que indicou, e o envio o troca pela
 * cobrança na moeda da pessoa. Ela nunca digita o link novo nem escolhe o valor.
 */
export function blocoDoPrecoInternacional(
  pricing: Pick<PricingConfig, "list_product_links"> | null | undefined,
  preco: PrecoInternacionalDoContato | null,
): string {
  if (!pricing || preco === null) return "";
  const valor = valorNaMoeda(preco.precoCents, preco.moeda);
  const links = (pricing.list_product_links ?? []).map((l) => `${l.name}: ${l.url}`).join(" | ");
  const linhas = [
    "",
    "",
    "PREÇO PARA QUEM ESCREVE DE FORA DO BRASIL (definido pelo operador; ESTE BLOCO VENCE qualquer valor, Pix, parcelamento, entrada ou desconto escrito antes neste prompt)",
    `- Esta pessoa escreve de um número de fora do Brasil. O valor para ela é ${valor} (${nomeDaMoeda(preco.moeda)}), pagamento único no cartão. NUNCA diga valor em reais a ela e NUNCA fale de Pix: ela não consegue pagar Pix.`,
    `- Antes de entregar a leitura, se ela pedir preço ou desconto, NÃO fale de valor: "A leitura é por minha conta. O valor do trabalho eu te falo logo depois, quando ler o que é certo."`,
    `- Ao dizer o preço (depois da leitura), use ESTE molde em 2 bolhas: 1ª "O trabalho custa ${valor}, pagamento único e seguro, no cartão." 2ª só o link de pagamento do trabalho que você indicou.`,
    `- Este valor é FIXO: não tem desconto, cupom, entrada, parcela nem valor menor. Se ela disser que está caro, explique com carinho que é o valor único do trabalho e NÃO ofereça outro número. Se ela disser que hoje não consegue, pergunte o dia em que consegue e agende o retorno; o valor continua ${valor}.`,
    "- Se ela disser que falta para o essencial (comida, remédio, aluguel, conta de casa), NÃO insista em valor nenhum: acolha, e diga que a porta fica aberta quando ela puder.",
    "- A cobrança é SUA: NÃO chame atendimento humano por causa de valor ou para enviar link.",
  ];
  if (links !== "") {
    linhas.push(
      `- LINKS DE PAGAMENTO — mande SÓ o do trabalho que você indicou, nunca a lista, e sozinho no balão. O sistema troca o link, no envio, pela cobrança de ${valor} no cartão: ${links}`,
    );
  }
  return linhas.join("\n");
}
