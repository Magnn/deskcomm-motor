/**
 * AS VENDAS DE UM AGENTE — o recorte do painel quando a organização vende mais de uma coisa.
 *
 * Medido em 27/11/2026: o caixa de uma organização somava a venda do agente de atendimento com a de outra
 * oferta (um pacote vendido pelo site, por outro checkout), e o dono pediu o painel só com os serviços do agente.
 *
 * A venda é do agente quando:
 *   1. o contato da cobrança recebeu mensagem dele (`messages.metadata.ai_actor_id`) — cobre o que ele vendeu na
 *      conversa e o que a mesma pessoa comprou depois em outro lugar da casa (área do cliente);
 *   2. sem contato (pagamento lançado à mão sem ficha), quando o nome do produto é um dos produtos dele (aba Preço
 *      e Catálogo), sem o prefixo de quantidade ("2× Pergunta nova").
 *
 * O canal NÃO serve de régua: medido, 143 de 255 vendas do mês eram de contatos cujas conversas ficaram em números
 * antigos, que já não estão ligados ao agente.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { catalogoSchema } from "@/lib/catalogo/tipos";
import { lerPricing } from "@/lib/preco/tipos";

/** Nome comparável: sem quantidade na frente, sem acento, minúsculo. Pura. */
export function nomeComparavel(nome: string): string {
  return nome
    .replace(/^\s*\d+\s*[×x]\s*/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Os nomes de produto que o agente cobra (aba Preço e Catálogo), já comparáveis. Pura. */
export function nomesDosProdutosDoAgente(config: unknown): Set<string> {
  const nomes = new Set<string>();
  const add = (n: unknown) => {
    if (typeof n === "string" && n.trim() !== "") nomes.add(nomeComparavel(n));
  };
  const pricing = lerPricing(config);
  if (pricing) {
    for (const l of pricing.list_product_links ?? []) add(l.name);
    for (const d of pricing.steps) for (const l of d.product_links ?? []) add(l.name);
    for (const e of pricing.extras ?? []) add(e.name);
    for (const l of pricing.post_sale?.product_links ?? []) add(l.name);
    for (const o of pricing.post_sale?.next_offers ?? []) for (const l of o.product_links) add(l.name);
  }
  const bruto = config !== null && typeof config === "object" ? (config as Record<string, unknown>).catalog : undefined;
  const catalogo = catalogoSchema.safeParse(bruto);
  if (catalogo.success) for (const p of catalogo.data.produtos) add(p.nome);
  return nomes;
}

/** A venda do painel, no recorte que esta régua lê. */
export interface VendaParaAgente {
  contact_id: string | null;
  /** O nome do produto (`notes` na venda do painel). */
  notes: string | null;
}

/** A venda é do agente? Pura. */
export function vendaEhDoAgente(
  venda: VendaParaAgente,
  contatosAtendidos: ReadonlySet<string>,
  nomesDoAgente: ReadonlySet<string>,
): boolean {
  if (venda.contact_id) return contatosAtendidos.has(venda.contact_id);
  return venda.notes !== null && nomesDoAgente.has(nomeComparavel(venda.notes));
}

const LOTE = 200;

/** Dos contatos dados, os que receberam mensagem do agente. */
export async function contatosAtendidosPeloAgente(
  db: SupabaseClient,
  organizationId: string,
  agentId: string,
  contactIds: readonly string[],
): Promise<Set<string>> {
  const atendidos = new Set<string>();
  const unicos = [...new Set(contactIds)];
  for (let i = 0; i < unicos.length; i += LOTE) {
    const { data, error } = await db
      .from("messages")
      .select("contact_id")
      .eq("organization_id", organizationId)
      .eq("direction", "outbound")
      .eq("metadata->>ai_actor_id", agentId)
      .in("contact_id", unicos.slice(i, i + LOTE));
    if (error) throw new Error(`vendas do agente: leitura das mensagens falhou: ${error.message}`);
    for (const m of (data ?? []) as { contact_id: string | null }[]) if (m.contact_id) atendidos.add(m.contact_id);
  }
  return atendidos;
}

/** Os canais ligados ao agente (`ai_agent_numeros`). */
export async function canaisDoAgente(db: SupabaseClient, organizationId: string, agentId: string): Promise<string[]> {
  const { data, error } = await db
    .from("ai_agent_numeros")
    .select("channel_session_id")
    .eq("organization_id", organizationId)
    .eq("agent_id", agentId);
  if (error) throw new Error(`vendas do agente: leitura dos canais falhou: ${error.message}`);
  return ((data ?? []) as { channel_session_id: string }[]).map((r) => r.channel_session_id);
}

/** Filtra as vendas (comanda e gateway) pelo agente, lendo os contatos atendidos uma vez só. */
export async function filtrarVendasDoAgente<V extends VendaParaAgente>(
  db: SupabaseClient,
  organizationId: string,
  agentId: string,
  nomesDoAgente: ReadonlySet<string>,
  ...listas: V[][]
): Promise<V[][]> {
  const contatos = listas.flat().map((v) => v.contact_id).filter((c): c is string => !!c);
  const atendidos = await contatosAtendidosPeloAgente(db, organizationId, agentId, contatos);
  return listas.map((l) => l.filter((v) => vendaEhDoAgente(v, atendidos, nomesDoAgente)));
}

/** O valor da URL que pede a organização inteira, mesmo havendo agente padrão. */
export const TODOS_OS_AGENTES = "todos";

/** O agente padrão do painel gravado na organização (`settings.painel.agente_id`). Pura. */
export function agentePadraoDoPainel(settings: unknown): string | null {
  const painel = settings !== null && typeof settings === "object" ? (settings as Record<string, unknown>).painel : null;
  const id = painel !== null && typeof painel === "object" ? (painel as Record<string, unknown>).agente_id : null;
  return typeof id === "string" && id !== "" ? id : null;
}

/**
 * O agente do recorte: o da URL, senão o padrão da organização; `todos` ou um id que não é agente vivo desta
 * organização = sem recorte (nunca confia no id da URL sem conferir na lista da própria organização). Pura.
 */
export function agenteDoPainel<A extends { id: string }>(
  daUrl: string | null,
  settings: unknown,
  agentes: readonly A[],
): A | null {
  if (daUrl === TODOS_OS_AGENTES) return null;
  const id = daUrl ?? agentePadraoDoPainel(settings);
  return id ? agentes.find((a) => a.id === id) ?? null : null;
}
