/**
 * A OFERTA DE PÓS-VENDA — o que a agente pode oferecer a quem JÁ comprou.
 *
 * ─── O defeito que fez este arquivo existir ─────────────────────────────────────────
 * A tabela de preço só conhecia a PRIMEIRA venda. Depois do pagamento a agente seguia presa
 * ao valor de venda: citar qualquer valor menor antes da 2ª reclamação é vetado pela trava de
 * promessas (`precoPermitidoAgora`). Quem escrevia um "segundo produto por R$ 70" no roteiro
 * via a mensagem ser barrada em silêncio — medido em produção (06/10/2026): 32 vetos
 * `promise_out_of_table` em 24 h. Uma segunda oferta só existe se a tabela a declara.
 *
 * ─── A regra, toda aqui e sem I/O ───────────────────────────────────────────────────
 * A oferta libera quando: está ligada; a pessoa tem a marca de pagamento e nenhuma de
 * devolução; e já passou a espera configurada desde o pagamento. Sem a hora do pagamento não
 * libera — na dúvida, a agente não oferece.
 *
 * O produto que a pessoa JÁ comprou sai da lista: oferecer de novo o que ela acabou de pagar é
 * o erro que mais queima a conversa.
 */
import type { PricingConfig } from "./tipos";

/** As marcas que a compra aprovada e a devolução deixam no contato (`lib/pagamentos/compra-cakto.ts`). */
const MARCA_DE_PAGO = "pago";
const MARCAS_DE_DEVOLUCAO = ["reembolso", "chargeback"] as const;
const PREFIXO_DO_PRODUTO = "produto:";

const ACENTOS = /[̀-ͯ]/g;

/** "Abertura do Coração" → "abertura-do-coracao" — a mesma forma da marca `produto:<slug>`. */
export function slugDoProduto(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(ACENTOS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface CompraDoContato {
  tags: readonly string[];
  /** Quando o pagamento foi aprovado. `null` = não se sabe. */
  pagoEm: Date | null;
}

export interface MensagemDoHistorico {
  direction: string;
  body?: string | null;
}

export interface EstadoDoPosVenda {
  priceCents: number;
  /** Os links que AINDA fazem sentido: sem o produto que a pessoa já comprou. */
  links: { name: string; url: string }[];
  /** A agente já mandou um desses links nesta conversa. */
  jaOferecida: boolean;
}

/**
 * O nome do link casa com um produto já comprado? Casa por CONTEÚDO do slug, nos dois
 * sentidos: o checkout chama o produto de "Trabalho Espiritual: Abertura do Coração" e a
 * tela, de "Abertura do Coração".
 */
function jaComprou(nomeDoLink: string, comprados: readonly string[]): boolean {
  const slug = slugDoProduto(nomeDoLink);
  if (slug === "") return false;
  return comprados.some((c) => c === slug || c.includes(slug) || slug.includes(c));
}

/** `null` = não há oferta de pós-venda para esta pessoa neste turno. */
export function estadoDoPosVenda(
  config: Pick<PricingConfig, "enabled" | "post_sale"> | null | undefined,
  compra: CompraDoContato,
  mensagens: readonly MensagemDoHistorico[],
  agora: Date,
): EstadoDoPosVenda | null {
  const oferta = config?.post_sale;
  if (!config?.enabled || !oferta?.enabled) return null;
  if (!compra.tags.includes(MARCA_DE_PAGO)) return null;
  if (MARCAS_DE_DEVOLUCAO.some((m) => compra.tags.includes(m))) return null;
  if (compra.pagoEm === null || Number.isNaN(compra.pagoEm.getTime())) return null;

  const comprados = compra.tags
    .filter((t) => t.startsWith(PREFIXO_DO_PRODUTO))
    .map((t) => t.slice(PREFIXO_DO_PRODUTO.length))
    .filter((s) => s !== "" && s !== "outro");

  // A SEQUÊNCIA: com ofertas seguintes configuradas, a oferta da vez é a primeira da qual a pessoa
  // ainda não comprou nada — e ela só é alcançada depois de a anterior ter sido comprada. Sem
  // ofertas seguintes nada muda: vale a oferta única, sem os produtos já comprados.
  const emSequencia = [
    { price_cents: oferta.price_cents, wait_hours: oferta.wait_hours, product_links: oferta.product_links },
    ...(oferta.next_offers ?? []),
  ];
  let daVez = emSequencia[0]!;
  if (emSequencia.length > 1) {
    const naoComprada = emSequencia.find((o) => !o.product_links.some((l) => jaComprou(l.name, comprados)));
    if (naoComprada === undefined) return null;
    daVez = naoComprada;
  }
  // A espera é a da oferta DA VEZ, contada da última compra — que, numa oferta seguinte, é a compra
  // da oferta anterior.
  if (agora.getTime() - compra.pagoEm.getTime() < daVez.wait_hours * 3_600_000) return null;

  const links = daVez.product_links.filter((l) => !jaComprou(l.name, comprados));
  if (links.length === 0) return null;
  const jaOferecida = mensagens.some(
    (m) => m.direction === "outbound" && links.some((l) => (m.body ?? "").includes(l.url)),
  );
  return { priceCents: daVez.price_cents, links, jaOferecida };
}

/** A hora do pagamento, como a compra a gravou em `contacts.source_metadata.ultima_compra`. */
export function horaDoPagamento(ultimaCompra: unknown): Date | null {
  if (ultimaCompra === null || typeof ultimaCompra !== "object") return null;
  const bruto = (ultimaCompra as Record<string, unknown>).pago_em;
  if (typeof bruto !== "string" || bruto.trim() === "") return null;
  const data = new Date(bruto);
  return Number.isNaN(data.getTime()) ? null : data;
}
