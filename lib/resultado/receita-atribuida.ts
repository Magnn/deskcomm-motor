/**
 * RECEITA ATRIBUÍDA — o dinheiro que entrou, ligado ao anúncio que trouxe a
 * pessoa, ao agente que a atendeu e ao fluxo que a acompanhou.
 *
 * FATO, não inferência: só usa o que está gravado.
 *   - o dinheiro vem do `revenue_ledger` (o aviso da Cakto: venda, reembolso,
 *     chargeback), nunca de um número digitado;
 *   - o anúncio é o PRIMEIRO TOQUE gravado no contato
 *     (`contacts.source_metadata`, por `fn_estampar_atribuicao_de_anuncio`);
 *   - o agente é o ÚLTIMO que respondeu numa conversa do contato ANTES do
 *     pagamento (`ai_agent_runs` pela conversa — a coluna `contact_id` das
 *     execuções não é preenchida, medido em produção);
 *   - o fluxo é o ÚLTIMO em que o contato entrou ANTES do pagamento
 *     (`followup_enrollments`).
 *
 * Cada regra tem nome na tela ("primeiro toque", "último antes da compra"):
 * atribuição sem a regra escrita ao lado é número que ninguém sabe ler.
 *
 * Reembolso e chargeback entram NEGATIVOS e pelas MESMAS regras: o anúncio que
 * trouxe a venda devolvida perde a receita, em vez de a devolução virar um
 * buraco sem dono.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type TipoDeFato = "charge" | "refund" | "chargeback" | "adjustment";

export interface FatoDeReceita {
  id: string;
  tipo: TipoDeFato;
  valorCentavos: number;
  ocorridoEm: string;
  contatoId: string | null;
}

export interface ToqueComData {
  id: string;
  nome: string;
  em: string;
}

export interface OrigemDoContato {
  /** `meta_ads` | `google_ads` | … — `null` quando o contato não veio de anúncio. */
  plataforma: string | null;
  anuncioId: string | null;
  anuncioTitulo: string | null;
}

export interface DadosParaAtribuir {
  fatos: FatoDeReceita[];
  origens: Map<string, OrigemDoContato>;
  /** Por contato: os agentes que responderam, com a hora da resposta. */
  agentes: Map<string, ToqueComData[]>;
  /** Por contato: os fluxos em que entrou, com a hora da entrada. */
  fluxos: Map<string, ToqueComData[]>;
}

export interface Fatia {
  chave: string;
  rotulo: string;
  receitaCentavos: number;
  vendas: number;
}

export interface ReceitaAtribuida {
  receitaLiquidaCentavos: number;
  receitaBrutaCentavos: number;
  devolvidoCentavos: number;
  vendas: number;
  ticketMedioCentavos: number;
  porOrigem: Fatia[];
  porAgente: Fatia[];
  porFluxo: Fatia[];
}

export const SEM_CONTATO = "nao_identificado";
export const SEM_ANUNCIO = "organico";
export const SEM_AGENTE = "sem_agente";
export const SEM_FLUXO = "sem_fluxo";

const ROTULOS_FIXOS: Record<string, string> = {
  [SEM_CONTATO]: "Pagamento sem contato identificado",
  [SEM_ANUNCIO]: "Sem anúncio (orgânico ou direto)",
  [SEM_AGENTE]: "Sem agente de IA antes da compra",
  [SEM_FLUXO]: "Sem fluxo antes da compra",
};

const ROTULO_DA_PLATAFORMA: Record<string, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
};

function sinal(f: FatoDeReceita): number {
  if (f.tipo === "charge") return f.valorCentavos;
  if (f.tipo === "refund" || f.tipo === "chargeback") return -f.valorCentavos;
  return f.valorCentavos; // adjustment já vem com sinal
}

/** O último toque ATÉ o momento do pagamento (inclusive). */
function ultimoAte(toques: ToqueComData[] | undefined, ate: string): ToqueComData | null {
  let melhor: ToqueComData | null = null;
  for (const t of toques ?? []) {
    if (t.em > ate) continue;
    if (!melhor || t.em > melhor.em) melhor = t;
  }
  return melhor;
}

function somar(mapa: Map<string, Fatia>, chave: string, rotulo: string, valor: number, ehVenda: boolean): void {
  const atual = mapa.get(chave) ?? { chave, rotulo, receitaCentavos: 0, vendas: 0 };
  atual.receitaCentavos += valor;
  if (ehVenda) atual.vendas += 1;
  mapa.set(chave, atual);
}

const ordenar = (m: Map<string, Fatia>): Fatia[] =>
  [...m.values()].sort((a, b) => b.receitaCentavos - a.receitaCentavos || a.rotulo.localeCompare(b.rotulo));

/** A conta inteira, pura: dados lidos → receita e as três fatias. */
export function atribuirReceita(d: DadosParaAtribuir): ReceitaAtribuida {
  const porOrigem = new Map<string, Fatia>();
  const porAgente = new Map<string, Fatia>();
  const porFluxo = new Map<string, Fatia>();
  let bruta = 0;
  let devolvido = 0;
  let vendas = 0;

  for (const f of d.fatos) {
    const valor = sinal(f);
    const ehVenda = f.tipo === "charge";
    if (ehVenda) {
      bruta += f.valorCentavos;
      vendas += 1;
    } else if (valor < 0) {
      devolvido += -valor;
    }

    if (!f.contatoId) {
      for (const m of [porOrigem, porAgente, porFluxo]) somar(m, SEM_CONTATO, ROTULOS_FIXOS[SEM_CONTATO]!, valor, ehVenda);
      continue;
    }

    const origem = d.origens.get(f.contatoId);
    if (origem?.plataforma) {
      const chave = `${origem.plataforma}:${origem.anuncioId ?? "sem_id"}`;
      const plataforma = ROTULO_DA_PLATAFORMA[origem.plataforma] ?? origem.plataforma;
      const rotulo = origem.anuncioTitulo
        ? `${plataforma} · ${origem.anuncioTitulo}`
        : origem.anuncioId
          ? `${plataforma} · anúncio ${origem.anuncioId}`
          : plataforma;
      somar(porOrigem, chave, rotulo, valor, ehVenda);
    } else {
      somar(porOrigem, SEM_ANUNCIO, ROTULOS_FIXOS[SEM_ANUNCIO]!, valor, ehVenda);
    }

    const agente = ultimoAte(d.agentes.get(f.contatoId), f.ocorridoEm);
    if (agente) somar(porAgente, agente.id, agente.nome, valor, ehVenda);
    else somar(porAgente, SEM_AGENTE, ROTULOS_FIXOS[SEM_AGENTE]!, valor, ehVenda);

    const fluxo = ultimoAte(d.fluxos.get(f.contatoId), f.ocorridoEm);
    if (fluxo) somar(porFluxo, fluxo.id, fluxo.nome, valor, ehVenda);
    else somar(porFluxo, SEM_FLUXO, ROTULOS_FIXOS[SEM_FLUXO]!, valor, ehVenda);
  }

  const liquida = bruta - devolvido;
  return {
    receitaLiquidaCentavos: liquida,
    receitaBrutaCentavos: bruta,
    devolvidoCentavos: devolvido,
    vendas,
    ticketMedioCentavos: vendas > 0 ? Math.round(bruta / vendas) : 0,
    porOrigem: ordenar(porOrigem),
    porAgente: ordenar(porAgente),
    porFluxo: ordenar(porFluxo),
  };
}

// ── Leitura ─────────────────────────────────────────────────────────────────

/** Teto de pagamentos por período: acima disto a tela avisa que cortou. */
export const TETO_DE_FATOS = 5000;
const LOTE = 300;

function lotes<T>(itens: T[]): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < itens.length; i += LOTE) saida.push(itens.slice(i, i + LOTE));
  return saida;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Lê os fatos do período e tudo de que a regra precisa — sempre escopado pela organização. */
export async function lerDadosParaAtribuir(
  db: SupabaseClient,
  organizationId: string,
  periodo: { inicio: Date; fim: Date },
): Promise<DadosParaAtribuir & { cortado: boolean }> {
  const { data: linhas, error } = await db
    .from("revenue_ledger")
    .select("id, event_type, amount_cents, occurred_at, contact_id")
    .eq("organization_id", organizationId)
    .gte("occurred_at", periodo.inicio.toISOString())
    .lte("occurred_at", periodo.fim.toISOString())
    .order("occurred_at", { ascending: true })
    .limit(TETO_DE_FATOS + 1);
  if (error) throw new Error(`receita: leitura do ledger falhou: ${error.message}`);

  const brutos = (linhas ?? []) as { id: string; event_type: TipoDeFato; amount_cents: number | string; occurred_at: string; contact_id: string | null }[];
  const cortado = brutos.length > TETO_DE_FATOS;
  const fatos: FatoDeReceita[] = brutos.slice(0, TETO_DE_FATOS).map((l) => ({
    id: l.id,
    tipo: l.event_type,
    valorCentavos: Number(l.amount_cents),
    ocorridoEm: new Date(l.occurred_at).toISOString(),
    contatoId: l.contact_id,
  }));

  const contatos = [...new Set(fatos.map((f) => f.contatoId).filter((c): c is string => !!c))];
  const origens = new Map<string, OrigemDoContato>();
  const agentes = new Map<string, ToqueComData[]>();
  const fluxos = new Map<string, ToqueComData[]>();
  if (contatos.length === 0) return { fatos, origens, agentes, fluxos, cortado };

  // Origem: o primeiro toque gravado no contato.
  for (const lote of lotes(contatos)) {
    const { data, error: e } = await db
      .from("contacts")
      .select("id, source_metadata")
      .eq("organization_id", organizationId)
      .in("id", lote);
    if (e) throw new Error(`receita: leitura dos contatos falhou: ${e.message}`);
    for (const c of (data ?? []) as { id: string; source_metadata: Record<string, unknown> | null }[]) {
      const m = c.source_metadata ?? {};
      origens.set(c.id, { plataforma: str(m.ad_platform), anuncioId: str(m.ad_id), anuncioTitulo: str(m.ad_title) });
    }
  }

  // Agente: execuções nas conversas do contato (a execução não grava o contato).
  const conversaDoContato = new Map<string, string>();
  for (const lote of lotes(contatos)) {
    const { data, error: e } = await db
      .from("conversations")
      .select("id, contact_id")
      .eq("organization_id", organizationId)
      .in("contact_id", lote);
    if (e) throw new Error(`receita: leitura das conversas falhou: ${e.message}`);
    for (const c of (data ?? []) as { id: string; contact_id: string }[]) conversaDoContato.set(c.id, c.contact_id);
  }
  const fimIso = periodo.fim.toISOString();
  const nomesDosAgentes = new Map<string, string>();
  const execucoes: { conversation_id: string; agent_id: string; started_at: string }[] = [];
  for (const lote of lotes([...conversaDoContato.keys()])) {
    const { data, error: e } = await db
      .from("ai_agent_runs")
      .select("conversation_id, agent_id, started_at")
      .eq("organization_id", organizationId)
      .eq("is_dry_run", false)
      .eq("status", "completed")
      .lte("started_at", fimIso)
      .in("conversation_id", lote);
    if (e) throw new Error(`receita: leitura das execuções falhou: ${e.message}`);
    execucoes.push(...((data ?? []) as typeof execucoes));
  }
  const idsDosAgentes = [...new Set(execucoes.map((x) => x.agent_id))];
  for (const lote of lotes(idsDosAgentes)) {
    const { data } = await db.from("ai_agents").select("id, name").eq("organization_id", organizationId).in("id", lote);
    for (const a of (data ?? []) as { id: string; name: string }[]) nomesDosAgentes.set(a.id, a.name);
  }
  for (const x of execucoes) {
    const contato = conversaDoContato.get(x.conversation_id);
    if (!contato) continue;
    const lista = agentes.get(contato) ?? [];
    lista.push({ id: x.agent_id, nome: nomesDosAgentes.get(x.agent_id) ?? "Agente removido", em: new Date(x.started_at).toISOString() });
    agentes.set(contato, lista);
  }

  // Fluxo: as entradas do contato em fluxos.
  const inscricoes: { contact_id: string; pointer_id: string; started_at: string }[] = [];
  for (const lote of lotes(contatos)) {
    const { data, error: e } = await db
      .from("followup_enrollments")
      .select("contact_id, pointer_id, started_at")
      .eq("organization_id", organizationId)
      .lte("started_at", fimIso)
      .in("contact_id", lote);
    if (e) throw new Error(`receita: leitura dos fluxos falhou: ${e.message}`);
    inscricoes.push(...((data ?? []) as typeof inscricoes));
  }
  const nomesDosFluxos = new Map<string, string>();
  for (const lote of lotes([...new Set(inscricoes.map((i) => i.pointer_id))])) {
    const { data } = await db.from("followup_flow_pointers").select("id, name").eq("organization_id", organizationId).in("id", lote);
    for (const p of (data ?? []) as { id: string; name: string }[]) nomesDosFluxos.set(p.id, p.name);
  }
  for (const i of inscricoes) {
    const lista = fluxos.get(i.contact_id) ?? [];
    lista.push({ id: i.pointer_id, nome: nomesDosFluxos.get(i.pointer_id) ?? "Fluxo removido", em: new Date(i.started_at).toISOString() });
    fluxos.set(i.contact_id, lista);
  }

  return { fatos, origens, agentes, fluxos, cortado };
}
