/**
 * PÓS-VENDA — o que o catálogo do agente rendeu: a quem cada produto foi oferecido, quantos pediram o
 * link, quantos compraram e quanto entrou; e a receita média por cliente (a meta de quem vende todo
 * dia a quem já comprou).
 *
 * ─── De onde sai cada número ────────────────────────────────────────────────────────────────────
 *   oferecido  → mensagem que SAIU para quem já pagou (`pago` no contato) citando o NOME do produto.
 *                A oferta do catálogo nomeia o produto na primeira bolha e só manda o link depois do
 *                "sim" (`lib/catalogo/bloco-do-prompt.ts`), então contar link sozinho subcontaria.
 *   pediu link → mensagem que saiu com o LINK do produto.
 *   comprou    → linha `charge` de `revenue_ledger` cujo produto casa com o do catálogo, pela MESMA
 *                regra que marca a compra no contato (`nomeCasaComCompra`). Estorno, chargeback e
 *                ajuste entram negativos na receita do produto e não contam como compra.
 *   receita média por cliente → tudo o que já entrou, de sempre, dividido por quem já pagou.
 *
 * As funções de conta são puras; só `lerPainelDoPosVenda` toca o banco.
 */
import type pg from "pg";

import { nomeCasaComCompra } from "@/lib/catalogo/oferta-da-vez";
import type { ProdutoDoCatalogo } from "@/lib/catalogo/tipos";
import { lerCatalogo } from "@/lib/catalogo/tipos";
import { slugDoProduto } from "@/lib/preco/pos-venda";
import { normalizar } from "@/lib/resultado/marcos";

export interface MensagemQueSaiu {
  contactId: string;
  body: string;
  /** ISO 8601. */
  criadaEm: string;
}

export interface FatoDeVenda {
  contactId: string | null;
  tipo: string;
  centavos: number;
  produto: string | null;
}

export interface LinhaDoProduto {
  nome: string;
  precoCentavos: number;
  /** Clientes distintas a quem o produto foi oferecido no período. */
  oferecidas: number;
  /** Clientes distintas que receberam o link do produto no período. */
  pediramLink: number;
  compras: number;
  receitaCentavos: number;
}

export interface PainelDoPosVenda {
  produtos: LinhaDoProduto[];
  /** Pares (cliente, dia) com mais de um produto oferecido — a oferta diária promete UM. */
  ofertasRepetidasNoDia: number;
  clientesQuePagaram: number;
  receitaDeSempreCentavos: number;
  receitaMediaPorClienteCentavos: number;
  /** A leitura bateu no teto de mensagens: o período tem mais do que a tela soma de uma vez. */
  cortado: boolean;
}

/** O dia, na parede do fuso, de um instante. */
function diaNoFuso(iso: string, fuso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** O que cada produto teve de oferta e de link, e quantas vezes alguém recebeu dois produtos num dia. */
export function contarOfertas(
  mensagens: readonly MensagemQueSaiu[],
  produtos: readonly ProdutoDoCatalogo[],
  fuso: string,
): { porProduto: Map<string, { oferecidas: Set<string>; links: Set<string> }>; repetidasNoDia: number } {
  const nomes = produtos.map((p) => ({ chave: slugDoProduto(p.nome), nome: normalizar(p.nome), link: p.link }));
  const porProduto = new Map(nomes.map((n) => [n.chave, { oferecidas: new Set<string>(), links: new Set<string>() }]));
  const produtosDoDia = new Map<string, Set<string>>();

  for (const m of mensagens) {
    const corpo = normalizar(m.body);
    for (const n of nomes) {
      if (n.nome === "") continue;
      const citou = corpo.includes(n.nome);
      const linkou = m.body.includes(n.link);
      if (!citou && !linkou) continue;
      const linha = porProduto.get(n.chave)!;
      linha.oferecidas.add(m.contactId);
      if (linkou) linha.links.add(m.contactId);
      const chaveDoDia = `${m.contactId}|${diaNoFuso(m.criadaEm, fuso)}`;
      const doDia = produtosDoDia.get(chaveDoDia) ?? new Set<string>();
      doDia.add(n.chave);
      produtosDoDia.set(chaveDoDia, doDia);
    }
  }
  const repetidasNoDia = [...produtosDoDia.values()].filter((s) => s.size > 1).length;
  return { porProduto, repetidasNoDia };
}

/** Compras e receita de cada produto do catálogo, pelos fatos de venda do período. */
export function atribuirVendas(
  fatos: readonly FatoDeVenda[],
  produtos: readonly ProdutoDoCatalogo[],
): Map<string, { compras: number; receitaCentavos: number }> {
  const out = new Map(produtos.map((p) => [slugDoProduto(p.nome), { compras: 0, receitaCentavos: 0 }]));
  for (const f of fatos) {
    if (f.produto === null || f.produto.trim() === "") continue;
    const comprado = [slugDoProduto(f.produto)];
    const p = produtos.find((x) => nomeCasaComCompra(x.nome, comprado));
    if (p === undefined) continue;
    const linha = out.get(slugDoProduto(p.nome))!;
    linha.receitaCentavos += f.centavos;
    if (f.tipo === "charge" && f.centavos > 0) linha.compras += 1;
  }
  return out;
}

/** Junta as contas num painel. Puro. */
export function montarPainel(
  produtos: readonly ProdutoDoCatalogo[],
  mensagens: readonly MensagemQueSaiu[],
  fatosDoPeriodo: readonly FatoDeVenda[],
  deSempre: { clientes: number; receitaCentavos: number },
  fuso: string,
  cortado: boolean,
): PainelDoPosVenda {
  const ofertas = contarOfertas(mensagens, produtos, fuso);
  const vendas = atribuirVendas(fatosDoPeriodo, produtos);
  return {
    produtos: produtos.map((p) => {
      const chave = slugDoProduto(p.nome);
      const o = ofertas.porProduto.get(chave)!;
      const v = vendas.get(chave)!;
      return {
        nome: p.nome,
        precoCentavos: p.preco_cents,
        oferecidas: o.oferecidas.size,
        pediramLink: o.links.size,
        compras: v.compras,
        receitaCentavos: v.receitaCentavos,
      };
    }),
    ofertasRepetidasNoDia: ofertas.repetidasNoDia,
    clientesQuePagaram: deSempre.clientes,
    receitaDeSempreCentavos: deSempre.receitaCentavos,
    receitaMediaPorClienteCentavos: deSempre.clientes === 0 ? 0 : Math.round(deSempre.receitaCentavos / deSempre.clientes),
    cortado,
  };
}

/** Os produtos dos catálogos LIGADOS dos agentes da organização, sem repetir nome. */
export function produtosDosCatalogos(configs: readonly unknown[]): ProdutoDoCatalogo[] {
  const vistos = new Set<string>();
  const out: ProdutoDoCatalogo[] = [];
  for (const config of configs) {
    for (const p of lerCatalogo(config)?.produtos ?? []) {
      const chave = slugDoProduto(p.nome);
      if (!p.ativo || vistos.has(chave)) continue;
      vistos.add(chave);
      out.push(p);
    }
  }
  return out;
}

/** Teto de mensagens lidas por painel: acima dele o período é longo demais para somar de uma vez. */
export const TETO_DE_MENSAGENS = 20_000;

/**
 * Lê o banco e monta o painel do período. `null` = a organização não tem catálogo ligado — não há
 * pós-venda a medir, e a tela diz isso em vez de mostrar zeros.
 */
export async function lerPainelDoPosVenda(
  pool: pg.Pool,
  organizationId: string,
  periodo: { inicio: Date; fim: Date },
  fuso: string,
): Promise<PainelDoPosVenda | null> {
  const { rows: agentes } = await pool.query<{ config: unknown }>(
    `select config from ai_agents where organization_id = $1 and archived_at is null`,
    [organizationId],
  );
  const produtos = produtosDosCatalogos(agentes.map((a) => a.config));
  if (produtos.length === 0) return null;

  const [mensagens, fatos, deSempre] = await Promise.all([
    pool.query<{ contact_id: string; body: string; created_at: Date }>(
      `select m.contact_id, m.body, m.created_at
         from messages m
         join contacts c on c.id = m.contact_id and c.organization_id = m.organization_id
        where m.organization_id = $1
          and m.direction = 'outbound'
          and m.created_at >= $2 and m.created_at < $3
          and m.body is not null
          and 'pago' = any(c.tags)
        order by m.created_at
        limit $4`,
      [organizationId, periodo.inicio, periodo.fim, TETO_DE_MENSAGENS + 1],
    ),
    pool.query<{ contact_id: string | null; event_type: string; amount_cents: string | number; produto: string | null }>(
      `select contact_id, event_type, amount_cents, metadata->>'produto' as produto
         from revenue_ledger
        where organization_id = $1 and occurred_at >= $2 and occurred_at < $3`,
      [organizationId, periodo.inicio, periodo.fim],
    ),
    pool.query<{ clientes: string | number; receita: string | number | null }>(
      `select count(distinct contact_id) filter (where event_type = 'charge' and amount_cents > 0) as clientes,
              coalesce(sum(amount_cents), 0) as receita
         from revenue_ledger
        where organization_id = $1 and contact_id is not null`,
      [organizationId],
    ),
  ]);

  const cortado = mensagens.rows.length > TETO_DE_MENSAGENS;
  return montarPainel(
    produtos,
    mensagens.rows.slice(0, TETO_DE_MENSAGENS).map((m) => ({ contactId: m.contact_id, body: m.body, criadaEm: new Date(m.created_at).toISOString() })),
    fatos.rows.map((f) => ({ contactId: f.contact_id, tipo: f.event_type, centavos: Number(f.amount_cents), produto: f.produto })),
    { clientes: Number(deSempre.rows[0]?.clientes ?? 0), receitaCentavos: Number(deSempre.rows[0]?.receita ?? 0) },
    fuso,
    cortado,
  );
}

/** O resumo da semana para a Central, em texto corrido. Puro. */
export function textoDoResumoSemanal(
  semana: PainelDoPosVenda,
  anterior: PainelDoPosVenda | null,
  formatar: (centavos: number) => string,
): { titulo: string; corpo: string } {
  const soma = (p: PainelDoPosVenda, k: "oferecidas" | "compras" | "receitaCentavos") =>
    p.produtos.reduce((a, l) => a + l[k], 0);
  const receita = soma(semana, "receitaCentavos");
  const antes = anterior === null ? null : soma(anterior, "receitaCentavos");
  const comparacao = antes === null ? "" : ` (semana anterior: ${formatar(antes)})`;
  const linhas = semana.produtos
    .filter((l) => l.oferecidas > 0 || l.compras > 0)
    .map((l) => `${l.nome}: oferecido a ${l.oferecidas}, ${l.pediramLink} pediram o link, ${l.compras} compraram (${formatar(l.receitaCentavos)}).`);
  const corpo = [
    `Pós-venda dos últimos 7 dias: ${soma(semana, "oferecidas")} ofertas, ${soma(semana, "compras")} compras, ${formatar(receita)}${comparacao}.`,
    ...(linhas.length > 0 ? linhas : ["Nenhuma oferta de pós-venda saiu nesta semana."]),
    `Receita média por cliente, de sempre: ${formatar(semana.receitaMediaPorClienteCentavos)} (${semana.clientesQuePagaram} clientes).`,
    ...(semana.ofertasRepetidasNoDia > 0
      ? [`Atenção: ${semana.ofertasRepetidasNoDia} vez(es) uma cliente recebeu mais de um produto no mesmo dia.`]
      : []),
  ].join("\n");
  return { titulo: "Pós-venda da semana", corpo };
}
