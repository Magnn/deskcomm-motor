/**
 * PALAVRA-CHAVE DE FLUXO NUM NÚMERO QUE É DO AGENTE.
 *
 * ─── O buraco ─────────────────────────────────────────────────────────────────────────
 * A regra é "um número, um dono" (`channel-flow-config.ts`): ou um fluxo, ou o agente de IA. A
 * caixa "Início" com palavra-chave só era lida quando o número era DO fluxo. Medido em produção
 * em 11/10/2026: um fluxo de oferta publicado com a palavra-chave do anúncio, no mesmo número em
 * que o agente atende. Ele nunca começaria — quem mandasse a frase do anúncio seria atendido
 * pelo agente, com outra oferta, e o fluxo ficaria publicado, ativo e sem nenhuma inscrição.
 *
 * ─── A regra nova, estreita ───────────────────────────────────────────────────────────
 * O agente continua dono do número. Só duas coisas mudam, e só para fluxo publicado cuja caixa
 * "Início" é WhatsApp + palavra-chave:
 *   1. mensagem que CONTÉM a palavra-chave inscreve a pessoa nesse fluxo, e o agente não é
 *      acordado para essa mensagem;
 *   2. enquanto a inscrição nesse fluxo estiver viva, as mensagens da pessoa são do fluxo (é ele
 *      que está perguntando), e o agente também não é acordado.
 * Fluxo que termina devolve a conversa ao agente. Organização sem fluxo de palavra-chave não
 * paga nada além de uma leitura em memória.
 *
 * Aqui mora a parte pura e a leitura; quem decide o que fazer é `pos-entrada.ts`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { configDoInicio, eventoWhatsappDoInicio, normalizarParaGatilho } from "./gatilho-do-inicio";
import { flowGraphSchema } from "./graph-schema";

export interface FluxoDePalavraChave {
  pointerId: string;
  /** Já normalizada (`normalizarParaGatilho`) e nunca vazia. */
  palavra: string;
}

/**
 * Qual fluxo esta mensagem abre. Pura. Com mais de uma palavra-chave contida na mensagem, ganha a
 * MAIS LONGA: "quero tarot" e "quero tarot sem misterio" na mesma organização não podem depender
 * da ordem em que o banco devolveu as linhas.
 */
export function escolherFluxoPelaMensagem(fluxos: readonly FluxoDePalavraChave[], texto: string | null | undefined): string | null {
  const mensagem = normalizarParaGatilho(texto ?? "");
  if (mensagem === "") return null;
  let escolhido: FluxoDePalavraChave | null = null;
  for (const f of fluxos) {
    if (f.palavra === "" || !mensagem.includes(f.palavra)) continue;
    if (escolhido === null || f.palavra.length > escolhido.palavra.length) escolhido = f;
  }
  return escolhido?.pointerId ?? null;
}

/** Do que o banco devolveu para a lista usada na decisão. Pura: grafo fora do schema fica de fora. */
export function fluxosDePalavraChaveDe(linhas: ReadonlyArray<{ pointerId: string; graph: unknown }>): FluxoDePalavraChave[] {
  const lista: FluxoDePalavraChave[] = [];
  for (const l of linhas) {
    const grafo = flowGraphSchema.safeParse(l.graph);
    if (!grafo.success) continue;
    const inicio = configDoInicio(grafo.data);
    if (eventoWhatsappDoInicio(inicio) !== "keyword") continue;
    const palavra = normalizarParaGatilho(inicio?.keyword ?? "");
    if (palavra !== "") lista.push({ pointerId: l.pointerId, palavra });
  }
  return lista;
}

const VALIDADE_MS = 30_000;
const memoria = new Map<string, { ate: number; fluxos: FluxoDePalavraChave[] }>();

/** Só para teste: a memória é por processo. */
export function esquecerFluxosDePalavraChave(): void {
  memoria.clear();
}

/**
 * Os fluxos de palavra-chave PUBLICADOS e ativos da organização. Lidos no máximo uma vez a cada
 * 30 s por processo: esta pergunta é feita a cada mensagem recebida, e a resposta muda quando
 * alguém publica um fluxo. Falha de leitura devolve lista vazia — o agente atende, como antes.
 */
export async function fluxosDePalavraChaveAtivos(admin: SupabaseClient, organizationId: string, agora: number = Date.now()): Promise<FluxoDePalavraChave[]> {
  const guardado = memoria.get(organizationId);
  if (guardado && guardado.ate > agora) return guardado.fluxos;

  // ⚠️ Filtro de organização nos dois passos: o client é service-role e ignora RLS.
  const { data: ponteiros, error } = await admin
    .from("followup_flow_pointers")
    .select("id, active_version_id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .eq("surface", "followup")
    .not("active_version_id", "is", null)
    .limit(100);
  if (error) return [];
  const ativos = (ponteiros ?? []) as Array<{ id: string; active_version_id: string }>;

  let fluxos: FluxoDePalavraChave[] = [];
  if (ativos.length > 0) {
    const { data: versoes, error: erroDasVersoes } = await admin
      .from("followup_flow_versions")
      .select("id, graph")
      .eq("organization_id", organizationId)
      .in("id", ativos.map((p) => p.active_version_id));
    if (erroDasVersoes) return [];
    const grafoDaVersao = new Map(((versoes ?? []) as Array<{ id: string; graph: unknown }>).map((v) => [v.id, v.graph]));
    fluxos = fluxosDePalavraChaveDe(ativos.map((p) => ({ pointerId: p.id, graph: grafoDaVersao.get(p.active_version_id) })));
  }
  memoria.set(organizationId, { ate: agora + VALIDADE_MS, fluxos });
  return fluxos;
}
