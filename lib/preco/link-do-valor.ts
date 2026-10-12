/**
 * O LINK COBRA O VALOR QUE A MENSAGEM DIZ — conferido pelo código na hora do envio.
 *
 * ─── O que se via em produção ────────────────────────────────────────────────────────────────────────────
 * Medido em 12/10/2026: o preço de venda mudou de R$ 130 para R$ 60 e, em duas horas, nove mensagens disseram
 * "fica R$ 60" (uma, "R$ 50") e levaram o link que cobra R$ 130. O link vinha de uma lista escrita no roteiro, que
 * ninguém atualizou. Quem abriu o link viu um preço que a conversa não tinha dito.
 *
 * ─── A régua ────────────────────────────────────────────────────────────────────────────────────────────
 * Os links de pagamento do produto principal estão na configuração, cada um com o seu valor (`list_product_links`
 * e os `product_links` de cada degrau). Antes de enviar:
 *   1. link cadastrado que cobra um valor diferente do que a mensagem diz → troca pelo link do MESMO produto no
 *      valor dito;
 *   2. link cadastrado que cobra mais que o valor de venda, numa mensagem que não diz valor → troca pelo do valor
 *      de venda;
 *   3. link do mesmo site de pagamento que NÃO está na configuração → o envio é recusado com a lista certa, e o
 *      modelo reescreve. Não dá para saber quanto um link desconhecido cobra.
 * Links de outras ofertas da configuração (pós-venda, próximas ofertas) são conhecidos e passam sem conferência.
 *
 * Tudo aqui é puro.
 */
import type { PricingConfig } from "./tipos";

interface LinkDoProduto {
  url: string;
  nome: string;
  cents: number;
}

const semProtocolo = (url: string): string => url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
const hostDe = (url: string): string => semProtocolo(url).split("/")[0]!.toLowerCase();

/** Os links do produto principal, com o valor que cada um cobra. */
export function linksDoProdutoPrincipal(pricing: PricingConfig): LinkDoProduto[] {
  const out: LinkDoProduto[] = [];
  for (const l of pricing.list_product_links ?? []) out.push({ url: semProtocolo(l.url), nome: l.name, cents: pricing.list_price_cents });
  for (const d of pricing.steps) for (const l of d.product_links ?? []) out.push({ url: semProtocolo(l.url), nome: l.name, cents: d.price_cents });
  return out;
}

/** Todo endereço escrito em qualquer lugar da configuração de preço (pós-venda, próximas ofertas…). */
function urlsDaConfiguracao(pricing: PricingConfig): Set<string> {
  const achados = new Set<string>();
  (function andar(v: unknown): void {
    if (typeof v === "string") {
      if (/^https?:\/\//i.test(v)) achados.add(semProtocolo(v));
    } else if (Array.isArray(v)) v.forEach(andar);
    else if (v && typeof v === "object") Object.values(v).forEach(andar);
  })(pricing);
  return achados;
}

const reais = (cents: number): string => `R$ ${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2).replace(".", ",")}`;

/** Os valores do produto principal que o corpo diz, na ordem em que aparecem. */
function valoresDitos(corpo: string, validos: ReadonlySet<number>): number[] {
  const out: number[] = [];
  for (const a of corpo.matchAll(/R\$\s?(\d{1,5})(?:[.,](\d{2}))?(?![\d])/g)) {
    const cents = Number(a[1]) * 100 + Number(a[2] ?? 0);
    if (validos.has(cents)) out.push(cents);
  }
  return out;
}

export type LinkConferido =
  | { corpo: string; trocas: { de: string; para: string; cents: number }[] }
  | { recusa: string };

export function linkDoValorPrometido(corpo: string, pricing: PricingConfig): LinkConferido {
  const principais = linksDoProdutoPrincipal(pricing);
  if (principais.length === 0) return { corpo, trocas: [] };
  const porUrl = new Map(principais.map((l) => [l.url, l]));
  const conhecidos = urlsDaConfiguracao(pricing);
  const hosts = new Set(principais.map((l) => hostDe(l.url)));
  const validos = new Set(principais.map((l) => l.cents));
  const ditos = valoresDitos(corpo, validos);
  const dito = ditos.length > 0 ? ditos[ditos.length - 1]! : null;

  const trocas: { de: string; para: string; cents: number }[] = [];
  let novo = corpo;
  for (const a of corpo.matchAll(/(https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,}\/[A-Za-z0-9_\-/]+)/gi)) {
    const url = semProtocolo(a[2]!);
    if (!hosts.has(hostDe(url))) continue;
    const link = porUrl.get(url);
    if (link === undefined) {
      if (conhecidos.has(url)) continue;
      const alvo = dito ?? pricing.list_price_cents;
      const certos = principais.filter((l) => l.cents === alvo).map((l) => `${l.nome}: https://${l.url}`);
      return {
        recusa: `O endereço ${url} não é um link de pagamento cadastrado, e não dá para saber quanto ele cobra. Reescreva a mensagem com o link de ${reais(alvo)} do produto certo: ${certos.join(" | ")}`,
      };
    }
    const alvo = dito ?? (link.cents > pricing.list_price_cents ? pricing.list_price_cents : link.cents);
    if (alvo === link.cents) continue;
    const certo = principais.find((l) => l.cents === alvo && l.nome === link.nome);
    if (certo === undefined) {
      return { recusa: `O link ${url} cobra ${reais(link.cents)}, e a mensagem diz ${reais(alvo)}. Não há link de ${reais(alvo)} cadastrado para "${link.nome}": não envie link; ofereça o Pix desse valor.` };
    }
    novo = novo.split(url).join(certo.url);
    trocas.push({ de: url, para: certo.url, cents: alvo });
  }
  return { corpo: novo, trocas };
}
