/**
 * O PIX "COPIA E COLA" NA CONVERSA, NO VALOR QUE A NEGOCIAÇÃO LIBEROU.
 *
 * ─── Por que existe ───────────────────────────────────────────────────────────────────
 * Medido em produção: de cada 100 pessoas que recebem o link de pagamento, menos de 4 compram, e um
 * terço some logo depois do link. O checkout pede cadastro (nome, CPF, e-mail) a quem só queria pagar.
 * O código do Pix é pago no app do banco, sem cadastro nenhum.
 *
 * ─── Como entra, sem mudar quem decide o valor ────────────────────────────────────────
 * O agente continua fazendo o que já faz: manda o link de pagamento do valor que a escada de preço
 * liberou (`lib/preco`). O CÓDIGO reconhece esse link no balão — cada link da configuração pertence a
 * um valor e a um produto —, cria a cobrança por Pix desse mesmo valor e reescreve o envio: o código do
 * Pix primeiro, e o link logo depois, para quem prefere cartão. O modelo nunca escolhe o valor do Pix e
 * nunca digita o código.
 *
 * Qualquer falha (conta sem Pix, provedor fora, link que não é da configuração) deixa o envio como
 * estava: a pessoa recebe o link de sempre. Aqui mora a parte pura; quem fala com o provedor é o turno.
 */
import type { PricingConfig } from "@/lib/preco/tipos";
import { reais } from "@/lib/preco/tipos";
import { instrucaoDoPixCopiaECola, linhaDoLinkDePagamento } from "@/lib/pagamentos/como-pagar-pix";

export interface LinkDePagamentoConhecido {
  url: string;
  valorCentavos: number;
  produto: string;
}

type ConfigComLinksDoValorCheio = PricingConfig & { list_product_links?: Array<{ name: string; url: string }> };

/** Todos os links de pagamento da configuração de preço, cada um com o valor e o produto que cobra. Pura. */
export function linksDePagamentoDaConfig(pricing: PricingConfig | null | undefined): LinkDePagamentoConhecido[] {
  if (!pricing) return [];
  const c = pricing as ConfigComLinksDoValorCheio;
  const lista: LinkDePagamentoConhecido[] = [];
  const por = (url: string | undefined, valorCentavos: number, produto: string) => {
    if (url && !lista.some((l) => l.url === url)) lista.push({ url, valorCentavos, produto });
  };
  for (const l of c.list_product_links ?? []) por(l.url, c.list_price_cents, l.name);
  for (const degrau of c.steps) {
    for (const l of degrau.product_links ?? []) por(l.url, degrau.price_cents, l.name);
    por(degrau.payment_url, degrau.price_cents, "");
  }
  if (c.post_sale) {
    for (const l of c.post_sale.product_links) por(l.url, c.post_sale.price_cents, l.name);
    for (const oferta of c.post_sale.next_offers ?? []) for (const l of oferta.product_links) por(l.url, oferta.price_cents, l.name);
  }
  return lista;
}

/** O link de pagamento conhecido que este corpo traz — só quando traz exatamente UM (dois valores no mesmo envio não viram Pix). */
export function linkDePagamentoNoCorpo(corpo: string, conhecidos: readonly LinkDePagamentoConhecido[]): LinkDePagamentoConhecido | null {
  const achados = conhecidos.filter((l) => new RegExp(`${l.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(corpo));
  return achados.length === 1 ? achados[0]! : null;
}

/** O começo de todo código Pix (EMV): é como o corte de balões reconhece o que não pode ser partido. */
export const INICIO_DO_CODIGO_PIX = "000201";

/**
 * Reescreve o corpo: o balão que traz o link vira três — a instrução, o código sozinho (para copiar com um
 * toque) e o link para quem prefere cartão. Os outros balões do agente ficam como estão. Pura.
 */
export function corpoComPix(corpo: string, link: LinkDePagamentoConhecido, copiaECola: string, paginaDoPix?: string | null): string {
  const baloes = corpo.split(/\n{2,}/);
  const i = baloes.findIndex((b) => b.includes(link.url));
  if (i < 0) return corpo;
  const novos = [
    instrucaoDoPixCopiaECola(reais(link.valorCentavos), undefined, paginaDoPix),
    copiaECola,
    linhaDoLinkDePagamento(link.url),
  ];
  // O texto que vinha no mesmo balão do link (raro: o roteiro manda o link isolado) é preservado antes.
  const resto = baloes[i]!.replace(link.url, "").trim();
  return [...baloes.slice(0, i), ...(resto ? [resto] : []), ...novos, ...baloes.slice(i + 1)].join("\n\n");
}

/** A referência da cobrança: a mesma conversa pedindo o mesmo valor na mesma hora recebe o MESMO Pix. */
export function referenciaDoPix(conversaId: string, valorCentavos: number, agora: Date, pagamentosAntes = 0): string {
  return `pix-${conversaId}-${valorCentavos}-${Math.floor(agora.getTime() / 3_600_000)}${pagamentosAntes > 0 ? `-p${pagamentosAntes}` : ""}`;
}

/**
 * Quantas cobranças esta pessoa já PAGOU nas últimas 24 h. Entra na referência da cobrança nova: a referência é a
 * chave de idempotência na Stripe, e sem isto uma segunda cobrança do mesmo valor na mesma hora devolvia o Pix já
 * pago e o link já usado — que a Stripe mostra como "The link is no longer active" (medido em 21/10/2026, depois
 * de uma pergunta paga a cliente pediu outra e recebeu o link fechado). Falha de leitura = 0 (a referência de antes).
 */
export async function pagamentosRecentesDoContato(
  supabase: { from: (t: string) => unknown },
  organizationId: string,
  contactId: string,
  agora: Date,
): Promise<number> {
  try {
    const consulta = (supabase.from("revenue_ledger") as {
      select: (c: string, o: { count: "exact"; head: true }) => {
        eq: (k: string, v: string) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => { gte: (k: string, v: string) => PromiseLike<{ count: number | null; error: unknown }> } } };
      };
    })
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .eq("event_type", "charge")
      .gte("occurred_at", new Date(agora.getTime() - 86_400_000).toISOString());
    const { count, error } = await consulta;
    return error || typeof count !== "number" ? 0 : count;
  } catch {
    return 0;
  }
}

/** Validade do código: uma hora. Depois disso a pessoa pede de novo, e o valor é o da negociação daquele momento. */
export const VALIDADE_DO_PIX_S = 3600;
