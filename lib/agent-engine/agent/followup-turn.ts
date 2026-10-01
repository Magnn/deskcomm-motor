import {claimOfJob,type JobClaim} from "../queue/claim";
import {resultadoDoEnvioDoFollowup} from "../edge/crm/send-ledger";
import { parseServiceBoundary } from "@/lib/atendimento/fronteira";
import { requireCurrentServiceBoundary } from "@/lib/atendimento/fronteira-server";
/**
 * Handler do job `followup_turn` (F3-03; blueprint 1.3) — a peça BUILD da
 * continuidade. A F3-01 (cron persistente) dispara e a F3-02 (tool schedule_followup)
 * agenda a promessa; aqui, NO DISPARO, o harness COMPUTA o delta temporal e injeta o
 * bloco de re-entrada ANTES do turno: "passaram N dias desde a última resposta, você
 * prometeu X, motivo Y, a última coisa que o lead disse foi Z". É a lacuna confirmada
 * em OpenClaw/Hermes que transforma continuação fria em retomada natural.
 *
 * Reusa runAgentTurn (F2-09) por inteiro — sessão fresca, loop de tools, checkpoint,
 * veto. A ÚNICA diferença é a abertura: o bloco temporal entra no SUFIXO (messages),
 * DEPOIS do prefixo cacheável (system do playbook + tools — F2-17), então não
 * invalida o cache org-wide. O delta é RELATIVO ao now do run (clock injetável),
 * nunca persistido estático.
 *
 * Ids de envio (conversa + número) vêm da ROW do lead no harness (fonte confiável),
 * NUNCA do payload do modelo — o cron só carrega o snapshot da promessa (F3-02).
 */
import { z } from 'zod';
import type pg from 'pg';

import { withFields } from '../obs/logger';
import type { JobRow } from '../queue/queue';
import { getLeadContext, type LeadContext } from '../edge/crm/get-lead-context';
import { WahaChannelAdapter } from '../edge/channel/waha-adapter';
import { applySendOutcome } from '../edge/crm/send-message';
import { runBeforeSend } from '../guardrails/before-send';
import { camadaLigada, lerCamadasDaOrg } from '../guardrails/camadas-da-org';
import { classifyPromise } from '../guardrails/promise/semantic';
import { scheduleCronJob } from '../cron/scheduler';
import {
  JobSettledError,
  ritualBlocks,
  runAgentTurn,
  type InboundTurnDeps,
  type LeadCheckpointRow,
} from './inbound-turn';
import { isLeadInHandoff } from './human-handoff';
import { fusoDaOrganizacao } from './fuso-da-org';
import {
  followupPublicadoDoEnrollment,
  proximaAberturaDoFollowup,
} from './janela-de-followup';
import type { LeadStateRow } from './lead-state';
import { loadReentryTemplate, pickReentryVariant } from './reentry-template';
import {
  classifyFollowupReply,
  planFollowupTiming,
  type EsperaParaPlanejar,
  type PropostaDeEsperaBruta,
} from './followup-flow-classify';
import { runGenericAiNode, type BlocosDoGpt } from './followup-flow-generic-ai';
import {
  contextoDoNo,
  interpolarVariaveis,
  modeloEfetivo,
  temperaturaValida,
  variaveisDoPrompt,
  type OpcoesDoGpt,
} from './opcoes-do-gpt';
import { resolveOrgLlmConfig } from '../edge/llm/credentials';
import { loadPublishedAgentConfigById } from './agent-config';
import { searchKnowledge } from './search-knowledge';
import { blocoDeIdentidade } from '@/lib/identidade/bloco-do-prompt';
import { blocoDeLimites } from '@/lib/limites/bloco-do-prompt';
import { OK_KINDS } from './split-message';
import { baixarMidiaDoLink } from './midia-por-link';
import { citaDadoDoLead, interpolarVariaveisDoContato, type DadosDoContato } from './variaveis-do-contato';
import { extFromMime } from '@/lib/messaging/media/types';
import type { ChannelSendResult } from '../channel-adapter';
import { createAdminClient } from '@/lib/supabase/admin';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/**
 * Espelho LOCAL do `conteudoItemSchema` de `lib/followup/graph-schema.ts` — nunca
 * importado de lá: agent-engine não conhece followup/* (regra dura de dependência
 * numa direção só, ver o cabeçalho de `runFlowDrivenTurn`). Os dois schemas
 * descrevem o MESMO formato de fio por design; um campo novo do lado da autoria
 * (graph-schema) só chega a valer aqui quando o motor de envio aprender a
 * enviá-lo — ou seja, quando ESTE arquivo também ganhar o campo, no mesmo PR.
 *
 * Mais solto que a origem de propósito (sem os tetos de caractere exatos): a
 * validação que decide o que é PUBLICÁVEL já rodou em `validarItensDeConteudo`
 * antes deste payload existir; aqui só precisa do suficiente para montar o envio.
 */
const conteudoItemPayloadSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), body: z.string().min(1) }),
  // Imagem, vídeo e documento têm DUAS origens (arquivo do bucket OU link/variável) —
  // ver "Mídia tem DUAS origens" em graph-schema.ts. Aqui as duas são opcionais; quem
  // garante "exatamente uma" é o schema de autoria, no salvar.
  z.object({ type: z.literal('image'), storage_path: z.string().min(1).optional(), mime: z.string().min(1).optional(), url: z.string().min(1).optional(), caption: z.string().optional() }),
  z.object({ type: z.literal('video'), storage_path: z.string().min(1).optional(), mime: z.string().min(1).optional(), url: z.string().min(1).optional(), caption: z.string().optional() }),
  z.object({ type: z.literal('audio'), storage_path: z.string().min(1), mime: z.string().min(1), voice_note: z.boolean().optional(), filename: z.string().optional() }),
  z.object({
    type: z.literal('document'),
    storage_path: z.string().min(1).optional(),
    mime: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    filename: z.string().optional(),
    caption: z.string().optional(),
  }),
  z.object({ type: z.literal('contact'), name: z.string().min(1), phone_number: z.string().min(1) }),
  z.object({ type: z.literal('sticker'), storage_path: z.string().min(1), mime: z.string().min(1) }),
  z.object({ type: z.literal('delay'), seconds: z.number().int().min(1).max(120) }),
]);
export type ConteudoItemPayload = z.infer<typeof conteudoItemPayloadSchema>;

/**
 * Payload que o cron enfileira no disparo (F3-02 grava reason/promise/promised_at/
 * context_snapshot). Tolerante: um follow-up de origem futura (re-entrada iniciada
 * pelo sistema, sem promessa registrada) enfileira sem esses campos e ainda roda —
 * acc3 (variante mínima, sem promessa inventada).
 */
export const followupTurnPayloadSchema = z
  .object({
    reason: z.string().optional(),
    promise: z.string().optional(),
    promised_at: z.string().optional(),
    context_snapshot: z.string().nullable().optional(),
    // F3-04: 'template' = re-entrada DETERMINÍSTICA — envia a variante versionada
    // direto pela cadeia de guardrails, sem LLM (custo $0, blueprint). Ausente/'agent'
    // = run normal do agente (comportamento F3-03 intocado).
    mode: z.enum(['agent', 'template']).optional(),
    // Onda 5 (Task 5.1): turno DIRIGIDO POR FLUXO (lib/followup/engine.ts enfileira
    // este payload, campo a campo IDÊNTICO ao FollowupJobRequest.payload de lá).
    // Presente ⇒ ramo guardado em runFlowDrivenTurn; ausente ⇒ comportamento LEGADO
    // (schedule_followup / F3-03 / F3-04) intocado — nem lido.
    followup_enrollment_id: z.string().uuid().optional(),
    node_id: z.string().min(1).optional(),
    // 'generic_ai' — nó ai_generic (lote 1): reaproveita prompt_hint pro
    // texto do prompt livre, o MESMO campo que a ação `ai_message` já usa.
    purpose: z.enum(['send_message', 'classify', 'plan_timing', 'generic_ai']).optional(),
    prompt_hint: z.string().optional(),
    /** action mode `text` — enviado pela cadeia de guardrails, sem LLM. */
    fixed_body: z.string().min(1).max(4000).optional(),
    /** action mode `template` — corpo em `message_templates`. */
    template_id: z.string().uuid().optional(),
    /** action mode `content` — a sequência inteira, na ordem de envio. */
    content_items: z.array(conteudoItemPayloadSchema).optional(),
    volta_index: z.number().int().optional(),
    volta_total: z.number().int().optional(),
    classes: z.array(z.string()).optional(),
    hint: z.string().optional(),
    // purpose 'generic_ai': as opções do nó GPT, campo a campo IDÊNTICAS às de `lib/followup/engine.ts`.
    generic_ai_opcoes: z
      .object({
        modelo_gpt: z.string().optional(),
        max_tokens: z.number().int().optional(),
        temperature: z.number().optional(),
        enviar_resultado_texto: z.boolean().optional(),
        manter_contexto: z.boolean().optional(),
        leitura_imagem_pdf: z.boolean().optional(),
        ativar_personalidade: z.boolean().optional(),
        ativar_base_informacoes: z.boolean().optional(),
        ativar_restricoes: z.boolean().optional(),
        salvar_em_campo: z.boolean().optional(),
      })
      .optional(),
    // purpose 'plan_timing': as esperas adaptativas do fluxo inteiro, na ordem.
    waits: z
      .array(
        z.object({
          node_id: z.string().min(1),
          label: z.string(),
          min_ms: z.number().int(),
          max_ms: z.number().int(),
          guidance: z.string().optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

/** Resultado de um turno dirigido por fluxo — espelha `TurnResult` de lib/followup/turn-bridge.ts
 *  (agent-engine não importa followup/* — regra dura de dependência numa direção só). */
export type FollowupFlowTurnResult =
  | { kind: 'sent' }
  | { kind: 'skipped'; reason: string }
  | { kind: 'classified'; class: string }
  /** O envio ficou estacionado até `until` (janela fechada) — nem saiu, nem foi recusado. */
  | { kind: 'deferred'; until: Date; reason: string }
  | { kind: 'planned'; propostas: PropostaDeEsperaBruta[]; modelo: string }
  /** nó `ai_generic` (lote 1) — o texto que o prompt livre devolveu. */
  | { kind: 'generic_ai_done'; text: string; envio?: 'sent' | 'skipped' | 'deferred'; modelo?: string };

/**
 * `InboundTurnDeps` + o callback que fecha o turno dirigido por fluxo de volta
 * no enrollment. Ausente (deps antigo, sem o campo) ⇒ o ramo de fluxo lança um
 * erro claro em vez de silenciosamente não persistir nada — falha alto e cedo,
 * nunca um turno "concluído" que a ponte nunca soube que aconteceu.
 */
export interface FollowupTurnDeps extends InboundTurnDeps {
  completeFollowupTurn?: (
    pool: pg.Pool,
    input: { organizationId: string; enrollmentId: string; nodeId: string; jobId?: string; jobClaim?:JobClaim; result: FollowupFlowTurnResult },
  ) => Promise<void>;
}

/** Duração humana pt-br do intervalo desde a última resposta — só ordem de grandeza. */
function humanizeElapsed(ms: number): string {
  if (ms >= DAY_MS) {
    const days = Math.floor(ms / DAY_MS);
    return days === 1 ? '1 dia' : `${days} dias`;
  }
  if (ms >= HOUR_MS) {
    const hours = Math.floor(ms / HOUR_MS);
    return hours === 1 ? '1 hora' : `${hours} horas`;
  }
  return 'menos de uma hora';
}

/**
 * Bloco temporal de re-entrada. Com promessa → variante completa; sem promessa →
 * variante mínima coerente (acc3), nunca uma promessa inventada. O delta N dias é
 * medido do `now` (clock do run) até a última resposta do lead (última inbound do
 * contexto); sem inbound no contexto, cai numa abertura de retomada sem delta.
 */
export function buildTemporalBlock(input: {
  now: Date;
  reason?: string | undefined;
  promise?: string | undefined;
  promisedAt?: string | undefined;
  lastInbound: { body: string; sentAt: string } | null;
}): string {
  const parts: string[] = [];

  if (input.lastInbound !== null) {
    const elapsedMs = input.now.getTime() - Date.parse(input.lastInbound.sentAt);
    parts.push(
      Number.isNaN(elapsedMs)
        ? 'Você está retomando o contato com o lead após o intervalo combinado.'
        : `Passaram ${humanizeElapsed(Math.max(0, elapsedMs))} desde a última resposta do lead.`,
    );
  } else {
    parts.push('Você está retomando o contato com o lead; não há resposta recente registrada na conversa.');
  }

  const promise = input.promise?.trim();
  if (promise) {
    parts.push(
      input.promisedAt ? `Você prometeu: ${promise} (para ${input.promisedAt}).` : `Você prometeu: ${promise}.`,
    );
  }

  const reason = input.reason?.trim();
  if (reason) {
    parts.push(`Motivo do follow-up: ${reason}.`);
  }

  if (input.lastInbound !== null) {
    parts.push(`A última coisa que o lead disse foi: "${input.lastInbound.body}".`);
  }

  return parts.join(' ');
}

/** Abertura do follow-up: bloco temporal no topo do sufixo + o ritual padrão. */
function buildFollowupOpeningMessage(
  temporalBlock: string,
  previous: LeadCheckpointRow | null,
  leadState: LeadStateRow | null,
  context: LeadContext,
  notesIndexBlock: string,
  projeta = false,
): string {
  return [
    'Follow-up agendado: você havia combinado retornar a este lead — NÃO houve nova mensagem dele desde então.',
    '',
    '## Contexto temporal do follow-up',
    temporalBlock,
    '',
    ...ritualBlocks(previous, leadState, context, notesIndexBlock, projeta),
    '',
    'Retome a conversa com naturalidade usando a tool send_message — NUNCA escreva a resposta como texto direto',
    '(texto fora de tool é descartado pelo runtime). Use get_lead_context se precisar reler o contexto.',
    'Houve avanço REAL no funil neste turno? Marque-o com update_lead_state (só o próximo estágio válido).',
    'Aprendeu algo durável sobre o lead? Salve com save_lead_note (a headline entra no índice de memória).',
  ].join('\n');
}

/** Última mensagem inbound do contexto (a "última coisa que o lead disse" — Z). */
function lastInboundOf(context: LeadContext): { body: string; sentAt: string } | null {
  for (let i = context.messages.length - 1; i >= 0; i -= 1) {
    const m = context.messages[i]!;
    if (m.direction === 'inbound') {
      return { body: m.body, sentAt: m.sent_at };
    }
  }
  return null;
}

/**
 * A última inbound, mas SÓ se veio depois da última outbound — "nada de novo
 * desde a última vez que falamos" vira `null` (onda 5: o classify SÓ tem algo
 * pra classificar quando o lead respondeu DEPOIS do nosso último envio).
 */
function lastInboundSinceLastOutbound(context: LeadContext): string | null {
  let lastOutboundAt: number | null = null;
  for (const m of context.messages) {
    if (m.direction === 'outbound') lastOutboundAt = Date.parse(m.sent_at);
  }
  for (let i = context.messages.length - 1; i >= 0; i -= 1) {
    const m = context.messages[i]!;
    if (m.direction === 'inbound') {
      const at = Date.parse(m.sent_at);
      return lastOutboundAt === null || at > lastOutboundAt ? m.body : null;
    }
  }
  return null;
}

/**
 * Handler de `followup_turn` para o registry do daemon (main.ts). Resolve os ids de
 * envio da row do lead (nunca do payload) e injeta o bloco temporal no sufixo antes
 * de delegar ao núcleo compartilhado do run (runAgentTurn).
 */
export function createFollowupTurnHandler(deps: FollowupTurnDeps) {
  return async (job: JobRow, pool: pg.Pool, ctx: { workerId: string }): Promise<void> => {
    const tenantId = job.organization_id;
    const leadId = job.contact_id;
    if (leadId === null) {
      throw new Error('job followup_turn sem contact_id — o CHECK da fila deveria impedir');
    }
    const payload = followupTurnPayloadSchema.parse(job.payload);

    const boundary = parseServiceBoundary(job.payload.service_boundary);
    await requireCurrentServiceBoundary(pool, boundary);
    const { rows: targetRows } = await pool.query<{ channel_session_id: string; archived_at: string | null }>(
      `select c.channel_session_id, to_jsonb(cs)->>'archived_at' as archived_at from conversations c
       join channel_sessions cs on cs.id=c.channel_session_id and cs.organization_id=c.organization_id
       where c.organization_id=$1 and c.id=$2 and c.contact_id=$3`,
      [tenantId, boundary!.conversation_id, leadId]);
    if (!targetRows[0]) throw new Error('conversa de origem indisponível');
    if (targetRows[0].archived_at) throw new Error('canal arquivado');
    const target: ReentrySendTarget = { tenantId, leadId, conversationId: boundary!.conversation_id, channelSessionId: targetRows[0]!.channel_session_id };

    const clock = deps.clock ?? ((): Date => new Date());

    // #490 — a janela PRÓPRIA vale só para envio proativo dirigido por fluxo.
    // `classify` e `plan_timing` não falam com o cliente e podem rodar a qualquer
    // hora. Retornos prometidos via `schedule_followup` continuam fora deste
    // recorte: eles não têm enrollment/agent pinado, e a issue deixou essa regra
    // explicitamente em aberto para uma decisão separada.
    if (payload.followup_enrollment_id !== undefined && payload.purpose === 'send_message') {
      const followup = await followupPublicadoDoEnrollment(
        pool,
        tenantId,
        payload.followup_enrollment_id,
      );
      const sendWindow =
        typeof followup === 'object' && followup !== null
          ? (followup as { send_window?: unknown }).send_window
          : null;
      if (sendWindow !== null && sendWindow !== undefined) {
        const runLog = withFields(deps.log, {
          job_id: job.id,
          tenant_id: tenantId,
          lead_id: leadId,
          enrollment_id: payload.followup_enrollment_id,
        });
        const agora = clock();
        const fuso = await fusoDaOrganizacao(pool, tenantId, runLog);
        const proximaAbertura = proximaAberturaDoFollowup(followup, fuso, agora);
        if (proximaAbertura !== null) {
          const complete = deps.completeFollowupTurn;
          if (!complete || payload.node_id === undefined) {
            throw new Error(
              'follow-up adiado pela janela própria sem completeFollowupTurn/node_id — o enrollment não saberia do adiamento',
            );
          }
          await rescheduleReentry(pool, {
            tenantId,
            leadId,
            jobId: job.id,
            at: proximaAbertura,
            payload: job.payload,
          });
          runLog.info('follow-up adiado pela janela própria do agente', {
            next_run_at: proximaAbertura.toISOString(),
            timezone: fuso,
          });
          // O adiamento VOLTA para o enrollment, como o da janela anti-ban em
          // `runFlowDrivenTurn`. Sem isto o motor lê a espera como worker morto:
          // o dead-man da ação esgota ~11h e marca `dead` um enrollment cujo
          // envio ia sair na abertura — e o padrão desta faixa (sexta 18h →
          // segunda 9h) já espera 63h.
          await complete(pool, {
            jobId: job.id,
            jobClaim: claimOfJob(job),
            organizationId: tenantId,
            enrollmentId: payload.followup_enrollment_id,
            nodeId: payload.node_id,
            result: { kind: 'deferred', until: proximaAbertura, reason: 'followup_send_window' },
          });
          return;
        }
      }
    }

    // Onda 5 (Task 5.1): turno DIRIGIDO POR FLUXO — guard exclusivo, nunca cai nos
    // caminhos legados abaixo (F3-03/F3-04 seguem intocados quando o campo falta).
    if (payload.followup_enrollment_id !== undefined) {
      await runFlowDrivenTurn(deps, job, pool, ctx, clock, target, {
        enrollmentId: payload.followup_enrollment_id,
        nodeId: payload.node_id,
        purpose: payload.purpose,
        promptHint: payload.prompt_hint,
        fixedBody: payload.fixed_body,
        templateId: payload.template_id,
        contentItems: payload.content_items,
        voltaIndex: payload.volta_index,
        voltaTotal: payload.volta_total,
        classes: payload.classes,
        hint: payload.hint,
        genericAiOpcoes: payload.generic_ai_opcoes,
        waits: payload.waits,
      });
      return;
    }

    // F3-04: caminho determinístico ($0) — envia o template versionado direto pela
    // cadeia de guardrails, sem chamar o modelo. É um CAMINHO ADICIONAL: o run do
    // agente (abaixo) segue intocado quando o modo não é 'template'.
    if (payload.mode === 'template') {
      await runDeterministicReentry(deps, job, pool, ctx, clock, {
        tenantId,
        leadId,
        channelSessionId: target.channelSessionId,
        conversationId: target.conversationId,
      });
      return;
    }

    await runAgentTurn(deps, job, pool, ctx, {
      channelSessionId: target.channelSessionId,
      conversationId: target.conversationId,
      buildOpening: ({ previous, leadState, context, notesIndexBlock, projeta }) => {
        const temporalBlock = buildTemporalBlock({
          now: clock(),
          reason: payload.reason,
          promise: payload.promise,
          promisedAt: payload.promised_at,
          lastInbound: lastInboundOf(context),
        });
        return buildFollowupOpeningMessage(temporalBlock, previous, leadState, context, notesIndexBlock, projeta);
      },
    });
  };
}

/**
 * O que aconteceu com um envio sem LLM. `deferred` carrega o INSTANTE porque
 * quem recebe precisa dele: sem a data, "adiado" e "some" são a mesma coisa
 * para o enrollment.
 */
type EnvioFixoDesfecho =
  | { kind: "sent" }
  | { kind: "deferred"; until: Date; reason: string }
  | { kind: "skipped" };

interface ReentrySendTarget {
  tenantId: string;
  leadId: string;
  channelSessionId: string;
  conversationId: string;
}

/**
 * Onda 5 (Task 5.1) — turno dirigido por fluxo (`payload.followup_enrollment_id`
 * presente). Roteia pelos 3 `purpose` que `lib/followup/node-handlers.ts` pode
 * pedir; ao terminar, chama `deps.completeFollowupTurn` (injetado — a ponte de
 * verdade vive em `lib/followup/turn-bridge.ts`, que este arquivo NUNCA importa:
 * agent-engine não conhece followup/*, só o callback).
 */
async function runFlowDrivenTurn(
  deps: FollowupTurnDeps,
  job: JobRow,
  pool: pg.Pool,
  ctx: { workerId: string },
  clock: () => Date,
  target: ReentrySendTarget,
  input: {
    enrollmentId: string;
    nodeId: string | undefined;
    purpose: 'send_message' | 'classify' | 'plan_timing' | 'generic_ai' | undefined;
    promptHint: string | undefined;
    fixedBody: string | undefined;
    templateId: string | undefined;
    /** action mode 'content' — ver `sendConteudoSequence`. */
    contentItems: ConteudoItemPayload[] | undefined;
    voltaIndex: number | undefined;
    voltaTotal: number | undefined;
    classes: string[] | undefined;
    hint: string | undefined;
    genericAiOpcoes: OpcoesDoGpt | undefined;
    waits: EsperaParaPlanejar[] | undefined;
  },
): Promise<void> {
  if (input.nodeId === undefined || input.purpose === undefined) {
    throw new Error('followup_turn dirigido por fluxo sem node_id/purpose no payload — payload do engine incompleto');
  }
  const complete = deps.completeFollowupTurn;
  if (!complete) {
    throw new Error(
      'followup_turn dirigido por fluxo sem completeFollowupTurn nos deps do handler — a ponte não foi injetada na wiring (workers/agent-worker/main.ts)',
    );
  }
  const { enrollmentId, nodeId } = input;
  const runLog = withFields(deps.log, { job_id: job.id, tenant_id: target.tenantId, lead_id: target.leadId, enrollment_id: enrollmentId });

  if (input.purpose === 'send_message') {
    // action mode 'content': sequência de itens, ANTES do fallback de corpo único
    // — content_items presente é o sinal exclusivo (nunca coexiste com fixedBody/
    // templateId, o formulário só grava um modo por vez).
    if (input.contentItems !== undefined) {
      const desfecho = await sendConteudoSequence(deps, job, pool, ctx, clock, target, input.contentItems);
      if (desfecho.kind === 'sent') {
        await complete(pool, { jobId: job.id, jobClaim: claimOfJob(job), organizationId: target.tenantId, enrollmentId, nodeId, result: { kind: 'sent' } });
      } else if (desfecho.kind === 'skipped') {
        await complete(pool, { jobId: job.id, jobClaim: claimOfJob(job), organizationId: target.tenantId, enrollmentId, nodeId, result: { kind: 'skipped', reason: 'O envio foi recusado pelas regras do atendimento.' } });
      } else {
        await complete(pool, { jobId: job.id, jobClaim: claimOfJob(job), organizationId: target.tenantId, enrollmentId, nodeId, result: { kind: 'deferred', until: desfecho.until, reason: desfecho.reason } });
      }
      return;
    }
    const body = await resolveFlowSendBody(pool, target.tenantId, input);
    if (body !== null) {
      // Texto do operador: sem camada semântica (ver o cabeçalho de sendFixedOutbound).
      const desfecho = await sendFixedOutbound(deps, job, pool, ctx, clock, target, body, false);
      // TODO OS TRÊS DESFECHOS VOLTAM PARA O ENROLLMENT. O adiado era o que não
      // voltava, e o silêncio dele custava o enrollment inteiro: o motor ficava
      // rechecando um turno que ninguém ia fechar e, esgotado o orçamento do
      // dead-man (~11h), marcava `dead` com `action_turn_never_completed` — um
      // motivo falso, porque o worker estava vivo e o envio só esperava a
      // janela abrir. Uma noite de sábado com domingo fechado (33h) já passava
      // do orçamento na `main`; a faixa de envio por agente chega a 159h.
      if (desfecho.kind === 'sent') {
        await complete(pool, { jobId:job.id,jobClaim:claimOfJob(job), organizationId: target.tenantId, enrollmentId, nodeId, result: { kind: 'sent' } });
      } else if (desfecho.kind === 'skipped') {
        await complete(pool,{jobId:job.id,jobClaim:claimOfJob(job),organizationId:target.tenantId,enrollmentId,nodeId,result:{kind:'skipped',reason:'O envio foi recusado pelas regras do atendimento.'}});
      } else {
        await complete(pool,{jobId:job.id,jobClaim:claimOfJob(job),organizationId:target.tenantId,enrollmentId,nodeId,result:{kind:'deferred',until:desfecho.until,reason:desfecho.reason}});
      }
      return;
    }
    await runAgentTurn(deps, job, pool, ctx, {
      channelSessionId: target.channelSessionId,
      conversationId: target.conversationId,
      buildOpening: ({ previous, leadState, context, notesIndexBlock, projeta }) => {
        const temporalBlock = buildTemporalBlock({ now: clock(), lastInbound: lastInboundOf(context) });
        const opening = buildFollowupOpeningMessage(temporalBlock, previous, leadState, context, notesIndexBlock, projeta);
        if (!input.promptHint) return opening;
        return `${opening}\n\n## Orientação do passo do fluxo\n${input.promptHint}`;
      },
    });
    const result = await resultadoDoEnvioDoFollowup(pool,job.organization_id,job.id);
    await complete(pool, { jobId:job.id,jobClaim:claimOfJob(job), organizationId: target.tenantId, enrollmentId, nodeId, result });
    return;
  }

  if (input.purpose === 'classify') {
    const classes = input.classes ?? [];
    const fuso = await fusoDaOrganizacao(pool, target.tenantId, runLog);
    const context = await getLeadContext(pool, deps.crmCfg, { tenantId: target.tenantId, leadId: target.leadId, fuso }, {
      historyLimit: deps.knobs.historyLimit,
      maxTokens: deps.knobs.maxContextTokens,
    });
    if (!context.ok) {
      throw new Error(`turno de classificação do fluxo falhou em get_lead_context (${context.error.code})`);
    }
    const cls = await classifyFollowupReply(
      pool,
      deps.llmCfg,
      { tenantId: target.tenantId, leadId: target.leadId, jobId: job.id },
      {
        candidateText: lastInboundSinceLastOutbound(context.context),
        classes,
        ...(input.hint !== undefined ? { hint: input.hint } : {}),
        ...(deps.knobs.followupAi?.model !== undefined ? { model: deps.knobs.followupAi.model } : {}),
      },
      { ...(deps.registry !== undefined ? { registry: deps.registry } : {}), log: runLog },
    );
    await complete(pool, { jobId:job.id,jobClaim:claimOfJob(job), organizationId: target.tenantId, enrollmentId, nodeId, result: { kind: 'classified', class: cls } });
    return;
  }

  if (input.purpose === 'generic_ai') {
    // nó ai_generic (lote 1): prompt livre com o MESMO contexto de lead que o
    // planejador de tempo já monta (getLeadContext) — o prompt referencia a
    // conversa, não só a última mensagem.
    if (!input.promptHint) {
      throw new Error('turno de IA genérica do fluxo sem prompt no payload — payload do engine incompleto');
    }
    const fuso = await fusoDaOrganizacao(pool, target.tenantId, runLog);
    const context = await getLeadContext(pool, deps.crmCfg, { tenantId: target.tenantId, leadId: target.leadId, fuso }, {
      historyLimit: deps.knobs.historyLimit,
      maxTokens: deps.knobs.maxContextTokens,
    });
    if (!context.ok) {
      throw new Error(`turno de IA genérica do fluxo falhou em get_lead_context (${context.error.code})`);
    }
    const opcoes: OpcoesDoGpt = input.genericAiOpcoes ?? {};

    // Variáveis do prompt ({{primeiro_nome}}, {{etapa_funil}}, campos do lead…): são as que a
    // tela insere no cursor. Etapa e campos personalizados não vêm no contexto do lead.
    const { rows: leadRows } = await pool.query<{ stage_name: string | null; custom_fields: Record<string, unknown> | null }>(
      `select s.name as stage_name, l.custom_fields
         from crm_leads l left join crm_stages s on s.id = l.stage_id
        where l.organization_id = $1 and l.contact_id = $2
        order by l.updated_at desc limit 1`,
      [target.tenantId, target.leadId],
    );
    const contextoDoModelo = contextoDoNo(context.context, opcoes);
    const promptFinal = interpolarVariaveis(
      input.promptHint,
      variaveisDoPrompt(context.context, {
        etapa_funil: leadRows[0]?.stage_name ?? null,
        campos: leadRows[0]?.custom_fields ?? null,
      }),
    );

    // Modelo: o seletor é da OpenAI; só vale onde o provedor da organização o tem.
    const orgLlm = await resolveOrgLlmConfig(pool, deps.llmCfg, target.tenantId);
    const escolha = modeloEfetivo({ provider: orgLlm.provider, enabledModels: orgLlm.enabledModels }, opcoes.modelo_gpt);
    if (escolha.motivo === 'provedor_sem_openai' || escolha.motivo === 'nao_habilitado') {
      runLog.warn('nó GPT: modelo escolhido não se aplica a esta organização — usando o padrão', {
        modelo_gpt: opcoes.modelo_gpt,
        provedor: orgLlm.provider,
        motivo: escolha.motivo,
      });
    }

    // Personalidade, restrições e base de informações vêm do agente que ARMOU o fluxo.
    const blocos: BlocosDoGpt = {};
    if (opcoes.ativar_personalidade || opcoes.ativar_restricoes || opcoes.ativar_base_informacoes) {
      const { rows: enr } = await pool.query<{ agent_id: string | null }>(
        'select agent_id from followup_enrollments where organization_id = $1 and id = $2',
        [target.tenantId, enrollmentId],
      );
      const agentId = enr[0]?.agent_id ?? null;
      const agente = agentId ? await loadPublishedAgentConfigById(pool, target.tenantId, agentId) : null;
      if (!agente) {
        runLog.warn('nó GPT: personalidade/restrições/base pedidas, mas o fluxo não tem agente publicado — seguindo sem elas');
      } else {
        if (opcoes.ativar_personalidade) blocos.identidade = blocoDeIdentidade(agente.identity ?? null);
        if (opcoes.ativar_restricoes) blocos.limites = blocoDeLimites(agente.limits ?? null);
        if (opcoes.ativar_base_informacoes) {
          const achados = await searchKnowledge(
            pool,
            {
              organizationId: target.tenantId,
              knowledgeSourceIds: agente.knowledgeSourceIds,
              kbVersionId: agente.activeKbVersionId ?? null,
              query: promptFinal.slice(0, 600),
              topK: agente.ragTopK,
              threshold: agente.ragSimilarityThreshold,
              jobId: job.id,
              agentId: agente.agentId,
            },
            { log: runLog },
          );
          if (achados.ok) blocos.conhecimento = achados.results.map((h) => h.content);
          else runLog.warn('nó GPT: busca na base de informações falhou — seguindo sem ela', { erro: achados.error.code });
        }
      }
    }

    const temperature = temperaturaValida(opcoes.temperature);
    const text = await runGenericAiNode(
      pool,
      deps.llmCfg,
      { tenantId: target.tenantId, leadId: target.leadId, jobId: job.id },
      {
        prompt: promptFinal,
        context: contextoDoModelo,
        blocos,
        paraCliente: opcoes.enviar_resultado_texto === true,
        ...(escolha.model !== undefined
          ? { model: escolha.model }
          : deps.knobs.followupAi?.model !== undefined
            ? { model: deps.knobs.followupAi.model }
            : {}),
        ...(temperature !== undefined ? { temperature } : {}),
        ...(opcoes.max_tokens !== undefined ? { maxOutputTokens: opcoes.max_tokens } : {}),
      },
      { ...(deps.registry !== undefined ? { registry: deps.registry } : {}), log: runLog },
    );

    // «Enviar resultado como texto?»: o texto também vai ao cliente, pela cadeia de guardrails COM
    // a camada semântica (é texto do modelo, não do operador). O desfecho fica no registro do passo:
    // janela fechada ou recusa não perdem o texto — ele segue gravado e a timeline diz o que houve.
    let envio: 'sent' | 'skipped' | 'deferred' | undefined;
    if (opcoes.enviar_resultado_texto === true) {
      const d = await sendFixedOutbound(deps, job, pool, ctx, clock, target, text, true);
      envio = d.kind === 'sent' ? 'sent' : d.kind === 'skipped' ? 'skipped' : 'deferred';
    }

    await complete(pool, {
      jobId: job.id,
      jobClaim: claimOfJob(job),
      organizationId: target.tenantId,
      enrollmentId,
      nodeId,
      result: { kind: 'generic_ai_done', text, ...(envio !== undefined ? { envio } : {}), ...(escolha.model !== undefined ? { modelo: escolha.model } : {}) },
    });
    return;
  }

  // 'plan_timing' — o acionamento do fluxo: planeja TODAS as esperas adaptativas
  // de uma vez. Sem esperas no payload não há o que planejar, e chamar o modelo
  // para devolver um plano vazio seria pagar por nada.
  const esperas = input.waits ?? [];
  if (esperas.length === 0) {
    throw new Error('turno de planejamento de tempo sem esperas no payload — o engine só o enfileira quando há espera adaptativa');
  }
  const context = await getLeadContext(
    pool,
    deps.crmCfg,
    { tenantId: target.tenantId, leadId: target.leadId, fuso: await fusoDaOrganizacao(pool, target.tenantId, runLog) },
    { historyLimit: deps.knobs.historyLimit, maxTokens: deps.knobs.maxContextTokens },
  );
  if (!context.ok) {
    throw new Error(`turno de planejamento de tempo do fluxo falhou em get_lead_context (${context.error.code})`);
  }
  const plano = await planFollowupTiming(
    pool,
    deps.llmCfg,
    { tenantId: target.tenantId, leadId: target.leadId, jobId: job.id },
    {
      context: context.context,
      esperas,
      ...(deps.knobs.followupAi?.model !== undefined ? { model: deps.knobs.followupAi.model } : {}),
    },
    { ...(deps.registry !== undefined ? { registry: deps.registry } : {}), log: runLog, clock },
  );
  await complete(pool, {
    jobId:job.id,jobClaim:claimOfJob(job),
    organizationId: target.tenantId,
    enrollmentId,
    nodeId,
    result: { kind: 'planned', propostas: plano.propostas, modelo: plano.modelo },
  });
}

/**
 * Re-entrada DETERMINÍSTICA (F3-04): carrega o template ativo por ponteiro, escolhe a
 * variante do lead (hash — acc2) e a envia SEM LLM. Enviar continua sendo o sink
 * idempotente (F2-06) ATRÁS da cadeia de guardrails (F2-13): STOP/anti-ban/spinning
 * rodam igual ao caminho do agente — só o modelo é pulado ($0). Fora da janela
 * anti-ban o envio é RE-AGENDADO (nunca dropado — acc3).
 */
async function runDeterministicReentry(
  deps: InboundTurnDeps,
  job: JobRow,
  pool: pg.Pool,
  ctx: { workerId: string },
  clock: () => Date,
  target: ReentrySendTarget,
): Promise<void> {
  const template = await loadReentryTemplate(pool, target.tenantId);
  if (template === null) {
    throw new Error('re-entrada determinística sem template apontado para o tenant — publique um template e mova o ponteiro');
  }
  // Re-entrada por template: honra a camada da organização, como na main.
  await sendFixedOutbound(
    deps,
    job,
    pool,
    ctx,
    clock,
    target,
    pickReentryVariant(target.leadId, template.variants),
    true,
  );
}

function interpolarVoltaDoPayload(texto: string, index: number | undefined, total: number | undefined): string {
  if (index === undefined || total === undefined) return texto;
  return texto.replaceAll('{{volta}}', String(index)).replaceAll('{{voltas}}', String(total));
}

async function resolveFlowSendBody(
  pool: pg.Pool,
  tenantId: string,
  input: {
    fixedBody: string | undefined;
    templateId: string | undefined;
    voltaIndex: number | undefined;
    voltaTotal: number | undefined;
  },
): Promise<string | null> {
  if (input.fixedBody !== undefined) {
    return interpolarVoltaDoPayload(input.fixedBody, input.voltaIndex, input.voltaTotal);
  }
  if (input.templateId === undefined) return null;
  const { rows } = await pool.query<{ body: string }>(
    `select body from message_templates where organization_id = $1 and id = $2 limit 1`,
    [tenantId, input.templateId],
  );
  const body = rows[0]?.body;
  if (body === undefined || body.length === 0) {
    throw new Error('followup_turn sem modelo de mensagem — o template_id do passo não existe nesta organização');
  }
  return interpolarVoltaDoPayload(body, input.voltaIndex, input.voltaTotal);
}

/**
 * Envia `body` pela cadeia de guardrails, sem LLM. Distingue aceito, adiado e veto terminal.
 *
 * ─── Por que a camada semântica é PARÂMETRO, e não uma decisão só ───────────
 *
 * Esta função tem dois chamadores, e eles NÃO querem a mesma coisa:
 *
 *  - **texto do fluxo** (`action.mode=text`, `runFlowDrivenTurn`) — é do
 *    operador, e a classificação semântica de promessa exige LLM: ligá-la ali
 *    barrava o 1º outbound de captação de quem não tem BYOK. Passa `false`, e
 *    essa é a decisão original deste PR, mantida com a razão que ela já tinha.
 *
 *  - **re-entrada determinística por TEMPLATE** (`runDeterministicReentry`) —
 *    na `main` ela SEMPRE passou pela camada quando a organização a liga
 *    (`camadaLigada(camadasDaOrg.promessa_semantica, …)`), pelo motivo escrito
 *    lá: "a re-entrada determinística passa pela MESMA cadeia, então tem de
 *    honrar a MESMA preferência. Ler só no inbound deixaria a camada ligada num
 *    caminho e desligada no outro, para a mesma organização."
 *
 * Ao unificar os dois chamadores numa função só, a razão do primeiro passou a
 * valer para o segundo em silêncio — e a escolha que a organização faz na tela
 * virava dado gravado e ignorado pelo motor. `tests/unit/camada-lida-no-motor.test.ts`
 * existe exatamente para isso, e o cabeçalho dele conta que uma sabotagem desta
 * linha deixou 13 testes verdes.
 *
 * STOP / anti-ban / spinning / LGPD continuam na cadeia nos DOIS casos.
 */
async function sendFixedOutbound(
  deps: InboundTurnDeps,
  job: JobRow,
  pool: pg.Pool,
  ctx: { workerId: string },
  clock: () => Date,
  target: ReentrySendTarget,
  corpoDoFluxo: string,
  /** `true` só na re-entrada por template — ver o cabeçalho. */
  comCamadaSemantica: boolean,
): Promise<EnvioFixoDesfecho> {
  const { tenantId, leadId, channelSessionId, conversationId } = target;
  const runLog = withFields(deps.log, { job_id: job.id, tenant_id: tenantId, lead_id: leadId });

  if (await isLeadInHandoff(pool, tenantId, leadId)) {
    runLog.info('envio fixo pulado — lead silenciado (handoff/opt-out)', { kind: job.kind });
    return { kind: "skipped" };
  }

  const context = await getLeadContext(
    pool,
    deps.crmCfg,
    { tenantId, leadId, fuso: await fusoDaOrganizacao(pool, tenantId, runLog) },
    { historyLimit: deps.knobs.historyLimit, maxTokens: deps.knobs.maxContextTokens },
  );
  if (!context.ok) {
    throw new Error(`envio fixo do follow-up falhou em get_lead_context (${context.error.code})`);
  }
  // Variáveis do contato trocadas ANTES do portão — mesma regra da sequência de
  // conteúdo (`variaveis-do-contato.ts`). Texto que era só uma variável sem valor
  // não vira mensagem vazia: o passo é pulado.
  const body = interpolarVariaveisDoContato(
    corpoDoFluxo,
    await dadosDoContatoParaVariaveis(pool, tenantId, leadId, context.context.contact, [corpoDoFluxo]),
  );
  if (body === '') {
    runLog.warn('envio fixo pulado — o texto ficou vazio depois das variáveis do contato', { kind: job.kind });
    return { kind: 'skipped' };
  }
  const optedOutThisTurn = context.context.contact.is_blocked;

  const channel = (deps.channel ?? ((p: pg.Pool) => new WahaChannelAdapter(p, deps.crmCfg)))(pool);

  // A escolha da ORGANIZAÇÃO, e não só o knob do `.env` do worker. Lida aqui, e
  // não no chamador, para que o único caminho até `runBeforeSend` seja também o
  // único lugar onde a preferência é consultada. Consulta só quando vale —
  // texto de fluxo não usa, e não deve pagar um round-trip por isso.
  const camadasDaOrg = comCamadaSemantica ? await lerCamadasDaOrg(pool, tenantId) : null;
  const camadaSemanticaLigada =
    camadasDaOrg !== null &&
    camadaLigada(camadasDaOrg.promessa_semantica, deps.knobs.promiseSemantic?.enabled === true);

  const chain = await runBeforeSend({
    pool,
    log: runLog,
    tenantId,
    leadId,
    jobId: job.id,
    channelSessionId,
    body,
    optedOutThisTurn,
    crmDailyLimit: null,
    now: clock(),
    sleep: deps.sleep,
    lgpd: context.lgpd,
    ...(deps.knobs.disclosureMode !== undefined ? { disclosureMode: deps.knobs.disclosureMode } : {}),
    ...(camadaSemanticaLigada
      ? {
          classifyPromiseSemantic: (candidate: string) =>
            classifyPromise(
              pool,
              deps.llmCfg,
              { tenantId, leadId, jobId: job.id },
              { candidate, ...(deps.knobs.promiseSemantic?.model !== undefined ? { model: deps.knobs.promiseSemantic.model } : {}) },
              { ...(deps.registry !== undefined ? { registry: deps.registry } : {}), log: runLog },
            ),
        }
      : {}),
    send: (finalBody) => channel.send({ tenantId, leadId, jobId: job.id, jobClaim:claimOfJob(job), seq: 1, conversationId, body: finalBody }),
  });

  if (chain.status === 'vetoed') {
    if (chain.code === 'outside_window' && chain.nextAllowedAt !== undefined) {
      await rescheduleReentry(pool, {
        tenantId,
        leadId,
        jobId: job.id,
        at: chain.nextAllowedAt,
        payload: job.payload,
      });
      runLog.info('envio fixo re-agendado por janela anti-ban', {
        code: chain.code,
        next_run_at: chain.nextAllowedAt.toISOString(),
      });
      return { kind: "deferred", until: chain.nextAllowedAt, reason: chain.code };
    }
    runLog.info('envio fixo vetado pela cadeia — não re-agendado', { code: chain.code });
    return { kind: "skipped" };
  }

  const outcome = chain.outcome;
  switch (outcome.kind) {
    case 'sent':
    case 'already_sent':
      runLog.info('envio fixo concluído', { kind: outcome.kind });
      return { kind: "sent" };
    case 'queued':
      throw new Error('envio fixo: mensagem aguardando o canal — não conclui o passo');
    case 'blocked':
      await applySendOutcome(pool, outcome, { jobId: job.id, workerId: ctx.workerId, tenantId, leadId, jobClaim:claimOfJob(job) }, {
        queuedRetryDelayMs: deps.knobs.queuedRetryDelayMs,
      });
      throw new JobSettledError('envio fixo vetado pelo sink (is_blocked) — job cancelado em definitivo');
    case 'failed':
      throw new Error('envio fixo: CRM marcou o envio como failed — run re-tentado pela fila');
    case 'unavailable':
      throw new Error(`envio fixo: canal indisponível (${outcome.reason}) — run re-tentado pela fila`);
  }
}

/**
 * Copia um arquivo de mídia do Storage do FLUXO (`{org}/flow-content/{flowId}/…`,
 * `POST /ai/followup-flows/:id/content-media`) para a pasta da CONVERSA
 * (`{org}/{conversationId}/…`) — mesmo motivo e mesmo padrão de
 * `copiarFotoNoStorage` (fotos-do-produto.ts) e da nota de voz: quem sabe assinar
 * URL curta pro canal, mostrar a mídia na inbox e apagar em cascata por LGPD
 * espera o arquivo na pasta da conversa, não em qualquer path solto.
 *
 * `false` NÃO derruba o envio — o item some da sequência (mesma resiliência das
 * fotos de catálogo: mídia que não copia fica de fora, o resto da sequência segue).
 */
async function copiarConteudoParaConversa(
  origem: string,
  destino: string,
  log: { warn(msg: string, fields?: Record<string, unknown>): void },
): Promise<boolean> {
  const { error } = await createAdminClient().storage.from('whatsapp-media').copy(origem, destino);
  if (!error) return true;
  // Já copiado antes para esta conversa (replay pós-crash): o arquivo que precisamos já está lá.
  if (/already exists/i.test(error.message) || (error as { statusCode?: string }).statusCode === '409') {
    return true;
  }
  log.warn('mídia do conteúdo não copiada para a conversa — item pulado', { detalhe: error.message.slice(0, 120) });
  return false;
}

/** Guarda na pasta da conversa a mídia que veio de um link. `false` = item pulado, nunca exceção. */
async function guardarMidiaNaConversa(
  destino: string,
  buffer: Buffer,
  mime: string,
  log: { warn(msg: string, fields?: Record<string, unknown>): void },
): Promise<boolean> {
  // `upsert`: num replay pós-crash o arquivo já está lá, e regravar o mesmo é inofensivo.
  const { error } = await createAdminClient()
    .storage.from('whatsapp-media')
    .upload(destino, buffer, { contentType: mime, upsert: true });
  if (!error) return true;
  log.warn('mídia do link não pôde ser guardada na conversa — item pulado', { detalhe: error.message.slice(0, 120) });
  return false;
}

/**
 * O nome original do documento, reduzido ao que uma chave do Storage aceita
 * (ASCII, sem barra): é o último segmento do path, e é dele que o handler tira
 * o nome que o cliente vê. `null` = sem nome utilizável, cai no nome genérico.
 */
function nomeSeguroParaStorage(filename: string | undefined): string | null {
  if (filename === undefined) return null;
  const limpo = filename
    .normalize('NFD')
    .split('')
    .map((c) => {
      const code = c.charCodeAt(0);
      if (code >= 0x300 && code <= 0x36f) return ''; // acento separado pelo NFD
      const ok =
        (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || c === '.' || c === '-' || c === '_';
      return ok ? c : '_';
    })
    .join('')
    .slice(-120);
  // Só pontos/sublinhados não é nome: `..` como segmento seria pior que o genérico.
  return limpo.split('').some((c) => c !== '.' && c !== '_') ? limpo : null;
}

/**
 * Os dados que as variáveis do fluxo usam. Etapa e campos de fluxo custam uma
 * consulta ao lead, então só são buscados quando algum texto os cita.
 */
async function dadosDoContatoParaVariaveis(
  pool: pg.Pool,
  tenantId: string,
  leadId: string,
  contato: { name: string | null; phone: string | null; email: string | null },
  textos: readonly string[],
): Promise<DadosDoContato> {
  let etapa: string | null = null;
  const campos: Record<string, string> = {};
  if (textos.some(citaDadoDoLead)) {
    const { rows } = await pool.query<{ name: string | null; custom_fields: Record<string, unknown> | null }>(
      `select s.name, l.custom_fields from crm_leads l left join crm_stages s on s.id = l.stage_id
        where l.organization_id = $1 and l.contact_id = $2
        order by l.updated_at desc limit 1`,
      [tenantId, leadId],
    );
    etapa = rows[0]?.name ?? null;
    for (const [chave, valor] of Object.entries(rows[0]?.custom_fields ?? {})) {
      // Só o que cabe num texto: objeto/lista (ex.: `_notes`) não é variável.
      if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean') {
        campos[chave] = String(valor);
      }
    }
  }
  return { nome: contato.name, telefone: contato.phone, email: contato.email, etapa, campos };
}

/**
 * Envia a sequência do nó "Conteúdo" (`action.mode = 'content'`), passando pela
 * MESMA cadeia de guardas anti-banimento que o texto de fluxo já usa — UMA
 * chamada a `runBeforeSend` para a sequência inteira, não uma por item (mesmo
 * desenho de `enviarComFotos`/`sendInBubbles`: o gate decide UMA vez se pode
 * mandar agora; o `send:` manda quantas bolhas físicas fizer sentido e devolve
 * só o ÚLTIMO desfecho).
 *
 * ─── O que cada tipo de item faz ───────────────────────────────────────────
 *  - `text`: bolha de texto.
 *  - `image`/`audio`: copia pro Storage da conversa (ver acima) e manda como
 *    mídia — áudio SEMPRE como nota de voz, mesma convenção do mapa de envio
 *    de mídia por canal já em vigor no produto.
 *  - `delay`: NÃO é send — é uma pausa a mais entre as bolhas ao redor dela.
 *    1–120s por item, no máximo 5 itens (schema): o pior caso trava o worker
 *    por poucos minutos, bem abaixo do QUEUE_VISIBILITY_TIMEOUT_MS (10min) —
 *    e mesmo se um job estourasse a janela e fosse reclamado por outro worker,
 *    o replay é seguro (idempotência por (jobId,seq) no sink do CRM).
 *  - `contact`: cartão de contato (nome + telefone) pelo MESMO caminho do envio
 *    manual do atendente — o adapter do canal monta o vCard.
 *  - `sticker`: figurinha (.webp), copiada pro Storage da conversa como a imagem,
 *    sem legenda.
 *  - `video`/`document`: mídia como a imagem, com a legenda no `body`. O
 *    documento é copiado para uma pasta própria com o NOME ORIGINAL do arquivo
 *    como último segmento — o handler tira o nome que o cliente vê do fim do
 *    path, e `conteudo-<job>-<seq>.pdf` não é nome que se entregue a ninguém.
 *
 * ─── Variáveis do contato ──────────────────────────────────────────────────
 * `{{nome}}`, `{{primeiro_nome}}`, `{{telefone}}`, `{{email}}` e `{{etapa}}`
 * são trocadas em TODO texto e legenda antes de qualquer coisa — inclusive
 * antes do portão, que precisa avaliar o que de fato vai sair. Ver
 * `variaveis-do-contato.ts`. Texto que fica VAZIO depois da troca (era só uma
 * variável sem valor) não vira bolha: o item é pulado.
 *
 * ─── Limitação conhecida, registrada (não escondida) ───────────────────────
 * A "spinning de copy" (variação de texto anti-detecção) só se aplica ao PRIMEIRO
 * item de texto — os campos de legenda e os textos seguintes saem literais. Mesma
 * classe de trade-off que `sendInBubbles` já documenta para o cap diário.
 */
async function sendConteudoSequence(
  deps: InboundTurnDeps,
  job: JobRow,
  pool: pg.Pool,
  ctx: { workerId: string },
  clock: () => Date,
  target: ReentrySendTarget,
  itensDoFluxo: readonly ConteudoItemPayload[],
): Promise<EnvioFixoDesfecho> {
  const { tenantId, leadId, channelSessionId, conversationId } = target;
  const runLog = withFields(deps.log, { job_id: job.id, tenant_id: tenantId, lead_id: leadId });

  if (await isLeadInHandoff(pool, tenantId, leadId)) {
    runLog.info('sequência de conteúdo pulada — lead silenciado (handoff/opt-out)', { kind: job.kind });
    return { kind: 'skipped' };
  }

  const context = await getLeadContext(
    pool,
    deps.crmCfg,
    { tenantId, leadId, fuso: await fusoDaOrganizacao(pool, tenantId, runLog) },
    { historyLimit: deps.knobs.historyLimit, maxTokens: deps.knobs.maxContextTokens },
  );
  if (!context.ok) {
    throw new Error(`sequência de conteúdo do follow-up falhou em get_lead_context (${context.error.code})`);
  }
  const optedOutThisTurn = context.context.contact.is_blocked;
  const channel = (deps.channel ?? ((p: pg.Pool) => new WahaChannelAdapter(p, deps.crmCfg)))(pool);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const jitter = () => 1200 + Math.floor(Math.random() * 800); // mesmo piso anti-ban das bolhas do turno normal

  // Variáveis do contato trocadas ANTES do portão: ele avalia o texto que sai.
  const textosDoFluxo = itensDoFluxo.flatMap((i) =>
    i.type === 'text'
      ? [i.body]
      : i.type === 'contact'
        ? [i.name, i.phone_number]
        : i.type === 'image' || i.type === 'video' || i.type === 'document'
          ? [i.caption, i.url].filter((x): x is string => x !== undefined)
          : [],
  );
  const dados = await dadosDoContatoParaVariaveis(pool, tenantId, leadId, context.context.contact, textosDoFluxo);
  const items = itensDoFluxo.flatMap((i): ConteudoItemPayload[] => {
    if (i.type === 'text') {
      const body = interpolarVariaveisDoContato(i.body, dados);
      if (body === '') {
        runLog.warn('texto do conteúdo ficou vazio depois das variáveis — item pulado');
        return [];
      }
      return [{ ...i, body }];
    }
    if (i.type === 'contact') {
      // O cartão também aceita variáveis (ex.: nome `{{nome}}`, telefone `{{telefone}}`).
      // Telefone que some depois da troca não vira cartão: o canal recusaria.
      const phone_number = interpolarVariaveisDoContato(i.phone_number, dados);
      if (phone_number === '') {
        runLog.warn('cartão de contato sem telefone depois das variáveis — item pulado');
        return [];
      }
      return [{ ...i, name: interpolarVariaveisDoContato(i.name, dados) || phone_number, phone_number }];
    }
    if (i.type === 'image' || i.type === 'video' || i.type === 'document') {
      const caption = i.caption !== undefined ? interpolarVariaveisDoContato(i.caption, dados) : undefined;
      // O link pode ser uma variável ("Campo de fluxo"): resolve agora. Link que
      // some (campo vazio) ou que continua com `{{…}}` (campo que não existe) não
      // tem o que baixar — o item é pulado.
      const url = i.url !== undefined ? interpolarVariaveisDoContato(i.url, dados) : undefined;
      if (i.url !== undefined && (url === undefined || url === '' || url.includes('{{'))) {
        runLog.warn('mídia por link sem endereço depois das variáveis — item pulado', { tipo: i.type });
        return [];
      }
      return [{ ...i, ...(caption !== undefined ? { caption } : {}), ...(url !== undefined ? { url } : {}) }];
    }
    return [i];
  });

  // Representativo pro portão (spinning/classificação) — nunca o que de fato sai
  // pros itens que não são o primeiro texto. Ver "limitação conhecida" acima.
  const primeiroTexto = items.find((i): i is Extract<ConteudoItemPayload, { type: 'text' }> => i.type === 'text');
  const corpoParaOPortao = primeiroTexto?.body ?? '[conteúdo]';

  const chain = await runBeforeSend({
    pool,
    log: runLog,
    tenantId,
    leadId,
    jobId: job.id,
    channelSessionId,
    body: corpoParaOPortao,
    optedOutThisTurn,
    crmDailyLimit: null,
    now: clock(),
    sleep: deps.sleep,
    lgpd: context.lgpd,
    ...(deps.knobs.disclosureMode !== undefined ? { disclosureMode: deps.knobs.disclosureMode } : {}),
    send: async (finalBody) => {
      let seq = 0;
      let ultimo: ChannelSendResult | undefined;
      let precisaDeJitter = false;
      let jaUsouOPrimeiroTexto = false;

      for (const item of items) {
        if (item.type === 'delay') {
          await sleep(item.seconds * 1000);
          continue;
        }
        if (precisaDeJitter) await sleep(jitter());
        precisaDeJitter = true;
        seq += 1;

        if (item.type === 'text') {
          const usaFinalBody = !jaUsouOPrimeiroTexto && item === primeiroTexto;
          jaUsouOPrimeiroTexto = jaUsouOPrimeiroTexto || item === primeiroTexto;
          ultimo = await channel.send({
            tenantId, leadId, jobId: job.id, jobClaim: claimOfJob(job), seq, conversationId,
            body: usaFinalBody ? finalBody : item.body,
          });
        } else if (item.type === 'contact') {
          ultimo = await channel.send({
            tenantId, leadId, jobId: job.id, jobClaim: claimOfJob(job), seq, conversationId,
            // Só para o hash de idempotência do ledger — o cartão não tem corpo.
            body: `[contato] ${item.name} ${item.phone_number}`,
            contact: { name: item.name, phoneNumber: item.phone_number },
          });
        } else {
          // image | video | audio | document | sticker
          const base = `${tenantId}/${conversationId}/conteudo-${job.id}-${seq}`;
          // Documento e áudio-como-arquivo chegam com NOME: o original, quando há.
          const nomeDoArquivo =
            item.type === 'document' || (item.type === 'audio' && item.voice_note === false)
              ? nomeSeguroParaStorage(item.filename)
              : null;
          let destino: string;
          let mime: string;
          if ('url' in item && item.url !== undefined) {
            // Origem por LINK: baixa (com as guardas anti-SSRF) e guarda na conversa.
            const baixada = await (deps.baixarMidiaDoLink ?? baixarMidiaDoLink)(item.url, item.type);
            if (!baixada.ok) {
              runLog.warn('mídia do link não pôde ser baixada — item pulado', { tipo: item.type, motivo: baixada.motivo });
              seq -= 1;
              continue;
            }
            const nome = item.type === 'document' ? nomeSeguroParaStorage(item.filename ?? baixada.nome ?? undefined) : null;
            destino = nome !== null ? `${base}/${nome}` : `${base}.${extFromMime(baixada.mime)}`;
            mime = baixada.mime;
            const guardou = await guardarMidiaNaConversa(destino, baixada.buffer, mime, runLog);
            if (!guardou) {
              seq -= 1;
              continue;
            }
          } else {
            const origem = item.storage_path;
            if (origem === undefined || item.mime === undefined) {
              runLog.warn('item de mídia sem arquivo nem link — pulado (o salvar deveria ter barrado isto)', { tipo: item.type });
              seq -= 1;
              continue;
            }
            destino = nomeDoArquivo !== null ? `${base}/${nomeDoArquivo}` : `${base}.${origem.split('.').pop() ?? 'bin'}`;
            mime = item.mime;
            const copiou = await copiarConteudoParaConversa(origem, destino, runLog);
            if (!copiou) {
              seq -= 1; // este item não virou send físico — devolve o seq pro próximo item
              continue;
            }
          }
          ultimo = await channel.send({
            tenantId, leadId, jobId: job.id, jobClaim: claimOfJob(job), seq, conversationId,
            // Legenda só onde o canal tem legenda: áudio e figurinha não têm.
            body: 'caption' in item ? (item.caption ?? '') : '',
            media: {
              storagePath: destino,
              mime,
              kind: item.type,
              // "Enviar como áudio gravado?" desligado: sai como arquivo de áudio.
              ...(item.type === 'audio' && item.voice_note === false ? { audioAsFile: true } : {}),
            },
          });
        }
        if (ultimo && !OK_KINDS.has(ultimo.kind)) return ultimo;
      }
      // Só pausas, ou tudo pulado (mídia que não copiou, itens sem motor): nada foi
      // fisicamente enviado. `validarItensDeConteudo` deveria ter barrado um nó só
      // de pausas no publish; chegar aqui é o caminho degradado, não o esperado —
      // 'already_sent' com id vazio é a MESMA forma que o replay pós-crash já usa
      // para "nada a fazer, sem erro".
      return ultimo ?? { kind: 'already_sent', idempotencyKey: `${job.id}:vazio`, messageId: null };
    },
  });

  if (chain.status === 'vetoed') {
    if (chain.code === 'outside_window' && chain.nextAllowedAt !== undefined) {
      await rescheduleReentry(pool, { tenantId, leadId, jobId: job.id, at: chain.nextAllowedAt, payload: job.payload });
      runLog.info('sequência de conteúdo re-agendada por janela anti-ban', {
        code: chain.code,
        next_run_at: chain.nextAllowedAt.toISOString(),
      });
      return { kind: 'deferred', until: chain.nextAllowedAt, reason: chain.code };
    }
    runLog.info('sequência de conteúdo vetada pela cadeia — não re-agendada', { code: chain.code });
    return { kind: 'skipped' };
  }

  const outcome = chain.outcome;
  switch (outcome.kind) {
    case 'sent':
    case 'already_sent':
      runLog.info('sequência de conteúdo concluída', { kind: outcome.kind });
      return { kind: 'sent' };
    case 'queued':
      throw new Error('sequência de conteúdo: mensagem aguardando o canal — não conclui o passo');
    case 'blocked':
      await applySendOutcome(pool, outcome, { jobId: job.id, workerId: ctx.workerId, tenantId, leadId, jobClaim: claimOfJob(job) }, {
        queuedRetryDelayMs: deps.knobs.queuedRetryDelayMs,
      });
      throw new JobSettledError('sequência de conteúdo vetada pelo sink (is_blocked) — job cancelado em definitivo');
    case 'failed':
      throw new Error('sequência de conteúdo: CRM marcou o envio como failed — run re-tentado pela fila');
    case 'unavailable':
      throw new Error(`sequência de conteúdo: canal indisponível (${outcome.reason}) — run re-tentado pela fila`);
  }
}

/**
 * Re-agenda a re-entrada para `at` (próxima janela válida) num cron_job 'at' one-shot
 * (F3-01), reusando o payload de origem (mantém mode='template'). IDEMPOTENTE por job
 * de origem: dois runs do MESMO job (retry pós-crash) criam UM só cron. staggerWindowMs
 * 0 de propósito — o jitter anti-ban já está embutido em `at` (nextAllowedAt do gate),
 * não é um número novo escondido.
 * ponytail: check-then-insert é seguro porque o followup_turn de um lead roda numa lane
 * serializada (F2-03) e o retry é sequencial; se um dia rodar concorrente por lead, vira
 * unique index parcial em (tenant_id, lead_id, payload->>'reschedule_of').
 */
async function rescheduleReentry(
  pool: pg.Pool,
  input: { tenantId: string; leadId: string; jobId: string; at: Date; payload: Record<string, unknown> },
): Promise<void> {
  const { rowCount } = await pool.query(
    `select 1 from cron_jobs
     where organization_id = $1 and contact_id = $2 and payload->>'reschedule_of' = $3`,
    [input.tenantId, input.leadId, input.jobId],
  );
  if (rowCount !== null && rowCount > 0) {
    return; // já re-agendado para este job (idempotência)
  }
  await scheduleCronJob(pool, input.tenantId, {
    leadId: input.leadId,
    spec: { kind: 'at', at: input.at },
    jobKind: 'followup_turn',
    payload: { ...input.payload, reschedule_of: input.jobId },
    staggerWindowMs: 0,
  });
}
