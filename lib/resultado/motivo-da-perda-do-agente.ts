/**
 * O MOTIVO DA PERDA QUANDO QUEM CONCLUI A PERDA É O AGENTE.
 *
 * O agente move o negócio para a etapa de perda, e perder exige um motivo. Até 10/10/2026 a regra
 * era "o motivo é de uma pessoa": o card NÃO se movia e um aviso ia para a Central pedindo a alguém
 * que abrisse o card e informasse. Numa operação em que a IA atende tudo, ninguém lia: medido numa
 * instalação, 319 avisos abertos, um novo a cada poucos minutos, e o funil cheio de negócios que
 * todo mundo sabia perdidos.
 *
 * Decisão do dono do produto (10/10/2026): a IA classifica. Com três cuidados, que são deste arquivo:
 *
 *   1. FATO antes de inferência. Se a empresa falou por último duas vezes ou mais e a pessoa não
 *      respondeu, o motivo é "parou de responder" — regra, sem gastar IA e sem palpite.
 *   2. Sem segurança, sem motivo. Abaixo de `CONFIANCA_MINIMA` a função devolve `null` e o caminho
 *      antigo vale: o card fica onde está e o aviso vai para a Central.
 *   3. O card recebe só valor do vocabulário CANÔNICO do funil (`price`, `no_response`, `other`) — o
 *      banco recusa o que não é do vocabulário. O motivo fino (confiança, sem urgência, momento,
 *      concorrente) vai para `conversation_loss_reasons`, com a origem (`regra` ou `ia`): é dali que
 *      o painel de Resultado lê, e é ali que uma pessoa corrige.
 *
 * Nenhum trecho da conversa é gravado: ela vai ao modelo e volta só como rótulo e número.
 */
import type pg from "pg";

import { runModelCall, type LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/run-model-call";

import { lerResposta, montarPedido, type MensagemDaConversa, type Motivo } from "./motivo-da-perda";

/** Abaixo disto a IA não tem segurança, e quem decide volta a ser uma pessoa. */
export const CONFIANCA_MINIMA = 60;
/** Quantas falas seguidas da empresa, sem resposta, fazem do silêncio um fato. */
export const FALAS_SEM_RESPOSTA = 2;
const MENSAGENS_LIDAS = 30;

/** O valor que o CARD aceita para cada motivo. O banco só conhece o vocabulário canônico do funil. */
export function motivoDoCard(motivo: Motivo): "price" | "no_response" | "other" {
  if (motivo === "preco") return "price";
  if (motivo === "sem_resposta") return "no_response";
  return "other";
}

/**
 * A pessoa parou de responder? `mensagens` da mais antiga para a mais nova. Fato, não inferência:
 * a empresa falou por último `FALAS_SEM_RESPOSTA` vezes ou mais e nada voltou. Pura.
 */
export function parouDeResponder(mensagens: readonly MensagemDaConversa[]): boolean {
  let seguidas = 0;
  for (let i = mensagens.length - 1; i >= 0; i -= 1) {
    const m = mensagens[i]!;
    if ((m.body ?? "").trim() === "") continue;
    if (m.direction === "inbound") break;
    seguidas += 1;
  }
  return seguidas >= FALAS_SEM_RESPOSTA && mensagens.some((m) => m.direction === "inbound");
}

export interface PerdaClassificada {
  /** O que vai para `crm_leads.lost_reason`. */
  motivoDoCard: "price" | "no_response" | "other";
  motivo: Motivo;
  confianca: number;
  origem: "regra" | "ia";
  modelo: string | null;
}

/**
 * Classifica a perda deste contato. `null` = não deu para classificar com segurança (sem conversa,
 * resposta ilegível, confiança baixa): quem chama segue o caminho de sempre, com aviso para uma pessoa.
 * LANÇA quando a IA não pôde responder (teto de gasto, chave, provedor) — quem chama trata como `null`.
 */
export async function classificarPerdaDoAtendimento(
  pool: pg.Pool,
  llmCfg: LlmEdgeConfig,
  d: { organizationId: string; contactId: string; jobId?: string | null },
): Promise<PerdaClassificada | null> {
  const { rows } = await pool.query<MensagemDaConversa & { conversation_id: string | null }>(
    `select direction, body, conversation_id from (
       select direction, body, conversation_id, created_at from messages
       where organization_id = $1 and contact_id = $2 and body is not null
       order by created_at desc limit $3
     ) m order by created_at asc`,
    [d.organizationId, d.contactId, MENSAGENS_LIDAS],
  );
  if (rows.length === 0) return null;
  const conversationId = [...rows].reverse().find((m) => m.conversation_id)?.conversation_id ?? null;

  let classificada: PerdaClassificada | null = null;
  if (parouDeResponder(rows)) {
    classificada = { motivoDoCard: "no_response", motivo: "sem_resposta", confianca: 100, origem: "regra", modelo: null };
  } else {
    const chamada = await runModelCall(pool, llmCfg, {
      tenantId: d.organizationId,
      leadId: d.contactId,
      jobId: d.jobId ?? null,
      purpose: "loss_reason_classify",
      messages: [{ role: "user", content: montarPedido(rows) }],
    });
    const lido = lerResposta(chamada.result.text ?? "");
    if (lido && lido.confianca >= CONFIANCA_MINIMA) {
      classificada = {
        motivoDoCard: motivoDoCard(lido.motivo),
        motivo: lido.motivo,
        confianca: lido.confianca,
        origem: "ia",
        modelo: chamada.model ?? null,
      };
    }
  }
  if (classificada === null) return null;

  if (conversationId !== null) {
    // `do nothing`: se uma pessoa já corrigiu o motivo desta conversa, a correção fica.
    await pool.query(
      `insert into conversation_loss_reasons
         (organization_id, conversation_id, reason, confidence, source, model, classified_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (conversation_id) do nothing`,
      [d.organizationId, conversationId, classificada.motivo, classificada.confianca, classificada.origem, classificada.modelo],
    );
  }
  return classificada;
}
