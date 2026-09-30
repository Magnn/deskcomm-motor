import type { ServiceBoundary } from "@/lib/atendimento/fronteira";
/**
 * Node handlers for the follow-up flow engine (Task 4.1) — PURE, no DB access.
 * `engine.ts` owns the tick/DB orchestration; this file only decides "given
 * this node + these facts, what happens next" so it's testable without Postgres.
 */
import {
  PERGUNTA_SEM_PRAZO_MS,
  prazoDaPerguntaMs,
  AGENT_SILENCE_BRANCH_ID,
  NO_REPLY_BRANCH_ID,
  REPEAT_BODY_BRANCH_ID,
  REPEAT_DONE_BRANCH_ID,
  nodeBranches,
} from "./graph-schema";
import type { FlowEdge, FlowNode, ReplySaveTo } from "./graph-schema";
import { parseReplyCount } from "./parse-count";
import { rotuloDoRamo } from "./rotulo-do-ramo";
import { clampEspera, esperaPlanejadaDe, type EsperaAdaptativa } from "./timing-plan";
import { fraseDeConfirmacao } from "./vocabulario";

export type EnrollmentStatus =
  | "active"
  | "waiting_reply"
  /**
   * Espera longa imune à resposta (nó `wait` com `immune_to_reply`).
   *
   * TEM relógio como `active` — é o `next_eval_at` que a acorda —, mas está
   * fora de `LIVE_STATUSES` em `reactivity.ts`, então a mensagem do contato não
   * a cancela nem corta o timer, e fora do índice único anti-spam, então o
   * contato continua podendo entrar noutra cadência enquanto dorme.
   */
  | "dormente"
  | "paused_handoff"
  /**
   * Roteiro de atendimento em andamento (0394). Conduzido pelo TURNO, não pelo
   * relógio: o motor de follow-up nunca o reclama (o claim filtra
   * `active|waiting_reply`). Está aqui porque o opt-out o alcança
   * (`reactivity.ts`) e o cancelamento pela fila o encerra.
   */
  | "coletando"
  /**
   * Um agente de IA conduz a conversa dentro de um fluxo (nó `agent`, migration 0901).
   *
   * Conduzido pelo TURNO, como o `coletando` — a mensagem da pessoa é um turno do
   * agente, não um motivo para o fluxo cancelar ou acordar —, mas COM relógio, como o
   * `dormente`: o `next_eval_at` é o prazo de silêncio do nó, e o claim o acorda.
   * Fora de `LIVE_STATUSES` (`reactivity.ts`) pelo mesmo motivo do `dormente`: a
   * reatividade nem o carrega. O opt-out e a LGPD o alcançam, como a todos.
   */
  | "com_agente"
  | "completed"
  | "cancelled"
  | "dead";

export type EnrollmentOutcome = "converted" | "replied" | "exhausted" | "opted_out" | "handoff";

/**
 * Snapshot of a `followup_enrollments` row — plain data (not tied to any DB
 * client) so both the pg-backed test adapter and a future supabase-js adapter
 * can produce it. Field names mirror the table (migration 0054) 1:1.
 */
export interface EnrollmentRow {
  service_boundary?: ServiceBoundary | null;
  revision?: number;
  appointment_id?: string | null;
  appointment_revision?: number | null;
  id: string;
  organization_id: string;
  pointer_id: string;
  version_id: string;
  contact_id: string;
  conversation_id: string | null;
  current_node_id: string;
  status: EnrollmentStatus;
  next_eval_at: string | null;
  claimed_until: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  steps_taken: number;
  outcome: EnrollmentOutcome | null;
  cancel_reason: string | null;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
  /**
   * Plano de tempo decidido no acionamento (migration 0144) — `unknown` porque
   * é `jsonb` e um clone pode ter qualquer coisa lá; quem lê é
   * `esperaPlanejadaDe` (timing-plan.ts), que degrada em vez de lançar.
   * Ausente/`null` = enrollment de antes da feature ⇒ comportamento anterior.
   */
  timing_plan?: unknown;
}

/** Minimal typed facts a `condition` node can check — loaded by the engine, never guessed. */
export interface LeadFacts {
  lead_stage: string | null;
  tags: string[];
  steps_taken: number;
  /**
   * Desfecho do passo anterior — a classe que o último `ai_classify` escolheu,
   * lida dos eventos da inscrição (`ultimoDesfechoDe`). `null` quando o fluxo
   * ainda não classificou nada; e `null` NÃO satisfaz `neq` (ver `evaluateCheck`).
   */
  last_outcome: string | null;
  contact_name?: string | null;
  custom_fields?: Record<string, unknown>;
}

/** Reference to a `followup_enrollment_events` row — only what `resolveWaitPhase` needs. */
export interface EnrollmentEventRef {
  node_id: string | null;
  idempotency_key: string | null;
  event_type?: string | null;
  payload?: Record<string, unknown> | null;
}

export type NodeResult =
  // `reason` só aparece quando o avanço NÃO é o avanço comum: hoje, o trigger
  // desistindo do plano de tempo (o turno nunca voltou). Vira event_type próprio
  // no engine — seguir sem plano é um fato que o operador precisa poder ler.
  | { kind: "advance"; next_node_id: string; next_eval_at: Date; reason?: "plan_timeout"; repeat?: { index: number; total: number } }
  // stays on the node. `wake_status` parks `match_reply` in waiting_reply without a job, and the `agent` node in
  // `com_agente` (the agent leads by TURN; the clock is only the silence deadline).
  | {
      kind: "wait";
      next_eval_at: Date;
      wake_status?: "active" | "waiting_reply" | "dormente" | "com_agente";
      deadline_at?: Date;
    }
  | {
      kind: "enqueue_turn";
      purpose: "send_message" | "classify" | "plan_timing" | "generic_ai";
      wake_status: "active" | "waiting_reply";
      fixed_body?: string;
    }
  // action recheck: the send turn is already in flight; stay put WITHOUT re-enqueuing (anti-dup-send).
  | { kind: "recheck"; next_eval_at: Date }
  // action dead-man: the turn never completed after MAX_ACTION_RECHECKS — give up (engine routes to markDead).
  | { kind: "dead"; reason: string }
  // outcome is nullable for the 'custom' end-node case (cancel_reason carries the note instead).
  | { kind: "complete"; outcome: EnrollmentOutcome | null; cancel_reason?: string }
  // A saída que o fluxo tomaria não está ligada a nada: o lead FICA PARADO neste nó, sem erro e sem
  // avançar — o funil só anda até onde o dono o montou. Fica no registro (o motivo) e na linha do tempo.
  // `aguardando_resposta`: parado, mas ainda ATENTO — uma resposta tardia acorda o nó e sai por «Respondeu».
  // `concluiu`: o nó JÁ fez o seu trabalho (avisou, anotou, chamou a API…) — só não tem para onde ir.
  | { kind: "park"; reason: string; aguardando_resposta?: boolean; concluiu?: boolean }
  | { kind: "fail"; error: string };

/** Backoff ladder indexed by `attempts - 1` (clamped to the last slot) — 30s..1h. */
export const BACKOFF_MS = [30_000, 60_000, 300_000, 900_000, 3_600_000] as const;

/** Recheck cadence while an action's send turn is in flight — how long the engine waits before
 *  looking again to see if the turn landed. Imported by engine.ts for the enqueue next_eval_at too. */
export const ACTION_RECHECK_MS = 5 * 60_000;

/** Teto do backoff entre rechecks — a partir daqui a espera não cresce mais. */
export const ACTION_RECHECK_MAX_MS = 60 * 60_000;

/**
 * Dead-man bound: idle rechecks tolerated on an action node before a turn that never completes
 * (worker down / permanently failing) is markDead — never re-enqueues, never waits forever.
 *
 * ⚠️ ERA 5, E 5 × 5min MATAVA TODO FOLLOW-UP DA NOITE. A espera do envio tem um
 * motivo LEGÍTIMO e longo que este contador não distinguia de "worker morto": a
 * janela anti-ban (7h–22h no padrão). Um toque que caísse às 22h ficava ~25 min
 * em recheck e o enrollment morria com `action_turn_never_completed` — o lead
 * nunca recebia, e o motivo registrado era falso. Medido em produção
 * (2026-08-18): enrollment `dead` no nó de abertura, com o worker vivo e o turno
 * apenas esperando a janela.
 *
 * Com o backoff de `atrasoDoRecheck`, este orçamento cobre ~11h — mais que a
 * maior noite fechada — e ainda custa poucos ticks. O dead-man continua
 * existindo: worker realmente morto termina em `dead`, só que depois de uma
 * espera que não confunde noite com defeito.
 *
 * ⚠️ E SUBIR O NÚMERO NÃO É A DEFESA — a defesa é `EVENTO_ACAO_ADIADA`.
 * Aumentar o teto só compra tempo contra a espera mais longa que alguém
 * configurou, e essa espera não tem teto: as horas e os dias da janela
 * anti-ban são knobs por canal (uma noite de sábado com domingo fechado já dá
 * 33h), e a faixa de envio do agente permite um único dia da semana (159h).
 * Contra um orçamento fixo, esse jogo não se ganha. O que o resolve é o turno
 * DIZER que está estacionado, e o contador medir só a ociosidade depois disso
 * — ver `rechecksOciososDaAcao` logo abaixo.
 */
export const MAX_ACTION_RECHECKS = 14;
export const ATTENDANT_ROUTE_POLL_MS = 60_000;

/**
 * Quanto esperar até o próximo recheck da ação: 5min dobrando até 1h.
 *
 * Exponencial e não fixo porque as duas causas de espera têm escalas
 * diferentes: turno em voo volta em segundos (os primeiros rechecks são
 * curtos), janela fechada volta em horas (e aí não faz sentido perguntar de 5
 * em 5 minutos por 9 horas).
 */
export function destinoJaPreenchido(lead: LeadFacts, saveTo: ReplySaveTo): boolean {
  if (saveTo.kind === "contact_name") return Boolean(lead.contact_name?.trim());
  const v = lead.custom_fields?.[saveTo.key];
  if (typeof v === "string") return v.trim().length > 0;
  return v !== undefined && v !== null && v !== "";
}

/** Resposta que MANTÉM o valor já gravado no modo `confirm`. */
export function ehConfirmacao(body: string): boolean {
  const t = body.trim().toLowerCase();
  return /^(sim|s|yes|ok|isso|correto|confirmo|confirmar|pode)([.!]?)$/.test(t) || t === "isso mesmo";
}

function modoSeJaExiste(node: Extract<FlowNode, { type: "match_reply" }>): "skip" | "overwrite" | "confirm" {
  return node.config.if_exists ?? "overwrite";
}

export function atrasoDoRecheck(rechecksJaFeitos: number): number {
  const passo = Math.max(0, rechecksJaFeitos);
  return Math.min(ACTION_RECHECK_MS * 2 ** passo, ACTION_RECHECK_MAX_MS);
}

/**
 * O evento que o turno grava quando o envio foi ADIADO para um instante CONHECIDO
 * — janela fechada (anti-ban, ou a faixa do próprio agente), e não defeito.
 *
 * É PROVA DE VIDA, e essa é a razão de ele existir. O dead-man da ação mede
 * "rechecks sem o turno fechar", e essa medida não distingue duas situações
 * opostas: o worker morreu, e o worker está vivo e o envio está estacionado
 * até a janela abrir. Enquanto o adiamento era silencioso, as duas só se
 * pareciam — e o orçamento de ~11h de `MAX_ACTION_RECHECKS` era gasto por
 * espera legítima, matando o enrollment com um motivo falso
 * (`action_turn_never_completed`) enquanto o envio ainda ia acontecer.
 */
export const EVENTO_ACAO_ADIADA = "action_deferred";

/**
 * Rechecks ociosos da ação NESTA estadia — o número que o dead-man deve medir.
 *
 * Idêntico a `occupancyEventCount` enquanto não houver adiamento (o dead-man
 * continua exatamente tão severo com worker morto quanto antes); a diferença é
 * que ele PARA no último `action_deferred`. Cada adiamento é uma prova de vida
 * nova, e o que se conta é a ociosidade DEPOIS dela.
 */
export function rechecksOciososDaAcao(events: EnrollmentEventRef[], nodeId: string): number {
  let n = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const evento = events[i]!;
    if (evento.node_id !== nodeId) break;
    if (evento.event_type === EVENTO_ACAO_ADIADA) return n;
    n++;
  }
  return n;
}

/**
 * Dead-man do PLANO de tempo: rechecks tolerados no `trigger` esperando o turno
 * de planejamento voltar. Menor que o da ação (3 × 5min ≈ 15min) e com desfecho
 * OPOSTO — aqui o fluxo SEGUE sem plano, nunca morre. Um planejador de tempo
 * indisponível não pode matar o follow-up: sem ele o fluxo ainda funciona
 * inteiro (cai no máximo de cada espera, que é o comportamento anterior);
 * matar o enrollment trocaria uma degradação por uma perda.
 */
export const MAX_PLAN_RECHECKS = 3;

export type EdgeMatch =
  | { type: "always" }
  | { type: "class_match"; value: string }
  | { type: "cond_result"; value: boolean }
  | { type: "branch"; branch_id: string };

/**
 * Qual saída de um nó de classificação leva à classe `classe` — resolvendo os
 * dois dialetos (nó v1 casa por texto, nó migrado casa pelo id estável do ramo).
 *
 * Existe como função porque a MESMA pergunta é feita em dois pontos do caminho
 * de execução: aqui, quando o prazo vence sem resposta, e no `turn-bridge`,
 * quando o modelo classifica. Consertar só um dos dois deixava o fluxo migrado
 * roteando certo para quem responde e errado, em silêncio, para quem não
 * responde — que num follow-up é o caso mais comum. Achado pelo DevVivo na
 * revisão: eu tinha ensinado o `selectEdge` a casar ramo e usado isso só no
 * `condition`.
 *
 * Casa por rótulo E por id de propósito: `no_reply` é reservado (id `no_reply`,
 * rótulo "Sem resposta"), e uma classe do usuário é achada pelo texto que ele
 * escreveu.
 */
export function classEdgeMatch(
  node: Extract<FlowNode, { type: "ai_classify" | "match_reply" }>,
  classe: string,
): EdgeMatch {
  const ramo = nodeBranches(node).find(
    (b) => b.kind === "match" && (b.label === classe || b.id === classe),
  );
  return ramo?.condition.type === "branch"
    ? { type: "branch", branch_id: ramo.condition.branch_id }
    : { type: "class_match", value: classe };
}

/**
 * Picks the outbound edge from `from`: highest `priority` first, exact
 * condition match tried first, `always` as fallback. `null` if nothing fits.
 */
export function selectEdge(edges: FlowEdge[], from: string, match: EdgeMatch): FlowEdge | null {
  const candidates = edges.filter((e) => e.source === from).slice().sort((a, b) => b.priority - a.priority);

  const exact = candidates.find((e) => {
    switch (match.type) {
      case "always":
        return e.condition.type === "always";
      case "class_match":
        return e.condition.type === "class_match" && e.condition.value === match.value;
      case "cond_result":
        return e.condition.type === "cond_result" && e.condition.value === match.value;
      case "branch":
        return e.condition.type === "branch" && e.condition.branch_id === match.branch_id;
    }
  });
  if (exact) return exact;

  if (match.type !== "always") {
    const fallback = candidates.find((e) => e.condition.type === "always");
    if (fallback) return fallback;
  }
  return null;
}

/**
 * A aresta que sai EXATAMENTE pela condição pedida — sem o escape para `always` que `selectEdge` faz.
 *
 * É a regra do funil: o lead só anda por uma saída que alguém LIGOU. Quando a saída que o motor escolheu
 * não tem aresta, o lead FICA (`park`) — cair na saída de escape («Outros casos») afirmaria um caminho que a
 * decisão não tomou (o «Sem resposta» solto virando «Respondeu», o «Sim» solto virando «Outros casos»).
 * `always` só é pedido onde `always` É a saída decidida (nó de saída única, ou «nenhuma regra serviu»).
 */
export function selectEdgeExata(edges: FlowEdge[], from: string, match: EdgeMatch): FlowEdge | null {
  return (
    edges
      .filter((e) => e.source === from)
      .slice()
      .sort((a, b) => b.priority - a.priority)
      .find((e) => {
        switch (match.type) {
          case "always":
            return e.condition.type === "always";
          case "class_match":
            return e.condition.type === "class_match" && e.condition.value === match.value;
          case "cond_result":
            return e.condition.type === "cond_result" && e.condition.value === match.value;
          case "branch":
            return e.condition.type === "branch" && e.condition.branch_id === match.branch_id;
        }
      }) ?? null
  );
}

/**
 * A saída da CLASSE que o modelo escolheu. Classe DECLARADA leva pela aresta dela (e, sem aresta, o lead
 * fica). Classe FORA das declaradas é o caso «Outros casos» — a única situação em que a saída de escape é
 * a decisão certa, e não um atalho para fugir de uma saída solta.
 */
export function arestaDaClasse(
  node: Extract<FlowNode, { type: "ai_classify" | "match_reply" }>,
  edges: FlowEdge[],
  classe: string,
): { edge: FlowEdge | null; declarada: boolean } {
  const declarada = nodeBranches(node).some((b) => b.kind === "match" && (b.label === classe || b.id === classe));
  const edge = declarada
    ? selectEdgeExata(edges, node.id, classEdgeMatch(node, classe))
    : selectEdgeExata(edges, node.id, { type: "always" });
  return { edge, declarada };
}

function arestaDoRamo(edges: FlowEdge[], from: string, branchId: string): FlowEdge | null {
  return selectEdgeExata(edges, from, { type: "branch", branch_id: branchId });
}

/** O nome da saída como o dono a vê no construtor (o rótulo que ele escreveu, ou a frase da regra). */
function nomeDoRamo(node: FlowNode, branchId: string): string {
  const ramo = nodeBranches(node).find((b) => b.id === branchId);
  return ramo ? rotuloDoRamo(ramo) : branchId;
}

/** O lead fica neste nó. `motivo` diz QUAL saída faltou — é o que a linha do tempo mostra ao dono. */
function parar(motivo: string, opts: { concluiu?: boolean; aguardandoResposta?: boolean } = {}): NodeResult {
  return {
    kind: "park",
    reason: motivo,
    ...(opts.concluiu ? { concluiu: true } : {}),
    ...(opts.aguardandoResposta ? { aguardando_resposta: true } : {}),
  };
}

/** A pergunta como o cliente a lê: a frase sugerida, senão o rótulo; opções de múltipla escolha numeradas. */
function textoDaPergunta(config: Extract<FlowNode, { type: "collect" }>["config"]): string {
  const base = (config.question ?? "").trim() || config.label;
  if (config.type !== "select" || !config.options || config.options.length === 0) return base;
  return `${base}\n\n${config.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}`;
}

/**
 * A `wait` node is entered twice: once to start the timer (writes the
 * generic step event), once after `next_eval_at` elapses to advance. Both
 * ticks see the SAME node (current_node_id unchanged) with `steps_taken`
 * incrementing by exactly 1 on every applied step (engine.ts) — so "did we
 * already start this wait" is exactly "does the event for the PRIOR step on
 * this node exist".
 */
export function occupancyEventCount(events: EnrollmentEventRef[], nodeId: string): number {
  let n = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]!.node_id !== nodeId) break;
    n++;
  }
  return n;
}

/**
 * O turno de envio desta estadia no `action` (ou o turno de IA genérica do
 * `ai_generic`) já fechou. Se o enrollment ainda aponta pro nó, foi corrida
 * com o recheck (ou update perdido no completeTurn) — o motor deve avançar,
 * não rechecar.
 *
 * `doneEventType` é parâmetro (default `"action_sent"`, o comportamento de
 * sempre) porque o `ai_generic` fecha com um evento PRÓPRIO
 * (`"ai_generic_done"`) — os dois nós compartilham o mesmo contrato de
 * ocupação/recheck/dead-man (ver `processNode`), só o rótulo do evento de
 * conclusão muda.
 */
export function actionTurnCompleted(
  events: EnrollmentEventRef[],
  nodeId: string,
  doneEventType: string = "action_sent",
): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]!.node_id !== nodeId) break;
    if (events[i]!.event_type === doneEventType) return true;
  }
  return false;
}

export function repeatTakenFromEvents(events: EnrollmentEventRef[], nodeId: string): number {
  return events.filter(
    (e) => e.node_id === nodeId && typeof e.payload?.repeat_index === "number",
  ).length;
}

export function repeatTotalFromEvents(events: EnrollmentEventRef[], nodeId: string): number | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const total = events[i]!.payload?.repeat_total;
    if (events[i]!.node_id === nodeId && typeof total === "number") return total;
  }
  return null;
}

export function latestRepeatIndex(events: EnrollmentEventRef[]): { index: number; total: number } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const index = events[i]!.payload?.repeat_index;
    const total = events[i]!.payload?.repeat_total;
    if (typeof index === "number" && typeof total === "number") return { index, total };
  }
  return null;
}

export function resolveWaitPhase(events: EnrollmentEventRef[], nodeId: string, stepsTaken: number): boolean {
  const priorKey = `${nodeId}:${stepsTaken - 1}`;
  return events.some((e) => e.node_id === nodeId && e.idempotency_key === priorKey);
}

/**
 * Piso do inbound que casa neste `match_reply`: o instante em que a espera
 * começou, não o `updated_at` da inscrição.
 *
 * O `inbound_woke` (e qualquer tick depois) regrava `updated_at`. Usar essa
 * coluna como piso esconde a mensagem que ACORDOU a espera — ela chegou
 * segundos antes do wake. `wait_started.payload.next_eval_at` é park+graça,
 * então park = next_eval_at − grace_timeout_ms.
 */
export function pisoDoInboundDaEspera(
  node: Extract<FlowNode, { type: "match_reply" | "menu" | "collect" }>,
  events: EnrollmentEventRef[],
  fallback: string,
): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.node_id !== node.id) continue;
    const eventoDeEspera = node.type === "menu" ? "menu_sent" : node.type === "collect" ? "collect_sent" : "wait_started";
    if (e.event_type !== eventoDeEspera) continue;
    const next = e.payload?.next_eval_at;
    if (typeof next !== "string") break;
    const espera = node.type === "collect" ? (prazoDaPerguntaMs(node.config) ?? PERGUNTA_SEM_PRAZO_MS) : node.config.grace_timeout_ms;
    const start = Date.parse(next) - espera;
    if (Number.isFinite(start)) return new Date(start).toISOString();
    break;
  }
  return fallback;
}

/**
 * Passos é número, mas o formulário gravou por meses o que se DIGITAVA — texto.
 * Com `"3"`, `gte` nunca era verdadeiro e `neq` sempre era: a regra aparecia
 * pronta no card e decidia sozinha. Lê o número que a pessoa escreveu; texto que
 * não é número segue como está (e o publish o recusa).
 */
function valorDePassos(value: string | number): string | number {
  if (typeof value === "number") return value;
  const limpo = value.trim();
  const n = Number(limpo);
  return limpo !== "" && Number.isFinite(n) ? n : value;
}

/**
 * O evento que registra a classe que o `ai_classify` escolheu — a fonte do
 * "Desfecho do passo anterior" (é o mesmo evento que a tela de histórico lê).
 */
const EVENTO_DE_CLASSIFICACAO = "ai_classified";

/**
 * O desfecho do último passo que DECIDIU algo: a classe escolhida pelo
 * `ai_classify` mais recente da inscrição. `null` quando ainda não houve
 * classificação (fluxo que nunca passou por um `ai_classify`, ou classificação
 * que terminou sem classe).
 *
 * ⚠️ Este dado existia como CONTRATO (o rótulo "Desfecho do passo anterior" está
 * em `vocabulario.ts`, o campo está no enum do `graph-schema.ts` e a tela o
 * oferece) e não como dado: o motor montava `LeadFacts.last_outcome` como `null`
 * FIXO em `engine.ts`, então a condição escrita com ele era decorativa — o dono
 * da VPS montava o filtro e o follow-up ignorava. Era pior com `neq`, porque
 * `null !== "x"` é `true` e o fluxo mandava TODO lead pelo ramo da negativa.
 *
 * `events` chega na ordem do banco (`created_at` ascendente) — o ÚLTIMO evento de
 * classificação é o desfecho vigente, não importa quantos passos atrás ele ficou.
 */
export function ultimoDesfechoDe(events: EnrollmentEventRef[]): string | null {
  for (const evento of [...events].reverse()) {
    if (evento.event_type !== EVENTO_DE_CLASSIFICACAO) continue;
    const classe = evento.payload?.class;
    if (typeof classe === "string" && classe.length > 0) return classe;
  }
  return null;
}

function evaluateCheck(
  check: { field: "lead_stage" | "tag" | "steps_taken" | "last_outcome"; op: "eq" | "neq" | "gte" | "lte" | "contains"; value: string | number },
  lead: LeadFacts,
): boolean {
  const actual: string | number | null | string[] =
    check.field === "lead_stage" ? lead.lead_stage
    : check.field === "tag" ? lead.tags
    : check.field === "steps_taken" ? lead.steps_taken
    : lead.last_outcome;

  if (Array.isArray(actual)) {
    // 'tag' é multi-valorado: eq/contains viram "está entre as tags"; gte/lte não fazem sentido.
    const included = actual.includes(String(check.value));
    if (check.op === "eq" || check.op === "contains") return included;
    if (check.op === "neq") return !included;
    return false;
  }

  // ⚠️ Desconhecido não satisfaz NEGAÇÃO.
  //
  // Sem esta linha, `neq` comparava `null` com o valor e respondia `true` — ou
  // seja, "não foi X" valia para TODO lead, inclusive o que nunca foi
  // classificado. É a segunda metade do defeito do "Desfecho do passo anterior":
  // com o campo alimentado, o lead cujo `ai_classify` ainda não rodou (ou que
  // terminou sem classe) passaria por qualquer condição escrita como negação, e
  // o fluxo seguiria pelo ramo errado em silêncio.
  //
  // `eq` e `contains` já eram falsos com `null` — negar não pode ser a única
  // porta que a ausência de dado abre. Ausência não prova a negativa: um lead
  // sem classificação não é um lead "que não foi hot".
  if (actual === null) return false;
  const expected = check.field === "steps_taken" ? valorDePassos(check.value) : check.value;
  switch (check.op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "contains":
      return typeof actual === "string" && typeof expected === "string" && actual.includes(expected);
  }
}

function evaluateCondition(
  config: Extract<FlowNode, { type: "condition" }>["config"],
  lead: LeadFacts,
): boolean {
  const results = config.checks.map((check) => evaluateCheck(check, lead));
  return config.combinator === "and" ? results.every(Boolean) : results.some(Boolean);
}

/**
 * Escolhe o braço do A/B split — DETERMINÍSTICO por inscrição: o mesmo
 * `seed` sempre cai no mesmo braço, então reavaliar o mesmo passo (retry,
 * corrida de tick) nunca redivide o tráfego, e a "conversão por caminho"
 * medida depois (via `followup_enrollment_events`) fica estável. Hash
 * FNV-1a de 32 bits — não é criptográfico, só precisa ser bem distribuído.
 */
export function hashSeedParaUnidade(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296; // [0, 1)
}

export function escolherRamoDoSplit(
  config: Extract<FlowNode, { type: "ab_split" }>["config"],
  seed: string,
): string {
  const sorteio = hashSeedParaUnidade(seed) * 100;
  let acumulado = 0;
  for (const branch of config.branches) {
    acumulado += branch.percent;
    if (sorteio < acumulado) return branch.id;
  }
  // Guarda de arredondamento: soma já é validada em 100 pelo schema, mas
  // float é float — o último braço fecha o intervalo.
  return config.branches[config.branches.length - 1]!.id;
}

/** O nó fez o que tinha a fazer: seguiu adiante, ou concluiu e parou por falta de saída ligada. */
export function executou(result: NodeResult): boolean {
  return result.kind === "advance" || (result.kind === "park" && result.concluiu === true);
}

/** O que `notify_agent` precisa gravar na Central de avisos — I/O fica com o engine. */
export interface AvisoDeFluxo {
  organization_id: string;
  title: string;
  body: string;
  ref_id: string;
}

/**
 * Reaproveita a Central de avisos (`agent_inbox_items`, kind `other` — "Aviso
 * do assistente") em vez de inventar um canal de notificação novo: é o MESMO
 * mecanismo que `engine.ts` já usa pra `followup_dead`/
 * `appointment_recovery_review`, só com um `kind` genérico já existente no
 * vocabulário (evita migration só por um rótulo — precedente explícito no
 * comentário de `abrirAvisoRecuperacaoEsgotada`).
 */
export function avisoDeNotificarAtendente(
  enrollment: EnrollmentRow,
  node: FlowNode,
  result: NodeResult,
): AvisoDeFluxo | null {
  if (node.type !== "notify_agent") return null;
  if (!executou(result)) return null;
  return {
    organization_id: enrollment.organization_id,
    title: "Aviso de um fluxo de follow-up",
    body: node.config.message,
    ref_id: enrollment.id,
  };
}

/** O que `add_note` precisa gravar como nota interna — I/O fica com o engine. */
export interface NotaDeFluxo {
  organization_id: string;
  conversation_id: string;
  body: string;
  enrollment_id: string;
}

/**
 * Reaproveita `conversation_notes` (o MESMO destino de `conversation.note_added`,
 * a nota que um humano cria pela Inbox) em vez de uma tabela nova. Sem
 * conversa vinculada à inscrição (`conversation_id` nulo) devolve `null` — o
 * fluxo AVANÇA do mesmo jeito (uma nota sem onde morar não pode travar o
 * passo), e o engine registra a ausência num log, não em silêncio total.
 */
export function notaDeFluxo(
  enrollment: EnrollmentRow,
  node: FlowNode,
  result: NodeResult,
): NotaDeFluxo | null {
  if (node.type !== "add_note") return null;
  if (!executou(result)) return null;
  if (!enrollment.conversation_id) return null;
  return {
    organization_id: enrollment.organization_id,
    conversation_id: enrollment.conversation_id,
    body: node.config.body,
    enrollment_id: enrollment.id,
  };
}

/** O que `api_call` precisa disparar — I/O (fetch + anti-SSRF) fica com o engine. */
export interface ChamadaDeApiFluxo {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

/** Reaproveita a config do nó tal como o cURL colado a preencheu — nenhuma transformação aqui. */
export function chamadaDeApiDoFluxo(node: FlowNode, result: NodeResult): ChamadaDeApiFluxo | null {
  if (node.type !== "api_call") return null;
  if (!executou(result)) return null;
  return {
    method: node.config.method,
    url: node.config.url,
    headers: Object.fromEntries(node.config.headers.map((h) => [h.key, h.value])),
    body: node.config.body ?? null,
  };
}

/**
 * Pure per-node decision. `waitElapsed` is resolved by the engine (via
 * `resolveWaitPhase` against real events) BEFORE calling this — optional so
 * non-`wait`/`ai_classify` calls don't need to pass it. For `ai_classify` it
 * means "a classify turn was already enqueued for this occupancy of the node"
 * (same prior-step-event check as `wait`) — re-entering with it `true` means
 * EITHER `grace_timeout_ms` elapsed without a completed classification OR
 * reactivity (Task 5.2, `lib/followup/reactivity.ts`) woke the node early
 * because an inbound reply arrived. `wokeEarly` is the signal that
 * disambiguates the two (own marker event, distinct from the
 * `classify_enqueued` event `waitElapsed` checks): `true` re-enqueues a fresh
 * classify turn with the real reply instead of auto-advancing via `no_reply`.
 */
export function processNode(input: {
  node: FlowNode;
  edges: FlowEdge[];
  enrollment: EnrollmentRow;
  lead: LeadFacts;
  clock: () => Date;
  waitElapsed?: boolean;
  wokeEarly?: boolean;
  /** Last inbound `messages.body` for this contact/conversation — engine loads on `match_reply` + wokeEarly. */
  lastInboundBody?: string;
  /** action occupancy guard: a `turn_enqueued` event for THIS stay on the action node already
   *  exists (an entry/recheck happened before). Resolved by the engine via `resolveWaitPhase`
   *  — same prior-step-event check as `wait`. When true, the send turn is in flight: DON'T
   *  re-enqueue (a second job_id would bypass the send sink's (job_id,seq) dedup → dup message). */
  actionEnqueued?: boolean;
  /** action dead-man counter: number of events already accumulated on this action node — used to
   *  bound rechecks so a turn that never completes routes to `dead` instead of looping forever. */
  actionRecheckCount?: number;
  /** action: `action_sent` já existe nesta estadia — o envio fechou; avançar (sara corrida com recheck). */
  actionCompleted?: boolean;
  /** trigger: as esperas adaptativas do grafo pinado (`coletarEsperasAdaptativas`). Vazio/ausente
   *  ⇒ não há o que planejar e o acionamento NÃO paga uma chamada de modelo. */
  smartWaits?: EsperaAdaptativa[];
  /** trigger occupancy guard: um turno de planejamento para ESTA estadia no trigger já foi
   *  enfileirado. Mesmo check de evento-do-passo-anterior do wait/action (`resolveWaitPhase`). */
  planEnqueued?: boolean;
  /** trigger dead-man counter: eventos já acumulados no nó trigger — limita os rechecks para que
   *  um turno de planejamento que nunca volta siga SEM plano em vez de esperar para sempre. */
  planRecheckCount?: number;
  /** `repeat`: quantas voltas deste nó já saíram por `body` (eventos com repeat_index). */
  repeatTaken?: number;
  /** `repeat`: N armado na primeira visita; null = ainda precisa parsear lastInboundBody. */
  repeatTotal?: number | null;
  /** Próximo nó pela aresta `always` — a ação olha o `match_reply` seguinte para pular o envio. */
  proximo?: FlowNode | null;
  attendantAssigned?: boolean;
  attendantDeadlineAt?: Date | null;
}): NodeResult {
  const {
    node,
    edges,
    enrollment,
    clock,
    lead,
    waitElapsed,
    wokeEarly,
    lastInboundBody,
    actionEnqueued,
    actionRecheckCount,
    actionCompleted,
    smartWaits,
    planEnqueued,
    planRecheckCount,
    repeatTaken,
    repeatTotal,
    proximo,
    attendantAssigned,
    attendantDeadlineAt,
  } = input;

  switch (node.type) {
    case "trigger": {
      const edge = selectEdge(edges, node.id, { type: "always" });
      if (!edge) return parar("o início do fluxo não está ligado a nada");

      // ACIONAMENTO: é aqui que o plano de tempo do fluxo inteiro é decidido, uma
      // única vez, antes do primeiro passo. Fluxo sem espera adaptativa e
      // enrollment que já tem plano seguem direto — nenhum custo de modelo, e o
      // comportamento de antes desta feature fica intacto.
      // `?? null` de propósito: a coluna chega `null` do banco e `undefined` de
      // um snapshot montado antes da migration 0144 — os dois querem dizer "sem
      // plano ainda", e tratar só um deles pularia o planejamento em silêncio.
      const precisaPlanejar = (smartWaits?.length ?? 0) > 0 && (enrollment.timing_plan ?? null) === null;
      if (!precisaPlanejar) {
        return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
      }
      if (!planEnqueued) {
        return { kind: "enqueue_turn", purpose: "plan_timing", wake_status: "active" };
      }
      if ((planRecheckCount ?? 0) >= MAX_PLAN_RECHECKS) {
        // O turno de planejamento nunca voltou. Seguir sem plano (cada espera cai
        // no seu máximo) é a degradação certa — ver MAX_PLAN_RECHECKS.
        return { kind: "advance", next_node_id: edge.target, next_eval_at: clock(), reason: "plan_timeout" };
      }
      return { kind: "recheck", next_eval_at: new Date(clock().getTime() + ACTION_RECHECK_MS) };
    }

    case "wait": {
      // Resposta do lead corta a espera: o timer é teto (ninguém respondeu),
      // não um atraso obrigatório depois de cada envio.
      if (wokeEarly) {
        const edge = selectEdge(edges, node.id, { type: "always" });
        if (!edge) return parar("a espera terminou e a saída do passo não está ligada a nada");
        return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
      }
      if (!waitElapsed) {
        // Adaptativo: o instante vem do plano decidido no acionamento. Sem plano
        // legível para ESTE nó (enrollment anterior à feature, fluxo v1, jsonb
        // corrompido), cai no máximo — que era o comportamento único até aqui.
        //
        // O clamp é REFEITO aqui, contra o nó, mesmo a ponte já tendo clampado ao
        // gravar: "quem decide o intervalo é o nó" só é invariante se valer na
        // LEITURA. `timing_plan` é jsonb num banco que o self-hoster administra —
        // uma linha editada à mão, ou um bug futuro que grave sem clampar,
        // prenderia o lead muito além do que o operador configurou na tela, e
        // ninguém veria. Custa uma comparação por espera.
        const planejada = node.config.mode === "smart" ? esperaPlanejadaDe(enrollment.timing_plan, node.id) : null;
        const durationMs =
          node.config.mode === "fixed"
            ? node.config.duration_ms
            : planejada === null
              ? node.config.max_ms
              : clampEspera(planejada.escolhido_ms, node.config.min_ms, node.config.max_ms).escolhido_ms;
        // Espera imune dorme: o status tira a inscrição do alcance da
        // reatividade (que decide por status, sem carregar o grafo) e libera o
        // slot único anti-spam enquanto ela espera. Quem a acorda continua sendo
        // o `next_eval_at` abaixo, pelo mesmo claim — não há segundo agendador.
        const imune = node.config.mode === "fixed" && node.config.immune_to_reply === true;
        return {
          kind: "wait",
          next_eval_at: new Date(clock().getTime() + durationMs),
          ...(imune ? { wake_status: "dormente" as const } : {}),
        };
      }
      const edge = selectEdge(edges, node.id, { type: "always" });
      if (!edge) return parar("a espera terminou e a saída do passo não está ligada a nada");
      return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
    }

    case "condition": {
      if (node.config.branching === "per_check") {
        // "Uma saída por regra": a PRIMEIRA regra que passa manda, e a ordem da
        // lista é a precedência — a mesma ordem que o usuário vê no formulário.
        // Duas regras verdadeiras não podem sortear caminho; `combinator` não
        // é consultado aqui, porque nesse modo a regra não vota, ela roteia.
        const hitId = node.config.checks.find((c) => c.id !== undefined && evaluateCheck(c, lead))?.id;
        // Nenhuma regra passou -> o ramo obrigatório 'else', que na aresta é `always`.
        // Regra que serviu com a SAÍDA dela solta NÃO cai aqui: o lead fica no nó (`parar`).
        const edge =
          hitId === undefined
            ? selectEdgeExata(edges, node.id, { type: "always" })
            : selectEdgeExata(edges, node.id, { type: "branch", branch_id: hitId });
        if (!edge) {
          return parar(
            hitId === undefined
              ? "nenhuma regra serviu e a saída «Nenhuma delas» não está ligada a nada"
              : `a saída «${nomeDoRamo(node, hitId)}» não está ligada a nada`,
          );
        }
        return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
      }
      const result = evaluateCondition(node.config, lead);
      const edge = selectEdgeExata(edges, node.id, { type: "cond_result", value: result });
      if (!edge) return parar(`a saída «${result ? "Sim" : "Não"}» não está ligada a nada`);
      return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
    }

    case "ab_split": {
      const branchId = escolherRamoDoSplit(node.config, `${enrollment.id}:${node.id}`);
      const edge = selectEdgeExata(edges, node.id, { type: "branch", branch_id: branchId });
      if (!edge) return parar(`o braço sorteado do teste A/B («${nomeDoRamo(node, branchId)}») não está ligado a nada`);
      return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
    }

    case "ai_classify": {
      if (!waitElapsed || wokeEarly) {
        // 1ª entrada (waitElapsed=false) OU reactivity acordou cedo com uma
        // resposta real (wokeEarly=true, mesmo com waitElapsed=true — o marker
        // de reactivity é o desempate): reenfileira classify. Nunca conta como
        // 'no_reply' quando existe reply de verdade em voo.
        return { kind: "enqueue_turn", purpose: "classify", wake_status: "waiting_reply" };
      }
      // grace_timeout_ms venceu sem turno de classificação concluído — classifica
      // como 'no_reply' SEM chamar o LLM (onda 5, critério 2). «Sem resposta» solto NÃO escorrega para o
      // escape («Outros casos»): o lead fica no nó.
      const edge = selectEdgeExata(edges, node.id, classEdgeMatch(node, NO_REPLY_BRANCH_ID));
      if (!edge) return parar("a saída «Sem resposta» não está ligada a nada");
      return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
    }

    case "match_reply": {
      if (!waitElapsed && !wokeEarly) {
        if (node.config.save_to && destinoJaPreenchido(lead, node.config.save_to)) {
          const modo = modoSeJaExiste(node);
          if (modo === "skip") {
            const edge = selectEdge(edges, node.id, { type: "always" });
            if (!edge) return parar("o campo já estava preenchido e a saída deste passo não está ligada a nada");
            return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
          }
          if (modo === "confirm") {
            const valor =
              node.config.save_to.kind === "contact_name"
                ? (lead.contact_name ?? "").trim()
                : String(lead.custom_fields?.[node.config.save_to.key] ?? "").trim();
            return {
              kind: "enqueue_turn",
              purpose: "send_message",
              wake_status: "waiting_reply",
              fixed_body: fraseDeConfirmacao(
                valor,
                node.config.save_to.kind === "contact_name" ? "contact_name" : "lead_custom",
              ),
            };
          }
        }
        return {
          kind: "wait",
          next_eval_at: new Date(clock().getTime() + node.config.grace_timeout_ms),
          wake_status: "waiting_reply",
        };
      }
      if (wokeEarly) {
        const body = (lastInboundBody ?? "").trim().toLowerCase();
        // inbound_woke sem texto desta pergunta (piso excluiu o "." que
        // enfileirou o menu) NÃO é ALWAYS nem no_reply — senão o fluxo
        // dispara o cardápio inteiro no mesmo request.
        if (!body) {
          if (!waitElapsed) {
            return {
              kind: "wait",
              next_eval_at: new Date(clock().getTime() + node.config.grace_timeout_ms),
              wake_status: "waiting_reply",
            };
          }
        } else {
          const hit =
            node.config.save_to !== undefined
              ? undefined
              : node.config.branches.find((b) => {
                  const needle = b.pattern.trim().toLowerCase();
                  if (needle.length === 0) return false;
                  return b.op === "eq" ? body === needle : body.includes(needle);
                });
          // A regra que casou leva pela aresta DELA; se ninguém casou, «Outros casos». Sem essa aresta o
          // lead fica — já foi para a PRIMEIRA regra, que é um caminho que a resposta não escolheu.
          const edge = hit
            ? selectEdgeExata(edges, node.id, { type: "branch", branch_id: hit.id })
            : selectEdgeExata(edges, node.id, { type: "always" });
          if (!edge) {
            return parar(
              hit ? `a saída «${nomeDoRamo(node, hit.id)}» não está ligada a nada` : "a resposta não casou com nenhuma regra e «Outros casos» não está ligada a nada",
            );
          }
          return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
        }
      }
      const edge = selectEdgeExata(edges, node.id, classEdgeMatch(node, NO_REPLY_BRANCH_ID));
      if (!edge) return parar("a saída «Sem resposta» não está ligada a nada");
      return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
    }

    case "menu": {
      if (!actionCompleted) {
        if (!actionEnqueued) {
          const body = `${node.config.prompt}\n\n${node.config.options
            .map((option, index) => `${index + 1}. ${option.label}`)
            .join("\n")}`;
          return { kind: "enqueue_turn", purpose: "send_message", wake_status: "waiting_reply", fixed_body: body };
        }
        if ((actionRecheckCount ?? 0) >= MAX_ACTION_RECHECKS) {
          return { kind: "dead", reason: "menu_send_never_completed" };
        }
        return {
          kind: "recheck",
          next_eval_at: new Date(clock().getTime() + atrasoDoRecheck(actionRecheckCount ?? 0)),
        };
      }

      if (wokeEarly && lastInboundBody?.trim()) {
        const reply = lastInboundBody.trim().toLocaleLowerCase();
        const number = /^[0-9]{1,2}[.)]?$/.test(reply) ? Number.parseInt(reply, 10) : 0;
        const selected =
          (number > 0 ? node.config.options[number - 1] : undefined) ??
          node.config.options.find((option) => option.label.trim().toLocaleLowerCase() === reply);
        const edge = selected
          ? selectEdgeExata(edges, node.id, { type: "branch", branch_id: selected.id })
          : selectEdgeExata(edges, node.id, { type: "always" });
        if (!edge) {
          return parar(
            selected ? `a saída da opção «${selected.label}» não está ligada a nada` : "a resposta não é nenhuma das opções e «Outros casos» não está ligada a nada",
          );
        }
        return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
      }

      if (!waitElapsed) {
        return {
          kind: "wait",
          next_eval_at: new Date(clock().getTime() + node.config.grace_timeout_ms),
          wake_status: "waiting_reply",
        };
      }
      const edge = selectEdgeExata(edges, node.id, { type: "branch", branch_id: NO_REPLY_BRANCH_ID });
      if (!edge) return parar("a saída «Sem resposta» não está ligada a nada");
      return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
    }

    case "attendant_route": {
      const branchId = attendantAssigned ? "assigned" : "timeout";
      const edge = attendantAssigned ? selectEdgeExata(edges, node.id, { type: "branch", branch_id: branchId }) : null;
      if (attendantAssigned && !edge) {
        return parar("a saída «Atendido por uma pessoa» não está ligada a nada");
      }
      if (edge) return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };

      const deadline = attendantDeadlineAt ?? new Date(clock().getTime() + node.config.max_wait_minutes * 60_000);
      if (clock().getTime() >= deadline.getTime()) {
        const timeoutEdge = selectEdgeExata(edges, node.id, { type: "branch", branch_id: branchId });
        if (!timeoutEdge) return parar("a saída «Sem atendente no prazo» não está ligada a nada");
        return { kind: "advance", next_node_id: timeoutEdge.target, next_eval_at: clock() };
      }
      return {
        kind: "wait",
        next_eval_at: new Date(Math.min(clock().getTime() + ATTENDANT_ROUTE_POLL_MS, deadline.getTime())),
        wake_status: "active",
        deadline_at: deadline,
      };
    }

    case "repeat": {
      const taken = repeatTaken ?? 0;
      let total = repeatTotal ?? null;
      if (total === null) {
        const parsed = parseReplyCount(lastInboundBody, node.config.max_count);
        if (parsed === null) {
          const edge = selectEdgeExata(edges, node.id, { type: "always" });
          if (!edge) return parar("a resposta não trouxe um número e a saída de escape do passo não está ligada a nada");
          return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
        }
        total = parsed;
      }
      if (taken >= total) {
        const edge = selectEdgeExata(edges, node.id, { type: "branch", branch_id: REPEAT_DONE_BRANCH_ID });
        if (!edge) return parar("as voltas terminaram e a saída «Depois das voltas» não está ligada a nada");
        return { kind: "advance", next_node_id: edge.target, next_eval_at: clock(), repeat: { index: taken, total } };
      }
      const edge = selectEdgeExata(edges, node.id, { type: "branch", branch_id: REPEAT_BODY_BRANCH_ID });
      if (!edge) return parar("a saída que repete não está ligada a nada");
      return {
        kind: "advance",
        next_node_id: edge.target,
        next_eval_at: clock(),
        repeat: { index: taken + 1, total },
      };
    }

    case "collect": {
      // PERGUNTA no relógio do fluxo: manda a pergunta, espera a resposta até o prazo e sai por
      // «Respondeu» (a resposta é gravada no campo pelo engine) ou «Sem resposta» (prazo vencido).
      // O roteiro de ATENDIMENTO (surface=atendimento) segue sendo conduzido pelo turno, não por aqui.
      //
      // Saída NÃO ligada = o lead fica parado aqui (`park`). Nunca cai no escape de `selectEdge`:
      // «Sem resposta» solta não pode virar «Respondeu» — seria o fluxo afirmando uma resposta que não houve.
      const prazo = prazoDaPerguntaMs(node.config);
      const esperaMs = prazo ?? PERGUNTA_SEM_PRAZO_MS;
      if (!actionCompleted) {
        if (!actionEnqueued) {
          return {
            kind: "enqueue_turn",
            purpose: "send_message",
            wake_status: "waiting_reply",
            fixed_body: textoDaPergunta(node.config),
          };
        }
        if ((actionRecheckCount ?? 0) >= MAX_ACTION_RECHECKS) {
          return { kind: "dead", reason: "collect_send_never_completed" };
        }
        return {
          kind: "recheck",
          next_eval_at: new Date(clock().getTime() + atrasoDoRecheck(actionRecheckCount ?? 0)),
        };
      }

      if (wokeEarly && lastInboundBody?.trim()) {
        const edge = selectEdge(edges, node.id, { type: "always" });
        if (!edge) return { kind: "park", reason: "a saída «Respondeu» não está ligada a nada" };
        return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
      }

      if (!waitElapsed) {
        return { kind: "wait", next_eval_at: new Date(clock().getTime() + esperaMs), wake_status: "waiting_reply" };
      }
      if (prazo === null) {
        return { kind: "park", reason: "a pergunta esperou 30 dias sem resposta e não tem prazo nem saída configurados", aguardando_resposta: true };
      }
      const edge = arestaDoRamo(edges, node.id, NO_REPLY_BRANCH_ID);
      if (!edge) {
        // Fica no nó, mas ainda ouvindo: quem responder tarde segue por «Respondeu», se ela estiver ligada.
        return { kind: "park", reason: "o prazo venceu e a saída «Sem resposta» não está ligada a nada", aguardando_resposta: true };
      }
      return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
    }

    case "skill": {
      // Puxa uma skill instalada em paralelo ao passo; a ativação é do executor
      // in-turn (união com o `matchSkills`). No relógio, é passagem.
      const edge = selectEdge(edges, node.id, { type: "always" });
      if (!edge) return parar("a saída do passo não está ligada a nada", { concluiu: true });
      return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
    }

    case "action": {
      // At-most-once send: enqueue the turn EXACTLY ONCE per occupancy. First entry
      // (no prior occupancy event) enqueues; a recheck fired while the turn is still in
      // flight — completeTurnForEnrollment (turn-bridge) hasn't advanced the enrollment
      // yet — must NOT re-enqueue. Mirrors the wait/ai_classify guard (resolveWaitPhase),
      // which the action node lacked (steps_taken increments every recheck, so the
      // `${node}:${steps}` idempotency_key was a FRESH key each tick → a 2nd job → a 2nd
      // real send that the send sink's (job_id,seq) dedup can't catch).
      if (!actionEnqueued && !actionCompleted) {
        if (
          proximo?.type === "match_reply" &&
          proximo.config.save_to &&
          destinoJaPreenchido(lead, proximo.config.save_to)
        ) {
          const modo = modoSeJaExiste(proximo);
          if (modo === "skip" || modo === "confirm") {
            const edge = selectEdge(edges, node.id, { type: "always" });
            if (!edge) return parar("a mensagem foi tratada e a saída do passo não está ligada a nada", { concluiu: true });
            return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
          }
        }
        return { kind: "enqueue_turn", purpose: "send_message", wake_status: "active" };
      }
      // Envio já fechou (action_sent) mas o enrollment ainda está no action —
      // típico de corrida: completeTurn avançou e um recheck concorrente reverteu.
      if (actionCompleted) {
        const edge = selectEdge(edges, node.id, { type: "always" });
        if (!edge) return parar("a mensagem foi tratada e a saída do passo não está ligada a nada", { concluiu: true });
        return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
      }
      // Dead-man: the turn never completed. Rechecks count THIS occupancy only
      // (`occupancyEventCount`) so a `repeat` that volta no mesmo nó de ação não
      // herda o orçamento das voltas anteriores.
      if ((actionRecheckCount ?? 0) >= MAX_ACTION_RECHECKS) {
        return { kind: "dead", reason: "action_turn_never_completed" };
      }
      return {
        kind: "recheck",
        next_eval_at: new Date(clock().getTime() + atrasoDoRecheck(actionRecheckCount ?? 0)),
      };
    }

    case "ai_generic": {
      // Mesmo contrato de ocupação/recheck/dead-man do `action` (ver o case
      // acima): enfileira o turno de IA UMA vez por estadia, recheca até o
      // turno fechar (`ai_generic_done`, ver turn-bridge.ts), desiste depois
      // de MAX_ACTION_RECHECKS. O motor NUNCA chama o modelo diretamente
      // aqui — `processNode` é puro; quem chama é o turno do agent-engine,
      // pelo MESMO seam de custo/auditoria que `ai_classify` usa
      // (`followup_generic_ai` em lib/ai/pontos/registro.ts, `llm_calls`).
      if (!actionEnqueued && !actionCompleted) {
        return { kind: "enqueue_turn", purpose: "generic_ai", wake_status: "active" };
      }
      if (actionCompleted) {
        const edge = selectEdge(edges, node.id, { type: "always" });
        if (!edge) return parar("a IA respondeu e a saída do passo não está ligada a nada", { concluiu: true });
        return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
      }
      if ((actionRecheckCount ?? 0) >= MAX_ACTION_RECHECKS) {
        return { kind: "dead", reason: "ai_generic_turn_never_completed" };
      }
      return {
        kind: "recheck",
        next_eval_at: new Date(clock().getTime() + atrasoDoRecheck(actionRecheckCount ?? 0)),
      };
    }

    case "api_call": {
      // Chamada de I/O de verdade (fetch) mora no engine — este nó só decide
      // o roteamento (passagem única, como `action`/`skill`/`collect`). O
      // engine dispara a chamada olhando `chamadaDeApiDoFluxo(node, result)`
      // sobre ESTE resultado, best-effort: falhar a chamada não trava o fluxo.
      const edge = selectEdge(edges, node.id, { type: "always" });
      if (!edge) return parar("a chamada foi feita e a saída do passo não está ligada a nada", { concluiu: true });
      return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
    }

    case "notify_agent": {
      // Passagem única; o engine grava o aviso na Central olhando
      // `avisoDeNotificarAtendente(enrollment, node, result)` sobre ESTE
      // resultado.
      const edge = selectEdge(edges, node.id, { type: "always" });
      if (!edge) return parar("o aviso foi enviado e a saída do passo não está ligada a nada", { concluiu: true });
      return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
    }

    case "add_note": {
      // Passagem única; o engine grava a nota olhando `notaDeFluxo(enrollment, node, result)`.
      const edge = selectEdge(edges, node.id, { type: "always" });
      if (!edge) return parar("a anotação foi feita e a saída do passo não está ligada a nada", { concluiu: true });
      return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
    }

    case "agent": {
      // Duas visitas ao MESMO nó, distinguidas pelo STATUS da inscrição (o motor não precisa ler eventos):
      //   • `com_agente` e o relógio venceu → a pessoa ficou em SILÊNCIO pelo prazo do nó: sai pela saída "silêncio".
      //     (Quem acorda uma inscrição `com_agente` é só o relógio: resposta da pessoa NÃO a acorda — o agente é
      //     quem responde, no turno, e as saídas "cumpriu" e "limite" são do turno: `agente-no-fluxo.ts`.)
      //   • qualquer outro status → CHEGADA ao nó: a inscrição estaciona em `com_agente`, com o prazo de silêncio como
      //     relógio. O agente NÃO abre a conversa; assume quando a pessoa responde.
      if (enrollment.status === "com_agente") {
        const edge = selectEdgeExata(edges, node.id, { type: "branch", branch_id: AGENT_SILENCE_BRANCH_ID });
        if (!edge) return parar("o tempo de silêncio passou e a saída «Silêncio» não está ligada a nada");
        return { kind: "advance", next_node_id: edge.target, next_eval_at: clock() };
      }
      return {
        kind: "wait",
        next_eval_at: new Date(clock().getTime() + node.config.silencio_minutos * 60_000),
        wake_status: "com_agente",
      };
    }

    case "end": {
      if (node.config.outcome === "custom") {
        return { kind: "complete", outcome: null, cancel_reason: node.config.note };
      }
      return { kind: "complete", outcome: node.config.outcome };
    }
  }
}
