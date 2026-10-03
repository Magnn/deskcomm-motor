/**
 * MOTIVO DA PERDA — por que a conversa que recebeu a oferta não virou venda.
 *
 * Três origens, e nunca misturadas (`conversation_loss_reasons.source`, 0914):
 *   regra   — FATO: a pessoa não escreveu mais nada depois da oferta → `sem_resposta`;
 *   ia      — INFERÊNCIA: um modelo lê a conversa e escolhe UM motivo do
 *             vocabulário fechado, com a confiança dele;
 *   humano  — CORREÇÃO: alguém trocou na tela. Vence, e nunca é reescrita.
 *
 * ─── Quem é candidata ───────────────────────────────────────────────────────
 * Conversa que recebeu a oferta, não comprou, e está parada há
 * `SILENCIO_MINIMO_MS` (dois dias): antes disso ela ainda pode fechar, e
 * carimbar "perdida" numa conversa viva seria errar por pressa.
 *
 * ─── Custo ──────────────────────────────────────────────────────────────────
 * A inferência gasta IA, pelo ponto `loss_reason_classify` — com o teto de gasto
 * e a chave de sempre (`runModelCall`). É disparada por uma PESSOA (o botão
 * "Analisar" do painel), em lote pequeno: nenhum gasto acontece sem alguém pedir.
 *
 * ─── O que nunca sai daqui para o banco ─────────────────────────────────────
 * O texto da conversa vai ao modelo e volta só como rótulo + número. Nenhum
 * trecho nem justificativa é gravado (LGPD).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ondeParou, type ConversaParaFunil } from "./funil-da-conversa";

export const MOTIVOS = ["preco", "confianca", "sem_urgencia", "timing", "concorrente", "sem_resposta", "outro"] as const;
export type Motivo = (typeof MOTIVOS)[number];
export type OrigemDoMotivo = "regra" | "ia" | "humano";

export const ROTULO_DO_MOTIVO: Record<Motivo, string> = {
  preco: "Preço",
  confianca: "Falta de confiança",
  sem_urgencia: "Sem urgência",
  timing: "Não é o momento",
  concorrente: "Foi para um concorrente",
  sem_resposta: "Parou de responder",
  outro: "Outro motivo",
};

/** O que o modelo recebe sobre cada motivo — a definição é o que evita dois motivos para a mesma coisa. */
const DEFINICAO: Record<Exclude<Motivo, "sem_resposta">, string> = {
  preco: "achou caro, pediu desconto, disse que não tem dinheiro ou comparou com algo mais barato",
  confianca: "duvidou que funciona, pediu prova, garantia ou referência, ou desconfiou da empresa",
  sem_urgencia: "disse que vai pensar, ver depois ou que não precisa disso agora, sem dar data",
  timing: "quer, mas não agora por um motivo concreto de tempo (viagem, pagamento só no mês que vem, outra prioridade)",
  concorrente: "disse que comprou, fechou ou vai fechar com outra empresa",
  outro: "nenhum dos anteriores descreve bem o que aconteceu",
};

export const SILENCIO_MINIMO_MS = 48 * 60 * 60 * 1000;
export const LOTE_DA_ANALISE = 20;
const MENSAGENS_NO_PEDIDO = 30;
const CORTE_DA_MENSAGEM = 300;

export interface MensagemDaConversa {
  direction: string;
  body: string | null;
}

/** O pedido ao modelo. Puro. */
export function montarPedido(mensagens: readonly MensagemDaConversa[]): string {
  const falas = mensagens
    .filter((m) => (m.body ?? "").trim() !== "")
    .slice(-MENSAGENS_NO_PEDIDO)
    .map((m) => `${m.direction === "inbound" ? "Cliente" : "Empresa"}: ${(m.body ?? "").trim().slice(0, CORTE_DA_MENSAGEM)}`);
  return [
    "Você analisa uma conversa de vendas que NÃO terminou em compra. Você NÃO responde ao cliente.",
    "Escolha UM motivo, o que melhor explica por que a venda não aconteceu, olhando só o que o CLIENTE disse.",
    "",
    "Motivos possíveis:",
    ...Object.entries(DEFINICAO).map(([id, def]) => `- ${id}: ${def}`),
    "",
    'Responda SOMENTE com JSON, sem explicação: {"motivo": "<um dos motivos acima>", "confianca": <inteiro de 0 a 100>}.',
    "A confiança é o quanto a conversa deixa o motivo claro. Se o cliente não deu pista nenhuma, use \"outro\" com confiança baixa.",
    "",
    "## Conversa",
    ...falas,
  ].join("\n");
}

/** A resposta do modelo, só se couber no vocabulário. Puro. */
export function lerResposta(texto: string): { motivo: Motivo; confianca: number } | null {
  const m = /\{[\s\S]*\}/.exec(texto);
  if (!m) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const motivo = typeof obj.motivo === "string" ? obj.motivo : "";
  // `sem_resposta` é FATO e vem só da regra: o modelo não pode escolhê-lo.
  if (!(MOTIVOS as readonly string[]).includes(motivo) || motivo === "sem_resposta") return null;
  const bruto = typeof obj.confianca === "number" ? obj.confianca : Number(obj.confianca);
  if (!Number.isFinite(bruto)) return null;
  return { motivo: motivo as Motivo, confianca: Math.max(0, Math.min(100, Math.round(bruto))) };
}

/** O que fazer com uma conversa candidata. Puro. */
export function destinoDaConversa(c: ConversaParaFunil): { por: "regra"; motivo: Motivo } | { por: "ia" } | null {
  const parada = ondeParou(c);
  if (parada === "oferta_sem_resposta") return { por: "regra", motivo: "sem_resposta" };
  if (parada === "objecao_sem_compra" || parada === "conversou_e_nao_comprou") return { por: "ia" };
  // Comprou, nunca foi atendida ou nunca recebeu a oferta: não é "perda da oferta".
  return null;
}

// ── Leitura e gravação ──────────────────────────────────────────────────────

const LOTE = 300;
function lotes<T>(itens: T[]): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < itens.length; i += LOTE) saida.push(itens.slice(i, i + LOTE));
  return saida;
}
const iso = (v: string | null): string | null => (v ? new Date(v).toISOString() : null);

/** As conversas que receberam a oferta, não compraram, estão paradas e ainda não têm motivo. */
export async function conversasPendentes(
  db: SupabaseClient,
  organizationId: string,
  agora: Date,
): Promise<ConversaParaFunil[]> {
  const { data: marcos, error } = await db
    .from("conversation_milestones")
    .select("conversation_id, kind, occurred_at")
    .eq("organization_id", organizationId)
    .order("occurred_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`perda: leitura dos marcos falhou: ${error.message}`);
  const ofertaEm = new Map<string, string>();
  const comObjecao = new Set<string>();
  for (const m of (marcos ?? []) as { conversation_id: string; kind: string; occurred_at: string }[]) {
    if (m.kind === "objecao") comObjecao.add(m.conversation_id);
    else if (m.kind === "oferta_apresentada") {
      const em = new Date(m.occurred_at).toISOString();
      const atual = ofertaEm.get(m.conversation_id);
      if (!atual || em > atual) ofertaEm.set(m.conversation_id, em);
    }
  }
  const comOferta = [...ofertaEm.keys()];
  if (comOferta.length === 0) return [];

  const jaTem = new Set<string>();
  const linhas: { id: string; contact_id: string | null; created_at: string; last_inbound_at: string | null; last_outbound_at: string | null; last_message_at: string | null }[] = [];
  for (const lote of lotes(comOferta)) {
    const { data: feitas, error: e1 } = await db
      .from("conversation_loss_reasons")
      .select("conversation_id")
      .eq("organization_id", organizationId)
      .in("conversation_id", lote);
    if (e1) throw new Error(`perda: leitura dos motivos falhou: ${e1.message}`);
    for (const f of (feitas ?? []) as { conversation_id: string }[]) jaTem.add(f.conversation_id);
    const { data: cs, error: e2 } = await db
      .from("conversations")
      .select("id, contact_id, created_at, last_inbound_at, last_outbound_at, last_message_at")
      .eq("organization_id", organizationId)
      .eq("is_group", false)
      .in("id", lote);
    if (e2) throw new Error(`perda: leitura das conversas falhou: ${e2.message}`);
    linhas.push(...((cs ?? []) as typeof linhas));
  }

  const limite = agora.getTime() - SILENCIO_MINIMO_MS;
  const paradas = linhas.filter((l) => !jaTem.has(l.id) && new Date(l.last_message_at ?? l.created_at).getTime() <= limite);

  const vendas = new Map<string, string[]>();
  const contatos = [...new Set(paradas.map((l) => l.contact_id).filter((c): c is string => !!c))];
  for (const lote of lotes(contatos)) {
    const { data: vs, error: e } = await db
      .from("revenue_ledger")
      .select("contact_id, occurred_at")
      .eq("organization_id", organizationId)
      .eq("event_type", "charge")
      .in("contact_id", lote);
    if (e) throw new Error(`perda: leitura das vendas falhou: ${e.message}`);
    for (const v of (vs ?? []) as { contact_id: string; occurred_at: string }[]) {
      vendas.set(v.contact_id, [...(vendas.get(v.contact_id) ?? []), new Date(v.occurred_at).toISOString()]);
    }
  }

  return paradas
    .map((l): ConversaParaFunil => {
      const criadaEm = new Date(l.created_at).toISOString();
      return {
        id: l.id,
        contatoId: l.contact_id,
        criadaEm,
        ultimaEntradaEm: iso(l.last_inbound_at),
        ultimaSaidaEm: iso(l.last_outbound_at),
        ofertaEm: ofertaEm.get(l.id) ?? null,
        temObjecao: comObjecao.has(l.id),
        comprou: !!l.contact_id && (vendas.get(l.contact_id) ?? []).some((em) => em >= criadaEm),
      };
    })
    .filter((c) => destinoDaConversa(c) !== null);
}

export interface DepsDaAnalise {
  /** Lê a conversa e devolve o motivo inferido; lança quando a IA não pôde responder (teto, chave, provedor). */
  inferir(conversa: ConversaParaFunil, mensagens: MensagemDaConversa[]): Promise<{ motivo: Motivo; confianca: number; modelo: string | null } | null>;
}

export interface ResultadoDaAnalise {
  porRegra: number;
  porIa: number;
  semLeitura: number;
  /** A IA parou no meio (teto de gasto, chave, provedor): o motivo, para a tela dizer. */
  interrompida: string | null;
  restantes: number;
}

/** Uma análise: até `LOTE_DA_ANALISE` conversas. Regra primeiro (não custa nada), IA depois. */
export async function analisarPendentes(
  db: SupabaseClient,
  deps: DepsDaAnalise,
  organizationId: string,
  agora: Date,
): Promise<ResultadoDaAnalise> {
  const pendentes = await conversasPendentes(db, organizationId, agora);
  const r: ResultadoDaAnalise = { porRegra: 0, porIa: 0, semLeitura: 0, interrompida: null, restantes: 0 };

  const gravar = async (conversationId: string, linha: { reason: Motivo; confidence: number | null; source: OrigemDoMotivo; model: string | null }) => {
    // `ignoreDuplicates`: se alguém corrigiu à mão enquanto a análise rodava, a correção fica.
    const { error } = await db
      .from("conversation_loss_reasons")
      .upsert({ organization_id: organizationId, conversation_id: conversationId, ...linha, classified_at: agora.toISOString() }, { onConflict: "conversation_id", ignoreDuplicates: true });
    if (error) throw new Error(`perda: gravação do motivo falhou: ${error.message}`);
  };

  const paraIa: ConversaParaFunil[] = [];
  for (const c of pendentes) {
    const destino = destinoDaConversa(c);
    if (destino?.por === "regra") {
      await gravar(c.id, { reason: destino.motivo, confidence: 100, source: "regra", model: null });
      r.porRegra += 1;
    } else if (destino?.por === "ia") {
      paraIa.push(c);
    }
  }

  const lote = paraIa.slice(0, LOTE_DA_ANALISE);
  let feitas = 0;
  for (const c of lote) {
    const { data, error } = await db
      .from("messages")
      .select("direction, body, created_at")
      .eq("organization_id", organizationId)
      .eq("conversation_id", c.id)
      .order("created_at", { ascending: false })
      .limit(MENSAGENS_NO_PEDIDO);
    if (error) throw new Error(`perda: leitura das mensagens falhou: ${error.message}`);
    const mensagens = ((data ?? []) as (MensagemDaConversa & { created_at: string })[]).reverse();
    let inferido: Awaited<ReturnType<DepsDaAnalise["inferir"]>>;
    try {
      inferido = await deps.inferir(c, mensagens);
    } catch (err) {
      // Teto de gasto, chave ou provedor: insistir nas próximas daria o mesmo erro N vezes.
      r.interrompida = err instanceof Error ? err.message.slice(0, 200) : String(err);
      break;
    }
    feitas += 1;
    if (!inferido) {
      r.semLeitura += 1;
      continue;
    }
    await gravar(c.id, { reason: inferido.motivo, confidence: inferido.confianca, source: "ia", model: inferido.modelo });
    r.porIa += 1;
  }
  r.restantes = paraIa.length - feitas;
  return r;
}

/** A correção de uma pessoa: vence a inferência e fica marcada como humana. */
export async function corrigirMotivo(
  db: SupabaseClient,
  input: { organizationId: string; conversationId: string; motivo: Motivo; userId: string; agora: Date },
): Promise<boolean> {
  // A conversa tem de ser DESTA organização — o id vem da tela.
  const { data: conversa, error: e } = await db
    .from("conversations")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("id", input.conversationId)
    .maybeSingle();
  if (e) throw new Error(`perda: leitura da conversa falhou: ${e.message}`);
  if (!conversa) return false;
  const { error } = await db.from("conversation_loss_reasons").upsert(
    {
      organization_id: input.organizationId,
      conversation_id: input.conversationId,
      reason: input.motivo,
      confidence: null,
      source: "humano",
      model: null,
      classified_at: input.agora.toISOString(),
      corrected_by: input.userId,
    },
    { onConflict: "conversation_id" },
  );
  if (error) throw new Error(`perda: correção não gravada: ${error.message}`);
  return true;
}

export interface PainelDePerdas {
  porMotivo: { motivo: Motivo; total: number; confiancaMedia: number | null }[];
  conversas: { conversaId: string; motivo: Motivo; confianca: number | null; origem: OrigemDoMotivo; em: string }[];
  pendentes: number;
}

export async function lerPainelDePerdas(
  db: SupabaseClient,
  organizationId: string,
  periodo: { inicio: Date; fim: Date },
  agora: Date,
): Promise<PainelDePerdas> {
  const { data, error } = await db
    .from("conversation_loss_reasons")
    .select("conversation_id, reason, confidence, source, classified_at")
    .eq("organization_id", organizationId)
    .gte("classified_at", periodo.inicio.toISOString())
    .lte("classified_at", periodo.fim.toISOString())
    .order("classified_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(`perda: leitura do painel falhou: ${error.message}`);
  const linhas = (data ?? []) as { conversation_id: string; reason: Motivo; confidence: number | null; source: OrigemDoMotivo; classified_at: string }[];

  const porMotivo = MOTIVOS.map((motivo) => {
    const dele = linhas.filter((l) => l.reason === motivo);
    // A confiança média é só da INFERÊNCIA: fato e correção não têm "confiança".
    const daIa = dele.filter((l) => l.source === "ia" && l.confidence !== null);
    return {
      motivo,
      total: dele.length,
      confiancaMedia: daIa.length > 0 ? Math.round(daIa.reduce((s, l) => s + (l.confidence ?? 0), 0) / daIa.length) : null,
    };
  })
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total);

  return {
    porMotivo,
    conversas: linhas.slice(0, 100).map((l) => ({ conversaId: l.conversation_id, motivo: l.reason, confianca: l.confidence, origem: l.source, em: l.classified_at })),
    pendentes: (await conversasPendentes(db, organizationId, agora)).length,
  };
}
