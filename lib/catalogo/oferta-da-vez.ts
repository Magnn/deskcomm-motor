/**
 * A OFERTA DA VEZ — qual produto do catálogo a agente pode oferecer a ESTA pessoa, AGORA. Um só.
 *
 * ─── Uma oferta por vez ─────────────────────────────────────────────────────────────────────────
 * A agente nunca vê o cardápio. O código olha o que a pessoa já comprou e devolve o primeiro produto,
 * na ordem do catálogo, que ela pode receber agora; os outros nem entram no prompt, e por isso também
 * não vazam para a conversa.
 *
 * ─── A regra, toda aqui e sem I/O ───────────────────────────────────────────────────────────────
 * Um produto é oferecido quando: está ativo e COMPLETO (um `material` só é completo se existe um fluxo
 * de entrega que o declara — sem isso a pessoa pagaria e não receberia); a pessoa tem a marca de
 * pagamento e nenhuma de devolução; ela ainda não comprou este produto; a compra que o libera
 * (`depois_de`) aconteceu; e já passou a espera desde o último pagamento. Sem a hora do pagamento nada
 * é oferecido — na dúvida, a agente não oferece.
 *
 * A oferta já feita e não comprada NÃO passa a vez para a seguinte: recusou, a agente não insiste nem
 * troca de produto. A sequência só anda com a compra.
 */
import { slugDoProduto, type CompraDoContato, type MensagemDoHistorico } from "@/lib/preco/pos-venda";

import type { CatalogoConfig, ProdutoDoCatalogo } from "./tipos";

const MARCA_DE_PAGO = "pago";
const MARCAS_DE_DEVOLUCAO = ["reembolso", "chargeback"] as const;
const PREFIXO_DO_PRODUTO = "produto:";

/** Os produtos já comprados, como a compra aprovada os marca no contato (`produto:<slug>`). */
export function produtosComprados(tags: readonly string[]): string[] {
  return tags
    .filter((t) => t.startsWith(PREFIXO_DO_PRODUTO))
    .map((t) => t.slice(PREFIXO_DO_PRODUTO.length))
    .filter((s) => s !== "" && s !== "outro");
}

/**
 * O nome casa com um produto já comprado? Por CONTEÚDO do slug, nos dois sentidos: o checkout chama o
 * produto de "Trabalho Espiritual: Abertura do Coração" e a tela, de "Abertura do Coração".
 */
export function nomeCasaComCompra(nome: string, comprados: readonly string[]): boolean {
  const slug = slugDoProduto(nome);
  if (slug === "") return false;
  return comprados.some((c) => c === slug || c.includes(slug) || slug.includes(c));
}

/** Por que um produto ativo ainda não pode ser oferecido a ninguém. `null` = completo. */
export type FaltaNoProduto = "sem_fluxo_de_entrega";

/**
 * O que falta para o produto poder ser vendido. `produtosComFluxo` são os nomes de produto declarados
 * nos fluxos de entrega ATIVOS da organização.
 */
export function oQueFaltaNoProduto(p: ProdutoDoCatalogo, produtosComFluxo: readonly string[]): FaltaNoProduto | null {
  if (p.entrega === "material" && !nomeCasaComCompra(p.nome, produtosComFluxo.map(slugDoProduto))) {
    return "sem_fluxo_de_entrega";
  }
  return null;
}

export interface OfertaDaVez {
  produto: ProdutoDoCatalogo;
  /** A agente já mandou o link deste produto nesta conversa. */
  jaOferecida: boolean;
}

/** `null` = o catálogo não tem o que oferecer a esta pessoa neste turno. */
export function ofertaDaVez(
  catalogo: CatalogoConfig | null | undefined,
  compra: CompraDoContato,
  mensagens: readonly MensagemDoHistorico[],
  produtosComFluxo: readonly string[],
  agora: Date,
): OfertaDaVez | null {
  if (!catalogo || !catalogo.enabled) return null;
  if (!compra.tags.includes(MARCA_DE_PAGO)) return null;
  if (MARCAS_DE_DEVOLUCAO.some((m) => compra.tags.includes(m))) return null;
  if (compra.pagoEm === null || Number.isNaN(compra.pagoEm.getTime())) return null;

  const comprados = produtosComprados(compra.tags);
  const desdeOPagamento = agora.getTime() - compra.pagoEm.getTime();

  const produto = catalogo.produtos.find(
    (p) =>
      p.ativo &&
      oQueFaltaNoProduto(p, produtosComFluxo) === null &&
      !nomeCasaComCompra(p.nome, comprados) &&
      (p.depois_de === undefined || nomeCasaComCompra(p.depois_de, comprados)) &&
      desdeOPagamento >= p.espera_horas * 3_600_000,
  );
  if (produto === undefined) return null;

  const jaOferecida = mensagens.some((m) => m.direction === "outbound" && (m.body ?? "").includes(produto.link));
  return { produto, jaOferecida };
}

/** Há quanto tempo, no máximo, uma compra ainda é "a entrega em aberto" de um produto de conversa. */
export const JANELA_DA_ENTREGA_NA_CONVERSA_H = 7 * 24;

/**
 * O produto de entrega NA CONVERSA que esta pessoa acabou de comprar — o que a agente tem de conduzir
 * agora. Vale só para a ÚLTIMA compra, e por 7 dias: a marca `produto:<nome>` fica no contato para
 * sempre, e sem o prazo a agente refaria a entrega meses depois.
 */
export function entregaNaConversaEmAberto(
  catalogo: CatalogoConfig | null | undefined,
  ultimaCompra: { produto: string | null; pagoEm: Date | null },
  tags: readonly string[],
  agora: Date,
): ProdutoDoCatalogo | null {
  if (!catalogo || !catalogo.enabled) return null;
  if (!tags.includes(MARCA_DE_PAGO)) return null;
  if (MARCAS_DE_DEVOLUCAO.some((m) => tags.includes(m))) return null;
  if (ultimaCompra.produto === null || ultimaCompra.pagoEm === null || Number.isNaN(ultimaCompra.pagoEm.getTime())) return null;
  const desde = agora.getTime() - ultimaCompra.pagoEm.getTime();
  if (desde < 0 || desde > JANELA_DA_ENTREGA_NA_CONVERSA_H * 3_600_000) return null;
  const comprados = [slugDoProduto(ultimaCompra.produto)];
  return catalogo.produtos.find((p) => p.entrega === "conversa" && nomeCasaComCompra(p.nome, comprados)) ?? null;
}

/** O nome do produto da última compra, como `contacts.source_metadata.ultima_compra` o guarda. */
export function produtoDaUltimaCompra(ultimaCompra: unknown): string | null {
  if (ultimaCompra === null || typeof ultimaCompra !== "object") return null;
  const bruto = (ultimaCompra as Record<string, unknown>).produto;
  return typeof bruto === "string" && bruto.trim() !== "" ? bruto.trim() : null;
}
