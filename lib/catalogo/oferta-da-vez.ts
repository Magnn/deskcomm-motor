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
 *
 * ─── A oferta diária (`catalogo.oferta_diaria`) ──────────────────────────────────────────────────
 * Para quem vende a cliente todos os dias: no máximo UMA oferta por dia, e a recusa não trava. Se um
 * produto foi oferecido nas últimas 24 h, é ele, já feito (nada novo hoje). Senão, o primeiro que ela
 * pode receber e que não foi oferecido na última semana. Recusou hoje → amanhã vem o próximo da ordem;
 * todos oferecidos na semana → nada até o mais antigo completar 7 dias. Só enxerga o histórico que o
 * turno carrega: oferta mais velha que ele conta como não feita.
 */
import { slugDoProduto, type CompraDoContato, type MensagemDoHistorico } from "@/lib/preco/pos-venda";

import type { CatalogoConfig, ProdutoDoCatalogo } from "./tipos";

const MARCA_DE_PAGO = "pago";
const MARCAS_DE_DEVOLUCAO = ["reembolso", "chargeback"] as const;
const PREFIXO_DO_PRODUTO = "produto:";

/**
 * Pagou alguma coisa: o produto principal (`pago`) ou uma cobrança avulsa (`extra:<id>`, ex.: pergunta nova).
 * Quem tem devolução fica de fora. Pura.
 */
export function pagouAlgo(tags: readonly string[]): boolean {
  if (MARCAS_DE_DEVOLUCAO.some((m) => tags.includes(m))) return false;
  return tags.includes(MARCA_DE_PAGO) || tags.some((t) => t.startsWith("extra:"));
}

/** As marcas com `pago` acrescentado para quem só pagou cobrança avulsa — o que a oferta da vez exige. */
export function comMarcaDePago(tags: readonly string[]): string[] {
  return pagouAlgo(tags) && !tags.includes(MARCA_DE_PAGO) ? [...tags, MARCA_DE_PAGO] : [...tags];
}

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
  /** A agente já mandou o link deste produto nesta conversa (na oferta diária: nas últimas 24 h). */
  jaOferecida: boolean;
  /** O catálogo está na oferta diária — o bloco do turno muda de molde. */
  diaria?: boolean;
}

const DIA_MS = 24 * 3_600_000;
const SEMANA_MS = 7 * DIA_MS;

/**
 * Quando a agente ofereceu este produto pela última vez: pelo link OU pela fala com o nome e o valor. `null` =
 * nunca, no histórico do turno. Mensagem sem hora legível conta como AGORA: na dúvida, a oferta já foi feita hoje.
 *
 * O link do catálogo é trocado no envio pelo Pix e pelo link do provedor (`pix-na-conversa.ts`), então procurar só
 * o link deixava toda oferta "nunca feita" — e a oferta diária nunca sabia que já tinha oferecido hoje.
 */
function ultimaOferta(p: ProdutoDoCatalogo, mensagens: readonly MensagemDoHistorico[], agora: Date): number | null {
  const valor = new RegExp("R\\$\\s?" + Math.floor(p.preco_cents / 100) + "(?![0-9])");
  const nome = p.nome.toLowerCase();
  let ultima: number | null = null;
  for (const m of mensagens) {
    if (m.direction !== "outbound") continue;
    const corpo = m.body ?? "";
    const ofereceu = corpo.includes(p.link) || (corpo.toLowerCase().includes(nome) && valor.test(corpo));
    if (!ofereceu) continue;
    const t = m.sent_at ? Date.parse(m.sent_at) : Number.NaN;
    const quando = Number.isNaN(t) ? agora.getTime() : t;
    if (ultima === null || quando > ultima) ultima = quando;
  }
  return ultima;
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

  const podeReceber = (p: ProdutoDoCatalogo) =>
    p.ativo &&
    oQueFaltaNoProduto(p, produtosComFluxo) === null &&
    !nomeCasaComCompra(p.nome, comprados) &&
    (p.depois_de === undefined || nomeCasaComCompra(p.depois_de, comprados)) &&
    desdeOPagamento >= p.espera_horas * 3_600_000;

  if (catalogo.oferta_diaria === true) {
    const quando = (p: ProdutoDoCatalogo) => ultimaOferta(p, mensagens, agora);
    const elegiveis = catalogo.produtos.filter(podeReceber);
    const deHoje = elegiveis.find((p) => {
      const t = quando(p);
      return t !== null && agora.getTime() - t < DIA_MS;
    });
    if (deHoje !== undefined) return { produto: deHoje, jaOferecida: true, diaria: true };
    const proxima = elegiveis.find((p) => {
      const t = quando(p);
      return t === null || agora.getTime() - t >= SEMANA_MS;
    });
    return proxima === undefined ? null : { produto: proxima, jaOferecida: false, diaria: true };
  }

  const produto = catalogo.produtos.find(podeReceber);
  if (produto === undefined) return null;

  const jaOferecida = ultimaOferta(produto, mensagens, agora) !== null;
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
