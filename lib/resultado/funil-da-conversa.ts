/**
 * FUNIL DA CONVERSA e ONDE ELA PARA — das conversas que começaram no período,
 * quantas foram atendidas, quantas receberam a oferta, quantas compraram, e em
 * que ponto as outras ficaram.
 *
 * Só FATO gravado:
 *   - atendida            = a conversa tem resposta (`last_outbound_at`);
 *   - recebeu a oferta    = há marco `oferta_apresentada` (`conversation_milestones`);
 *   - objetou             = há marco `objecao`;
 *   - comprou             = o contato tem venda no `revenue_ledger` DEPOIS de a
 *                           conversa começar.
 *
 * As paradas são excludentes e somam com "compraram" o total do período: cada
 * conversa cai em UMA casa, a mais avançada a que chegou. Sem isso o mesmo lead
 * apareceria em duas listas e a soma passaria do total.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ConversaParaFunil {
  id: string;
  contatoId: string | null;
  criadaEm: string;
  ultimaEntradaEm: string | null;
  ultimaSaidaEm: string | null;
  /** O marco de oferta mais recente da conversa. */
  ofertaEm: string | null;
  temObjecao: boolean;
  comprou: boolean;
}

export type Parada =
  | "sem_atendimento"
  | "atendida_sem_oferta"
  | "oferta_sem_resposta"
  | "objecao_sem_compra"
  | "conversou_e_nao_comprou";

export interface FunilDaConversa {
  etapas: { chave: "iniciadas" | "atendidas" | "com_oferta" | "compraram"; total: number }[];
  paradas: { chave: Parada; total: number; conversas: string[] }[];
}

/** Quantas conversas a tela lista por parada (o total é sempre o real). */
export const AMOSTRA_POR_PARADA = 50;

export function ondeParou(c: ConversaParaFunil): Parada | "comprou" {
  if (c.comprou) return "comprou";
  if (!c.ultimaSaidaEm) return "sem_atendimento";
  if (!c.ofertaEm) return "atendida_sem_oferta";
  if (c.temObjecao) return "objecao_sem_compra";
  // A pessoa não falou mais nada depois de ver a oferta.
  if (!c.ultimaEntradaEm || c.ultimaEntradaEm <= c.ofertaEm) return "oferta_sem_resposta";
  return "conversou_e_nao_comprou";
}

const ORDEM_DAS_PARADAS: Parada[] = [
  "sem_atendimento",
  "atendida_sem_oferta",
  "oferta_sem_resposta",
  "objecao_sem_compra",
  "conversou_e_nao_comprou",
];

export function montarFunil(conversas: readonly ConversaParaFunil[]): FunilDaConversa {
  const paradas = new Map<Parada, string[]>(ORDEM_DAS_PARADAS.map((p) => [p, []]));
  let atendidas = 0;
  let comOferta = 0;
  let compraram = 0;
  for (const c of conversas) {
    if (c.ultimaSaidaEm) atendidas += 1;
    if (c.ofertaEm) comOferta += 1;
    const casa = ondeParou(c);
    if (casa === "comprou") compraram += 1;
    else paradas.get(casa)!.push(c.id);
  }
  return {
    etapas: [
      { chave: "iniciadas", total: conversas.length },
      { chave: "atendidas", total: atendidas },
      { chave: "com_oferta", total: comOferta },
      { chave: "compraram", total: compraram },
    ],
    paradas: ORDEM_DAS_PARADAS.map((chave) => {
      const ids = paradas.get(chave)!;
      return { chave, total: ids.length, conversas: ids.slice(0, AMOSTRA_POR_PARADA) };
    }),
  };
}

// ── Leitura ─────────────────────────────────────────────────────────────────

export const TETO_DE_CONVERSAS = 5000;
const LOTE = 300;

function lotes<T>(itens: T[]): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < itens.length; i += LOTE) saida.push(itens.slice(i, i + LOTE));
  return saida;
}

const iso = (v: string | null): string | null => (v ? new Date(v).toISOString() : null);

export async function lerConversasParaFunil(
  db: SupabaseClient,
  organizationId: string,
  periodo: { inicio: Date; fim: Date },
): Promise<{ conversas: ConversaParaFunil[]; cortado: boolean }> {
  const { data, error } = await db
    .from("conversations")
    .select("id, contact_id, created_at, last_inbound_at, last_outbound_at")
    .eq("organization_id", organizationId)
    .eq("is_group", false)
    .gte("created_at", periodo.inicio.toISOString())
    .lte("created_at", periodo.fim.toISOString())
    .order("created_at", { ascending: true })
    .limit(TETO_DE_CONVERSAS + 1);
  if (error) throw new Error(`funil: leitura das conversas falhou: ${error.message}`);
  const brutas = (data ?? []) as { id: string; contact_id: string | null; created_at: string; last_inbound_at: string | null; last_outbound_at: string | null }[];
  const cortado = brutas.length > TETO_DE_CONVERSAS;
  const linhas = brutas.slice(0, TETO_DE_CONVERSAS);

  const ofertaPorConversa = new Map<string, string>();
  const comObjecao = new Set<string>();
  for (const lote of lotes(linhas.map((l) => l.id))) {
    const { data: marcos, error: e } = await db
      .from("conversation_milestones")
      .select("conversation_id, kind, occurred_at")
      .eq("organization_id", organizationId)
      .in("conversation_id", lote);
    if (e) throw new Error(`funil: leitura dos marcos falhou: ${e.message}`);
    for (const m of (marcos ?? []) as { conversation_id: string; kind: string; occurred_at: string }[]) {
      if (m.kind === "objecao") comObjecao.add(m.conversation_id);
      if (m.kind !== "oferta_apresentada") continue;
      const em = new Date(m.occurred_at).toISOString();
      const atual = ofertaPorConversa.get(m.conversation_id);
      if (!atual || em > atual) ofertaPorConversa.set(m.conversation_id, em);
    }
  }

  // Vendas por contato: a primeira venda de cada um basta para "comprou depois de a conversa começar"
  // quando comparada com a conversa mais antiga — por isso guardamos TODAS as datas.
  const vendasPorContato = new Map<string, string[]>();
  const contatos = [...new Set(linhas.map((l) => l.contact_id).filter((c): c is string => !!c))];
  for (const lote of lotes(contatos)) {
    const { data: vendas, error: e } = await db
      .from("revenue_ledger")
      .select("contact_id, occurred_at")
      .eq("organization_id", organizationId)
      .eq("event_type", "charge")
      .in("contact_id", lote);
    if (e) throw new Error(`funil: leitura das vendas falhou: ${e.message}`);
    for (const v of (vendas ?? []) as { contact_id: string; occurred_at: string }[]) {
      const lista = vendasPorContato.get(v.contact_id) ?? [];
      lista.push(new Date(v.occurred_at).toISOString());
      vendasPorContato.set(v.contact_id, lista);
    }
  }

  const conversas = linhas.map((l): ConversaParaFunil => {
    const criadaEm = new Date(l.created_at).toISOString();
    return {
      id: l.id,
      contatoId: l.contact_id,
      criadaEm,
      ultimaEntradaEm: iso(l.last_inbound_at),
      ultimaSaidaEm: iso(l.last_outbound_at),
      ofertaEm: ofertaPorConversa.get(l.id) ?? null,
      temObjecao: comObjecao.has(l.id),
      comprou: !!l.contact_id && (vendasPorContato.get(l.contact_id) ?? []).some((em) => em >= criadaEm),
    };
  });
  return { conversas, cortado };
}
