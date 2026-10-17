/**
 * PÓS-VENDA — o que o catálogo do agente rendeu: a quem cada produto foi oferecido, quantos pediram o
 * link, quantos compraram e quanto entrou; e a receita média por cliente (a meta de quem vende todo
 * dia a quem já comprou).
 *
 * ─── De onde sai cada número ────────────────────────────────────────────────────────────────────
 *   oferecido  → mensagem que SAIU para quem já pagou (`pago` no contato) citando o NOME do produto.
 *                A oferta do catálogo nomeia o produto na primeira bolha e só manda o link depois do
 *                "sim" (`lib/catalogo/bloco-do-prompt.ts`), então contar link sozinho subcontaria.
 *   pediu link → mensagem que saiu com link ou código Pix de pagamento (`LINK_DE_PAGAMENTO`, o mesmo
 *                reconhecimento dos marcos). A cobrança troca o link do catálogo pelo da Stripe ou
 *                pelo Pix na hora de enviar, e o código costuma ir SOZINHO numa bolha: o pedido vai
 *                para o produto citado na própria mensagem ou, sem citação, para o último produto
 *                citado àquela cliente nas 24 h anteriores. Medido em 17/10/2026: procurando só o
 *                link do catálogo, a Oração dos Sonhos tinha 15 ofertas, 1 compra e 0 links.
 *   comprou    → linha `charge` de `revenue_ledger` cujo produto casa com o do catálogo, pela MESMA
 *                regra que marca a compra no contato (`nomeCasaComCompra`), e SÓ de quem já tinha
 *                comprado antes — a primeira compra é a venda, não o pós-venda (o Desbloqueio dos
 *                Caminhos comprado como primeiro trabalho entrava aqui). Estorno, chargeback e ajuste
 *                entram negativos e não contam como compra, e só quando a cliente já tinha duas compras.
 *   receita média por cliente → tudo o que já entrou, de sempre, dividido por quem já pagou.
 *
 * As funções de conta são puras; só `lerPainelDoPosVenda` toca o banco.
 */
import type pg from "pg";

import { nomeCasaComCompra } from "@/lib/catalogo/oferta-da-vez";
import type { ProdutoDoCatalogo } from "@/lib/catalogo/tipos";
import { lerCatalogo } from "@/lib/catalogo/tipos";
import { slugDoProduto } from "@/lib/preco/pos-venda";
import { LINK_DE_PAGAMENTO, normalizar } from "@/lib/resultado/marcos";

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
  /** Quantas compras (`charge` > 0) a cliente tinha ANTES deste fato. */
  comprasAntes: number;
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
  /** O último produto citado a cada cliente, e quando — para dar dono ao Pix que vai sozinho. */
  const ultimoCitado = new Map<string, { chave: string; em: number }>();

  const ordenadas = [...mensagens].sort((a, b) => Date.parse(a.criadaEm) - Date.parse(b.criadaEm));
  for (const m of ordenadas) {
    const corpo = normalizar(m.body);
    const em = Date.parse(m.criadaEm);
    const temCobranca = LINK_DE_PAGAMENTO.test(m.body);
    const citados = nomes.filter((n) => n.nome !== "" && (corpo.includes(n.nome) || m.body.includes(n.link)));
    for (const n of citados) {
      porProduto.get(n.chave)!.oferecidas.add(m.contactId);
      ultimoCitado.set(m.contactId, { chave: n.chave, em });
      const chaveDoDia = `${m.contactId}|${diaNoFuso(m.criadaEm, fuso)}`;
      const doDia = produtosDoDia.get(chaveDoDia) ?? new Set<string>();
      doDia.add(n.chave);
      produtosDoDia.set(chaveDoDia, doDia);
    }
    if (!temCobranca && !citados.some((n) => m.body.includes(n.link))) continue;
    if (citados.length > 0) {
      for (const n of citados) porProduto.get(n.chave)!.links.add(m.contactId);
      continue;
    }
    const ultimo = ultimoCitado.get(m.contactId);
    if (ultimo !== undefined && !Number.isNaN(em) && em - ultimo.em <= 24 * 3_600_000) {
      porProduto.get(ultimo.chave)!.links.add(m.contactId);
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
    const ehCompra = f.tipo === "charge" && f.centavos > 0;
    // Pós-venda é quem JÁ tinha comprado: a primeira compra fica de fora. Devolução só entra quando
    // havia ao menos duas compras antes (a dela e a anterior), senão é a devolução da primeira venda.
    if (f.comprasAntes < (ehCompra ? 1 : 2)) continue;
    const linha = out.get(slugDoProduto(p.nome))!;
    linha.receitaCentavos += f.centavos;
    if (ehCompra) linha.compras += 1;
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
    pool.query<{ contact_id: string | null; event_type: string; amount_cents: string | number; produto: string | null; compras_antes: string | number }>(
      `select r.contact_id, r.event_type, r.amount_cents, r.metadata->>'produto' as produto,
              (select count(*) from revenue_ledger x
                where x.organization_id = r.organization_id and x.contact_id = r.contact_id
                  and x.event_type = 'charge' and x.amount_cents > 0 and x.occurred_at < r.occurred_at) as compras_antes
         from revenue_ledger r
        where r.organization_id = $1 and r.occurred_at >= $2 and r.occurred_at < $3`,
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
    fatos.rows.map((f) => ({
      contactId: f.contact_id,
      tipo: f.event_type,
      centavos: Number(f.amount_cents),
      produto: f.produto,
      comprasAntes: Number(f.compras_antes),
    })),
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
