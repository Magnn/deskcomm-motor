import {
  processNode,
  selectEdge,
  classEdgeMatch,
  type EnrollmentRow,
  type LeadFacts,
  type NodeResult,
} from "./node-handlers";
import {
  AGENT_SILENCE_BRANCH_ID,
  type AGENT_CONCLUDED_BRANCH_ID,
  type AGENT_LIMIT_BRANCH_ID,
  type ConteudoItem,
  type EndFinish,
  type FlowGraph,
  type FlowNode,
} from "./graph-schema";

/**
 * Simulador do construtor de fluxo (`/app/ai/followups/[id]`) — Living System
 * checklist e decisões de design no HANDOFF da task; resumo aqui:
 *
 * REAPROVEITA o executor real e puro do motor (`processNode`/`selectEdge`/
 * `classEdgeMatch` de `node-handlers.ts`) em vez de interpretar o grafo de
 * novo. `processNode` já é "PURE, no DB access" (comentário do próprio
 * arquivo) — o único ajuste é que este driver resolve SÍNCRONAMENTE, num só
 * turno de conversa simulada, o que em produção o motor resolve em VÁRIOS
 * ticks assíncronos (claim → job → callback da ponte) — porque aqui não há
 * relógio real nem fila.
 *
 * O QUE NUNCA TEM EFEITO COLATERAL REAL (decisão de produto — CLAUDE.md
 * "QA Visual" + o pedido da task):
 *   - Nada é persistido. `SimState` vive só na memória do processo que chama
 *     este módulo (o componente React, entre um clique e outro). Não cria
 *     `followup_enrollments`, não grava `followup_enrollment_events`, não
 *     toca `contacts`/`crm_leads`.
 *   - Nó `action` e a pergunta de confirmação do `match_reply` (modo
 *     `if_exists: 'confirm'`) NUNCA enviam WhatsApp de verdade — o simulador
 *     não tem capacidade de envio nenhuma. O texto mostrado é uma PRÉVIA:
 *     `mode: 'text'`/`'ai_message'` mostram o corpo/a orientação tal como
 *     configurados (sem chamar IA nenhuma pra gerar a mensagem — ver
 *     `textoDaAcao`); `mode: 'template'` mostra só o id do modelo salvo (o
 *     conteúdo do modelo não é buscado — limitação documentada).
 *   - Nó `skill` do vocabulário de atendimento não existe nesta superfície
 *     (`followup`/`crm_automation` só aceitam os 8 tipos que este driver
 *     cobre — `NOS_DA_SUPERFICIE.followup` em `validate-publish.ts`); se um
 *     grafo antigo/corrompido tiver um de qualquer forma, `processNode` já o
 *     trata como passagem (sai pela aresta `always`), e este driver herda
 *     esse comportamento sem código extra.
 *
 * O QUE RODA DE VERDADE: `ai_classify`. Classificar uma mensagem não tem
 * efeito colateral (é só uma chamada de modelo, a mesma usada em produção —
 * `lib/agent-engine/agent/followup-flow-classify.ts`), e é o único jeito de
 * provar que o roteamento por classe está certo. Por isso o driver não decide
 * a classe sozinho: recebe um `Classificador` injetado pelo chamador (a rota
 * `POST /api/v1/ai/followup-flows/[id]/simulate-classify`, que roda o mesmo
 * `classifyFollowupReply` da produção) — o mesmo padrão de injeção de
 * dependência de `engine.ts` (`AdminClient`)/`turn-bridge.ts`
 * (`TurnBridgeAdminClient`), só que aqui a "porta estreita" é uma função, não
 * uma interface de banco.
 *
 * O NÓ "AGENTE DE IA" É UMA CAIXA-PRETA AQUI. Quem conduz a conversa é um agente de verdade (prompt, ferramentas,
 * memória, várias mensagens), e simulá-lo exigiria rodá-lo — com custo, e com efeito na conversa de quem está
 * sendo atendido se algo escapasse. O simulador testa o ROTEAMENTO do grafo, que é o que ele sabe testar: ao
 * chegar no nó, PARA e pede ao operador por qual das três saídas fixas seguir (cumpriu o objetivo, passou do
 * limite de turnos, ficou em silêncio). "Sem resposta" vale como silêncio, o mesmo sinal de prazo esgotado que
 * ele já dá nos outros nós. Uma mensagem digitada não avança: o agente ainda estaria conduzindo.
 *
 * Esperas adaptativas (`smartWaits`) NUNCA são planejadas por IA aqui — o
 * driver sempre passa `smartWaits: []` a `processNode`, o que faz um `wait`
 * em modo `smart` cair no próprio `max_ms` (a mesma degradação que o motor
 * real usa quando o planejador nunca responde — `MAX_PLAN_RECHECKS`). Decisão
 * de escopo: simular o planejamento exigiria uma SEGUNDA chamada de IA por
 * `trigger`, e o valor de teste está no ROTEAMENTO do grafo, não na duração
 * escolhida por um modelo.
 */

export type Classificador = (input: {
  candidateText: string;
  classes: string[];
  hint?: string;
}) => Promise<string>;

export interface SimLeadFacts {
  lead_stage: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  /** Classe do último `ai_classify` resolvido nesta simulação — espelha `ultimoDesfechoDe` (node-handlers.ts). */
  last_outcome: string | null;
}

/** As três saídas do nó Agente de IA (`nodeBranches`), como o operador as escolhe no simulador. */
export type SaidaDoAgente =
  | typeof AGENT_CONCLUDED_BRANCH_ID
  | typeof AGENT_LIMIT_BRANCH_ID
  | typeof AGENT_SILENCE_BRANCH_ID;

export type SimEntrada =
  | { kind: "mensagem"; texto: string }
  | { kind: "sem_resposta" }
  | { kind: "resultado_atribuicao"; atribuido: boolean }
  | { kind: "saida_do_agente"; saida: SaidaDoAgente };

/** O que o simulador está esperando do operador para continuar. */
export type SimAguardando = "wait" | "ai_classify" | "match_reply" | "menu" | "attendant_route" | "agent" | null;

export type SimStatus = "aguardando_entrada" | "concluido" | "erro";

export type SimTranscriptEntry =
  | { kind: "lead"; texto: string }
  /** O operador marcou "sem resposta" — não digitou nada, simulou o prazo esgotando. */
  | { kind: "lead_sem_resposta" }
  /**
   * Texto que SERIA enviado por um nó `action` (qualquer modo) ou pela
   * pergunta de confirmação de um `match_reply`. Nunca é enviado de verdade —
   * ver cabeçalho do arquivo. `origem` diz de onde o texto veio, pra tela
   * legendar cada caso diferente (a IA não rodou para `'ia'`).
   */
  | {
      kind: "mensagem_simulada";
      nodeId: string;
      texto: string;
      origem: "texto_fixo" | "ia" | "modelo_salvo" | "confirmacao" | "conteudo" | "menu";
    }
  | { kind: "transicao"; nodeId: string; label: string; repeat?: { index: number; total: number } }
  | {
      kind: "aguardando";
      nodeId: string;
      motivo: "wait" | "ai_classify" | "match_reply" | "menu" | "attendant_route" | "agent";
    }
  | { kind: "resultado_atribuicao"; nodeId: string; atribuido: boolean }
  /** O operador escolheu por onde o agente sai (o agente em si não roda no simulador). */
  | { kind: "saida_do_agente"; nodeId: string; saida: SaidaDoAgente }
  | { kind: "classificado"; nodeId: string; classe: string }
  | { kind: "fim"; nodeId: string; outcome: string | null; nota?: string }
  | { kind: "finalizacao"; nodeId: string; tipo: EndFinish["tipo"]; detalhe?: string }
  | { kind: "erro"; nodeId?: string; mensagem: string };

export interface SimState {
  status: SimStatus;
  aguardando: SimAguardando;
  currentNodeId: string;
  stepsTaken: number;
  lead: SimLeadFacts;
  repeatProgress: Record<string, { taken: number; total: number | null }>;
  ultimaVolta: { index: number; total: number } | null;
  transcript: SimTranscriptEntry[];
  outcome: { outcome: string | null; nota?: string } | null;
}

/** Mesmo teto de `lib/followup/engine.ts` (`MAX_STEPS`) — não exportado de lá
 *  (é `const` de módulo), duplicado aqui de propósito: é UM inteiro, não
 *  lógica, e as duas travas protegem a mesma coisa (ciclo no grafo). */
const LIMITE_PASSOS = 80;

export function iniciarSimulacao(
  graph: FlowGraph,
): { ok: true; state: SimState } | { ok: false; erro: string } {
  const gatilhos = graph.nodes.filter((n) => n.type === "trigger");
  if (gatilhos.length !== 1) {
    return {
      ok: false,
      erro: "O fluxo precisa de exatamente um nó de início (Gatilho) para ser simulado.",
    };
  }
  return {
    ok: true,
    state: {
      status: "aguardando_entrada",
      aguardando: null,
      currentNodeId: gatilhos[0]!.id,
      stepsTaken: 0,
      lead: { lead_stage: null, tags: [], custom_fields: {}, last_outcome: null },
      repeatProgress: {},
      ultimaVolta: null,
      transcript: [],
      outcome: null,
    },
  };
}

function enrollmentFicticio(state: SimState): EnrollmentRow {
  const epoch = new Date(0).toISOString();
  return {
    id: "simulacao",
    organization_id: "simulacao",
    pointer_id: "simulacao",
    version_id: "simulacao",
    contact_id: "simulacao",
    conversation_id: null,
    current_node_id: state.currentNodeId,
    status: "active",
    next_eval_at: null,
    claimed_until: null,
    attempts: 0,
    max_attempts: 5,
    last_error: null,
    steps_taken: state.stepsTaken,
    outcome: null,
    cancel_reason: null,
    started_at: epoch,
    completed_at: null,
    updated_at: epoch,
    timing_plan: null,
  };
}

function interpolarVolta(texto: string, volta: { index: number; total: number } | null): string {
  if (!volta) return texto;
  return texto.replaceAll("{{volta}}", String(volta.index)).replaceAll("{{voltas}}", String(volta.total));
}

/** Uma linha por item, pra prévia do simulador — mídia/contato não são pré-visualizados (limitação documentada). */
function resumoDeItemDeConteudo(item: ConteudoItem): string {
  switch (item.type) {
    case "text":
      return item.body;
    case "image":
      return `[imagem]${item.caption ? ` ${item.caption}` : ""}`;
    case "video":
      return `[vídeo]${item.caption ? ` ${item.caption}` : ""}`;
    case "audio":
      return "[áudio]";
    case "document":
      return `[documento]${item.filename ? ` ${item.filename}` : ""}`;
    case "contact":
      return `[contato] ${item.name}`;
    case "sticker":
      return `[sticker]${item.name ? ` ${item.name}` : ""}`;
    case "delay":
      return `[pausa ${item.seconds}s]`;
  }
}

function textoDaAcao(
  node: Extract<FlowNode, { type: "action" }>,
  volta: { index: number; total: number } | null,
): { texto: string; origem: "texto_fixo" | "ia" | "modelo_salvo" | "conteudo" } {
  const cfg = node.config;
  if (cfg.mode === "text") return { texto: interpolarVolta(cfg.body, volta), origem: "texto_fixo" };
  if (cfg.mode === "ai_message") return { texto: interpolarVolta(cfg.prompt_hint, volta), origem: "ia" };
  if (cfg.mode === "content") return { texto: cfg.items.map(resumoDeItemDeConteudo).join(" · "), origem: "conteudo" };
  return { texto: cfg.template_id, origem: "modelo_salvo" };
}

function mensagemSimuladaDePassagem(
  node: FlowNode,
  volta: { index: number; total: number } | null
): { texto: string; origem: "texto_fixo" | "ia" | "modelo_salvo" | "confirmacao" | "conteudo" | "menu" } | null {
  if (node.type === "whatsapp_template") {
    const nome = node.config.template_name || "(sem modelo selecionado)";
    return { texto: `[Template WhatsApp] ${nome}`, origem: "modelo_salvo" };
  }
  if (node.type === "pix_payment") {
    const valor = node.config.amount ? `R$ ${node.config.amount}` : "R$ 0,00";
    const chave = node.config.pix_key || "(chave pendente)";
    const texto = node.config.message_text
      ? interpolarVolta(node.config.message_text, volta)
      : `[PIX ${node.config.key_type}] Chave: ${chave} · Valor: ${valor}${node.config.beneficiary ? ` · Favorecido: ${node.config.beneficiary}` : ""}`;
    return { texto, origem: "texto_fixo" };
  }
  if (node.type === "payment_gateway") {
    const valor = node.config.open_amount
      ? "(Valor aberto)"
      : `${node.config.currency || "BRL"} ${node.config.amount || "0,00"}`;
    return {
      texto: `[Cobrança Gateway] ${valor} · Cliente: ${node.config.customer_name || "{full_name}"}`,
      origem: "texto_fixo",
    };
  }
  if (node.type === "meta_pixel") {
    const valor = node.config.item_value
      ? ` (${node.config.currency || "BRL"} ${node.config.item_value})`
      : "";
    return {
      texto: `[Meta Pixel] Evento "${node.config.event_type}"${valor}`,
      origem: "conteudo",
    };
  }
  if (node.type === "voice_studio") {
    const voz = node.config.voice_name || "Julieta";
    const formato = node.config.send_as_voice_note ? "Áudio gravado (PTT)" : "Arquivo de áudio";
    const texto = node.config.text ? interpolarVolta(node.config.text, volta) : "(sem texto)";
    return {
      texto: `[Voice Studio · ${voz} (${formato})] "${texto}"`,
      origem: "texto_fixo",
    };
  }
  if (node.type === "api_call") {
    return {
      texto: `[Requisição API] ${node.config.method} ${node.config.url || "(sem URL)"}`,
      origem: "conteudo",
    };
  }
  if (node.type === "notify_agent") {
    return {
      texto: `[Notificação Interna] ${node.config.message || "(sem mensagem)"}`,
      origem: "texto_fixo",
    };
  }
  if (node.type === "add_note") {
    return {
      texto: `[Nota Interna CRM] ${node.config.body || "(sem nota)"}`,
      origem: "texto_fixo",
    };
  }
  return null;
}

function falha(state: SimState, mensagem: string, nodeId?: string): SimState {
  return {
    ...state,
    status: "erro",
    aguardando: null,
    transcript: [...state.transcript, { kind: "erro", mensagem, ...(nodeId ? { nodeId } : {}) }],
  };
}

function avancarPara(
  state: SimState,
  targetId: string,
  porId: Map<string, FlowNode>,
  repeat: { index: number; total: number } | null,
): SimState {
  const alvo = porId.get(targetId);
  const entry: SimTranscriptEntry = {
    kind: "transicao",
    nodeId: targetId,
    label: alvo?.label ?? targetId,
    ...(repeat ? { repeat } : {}),
  };
  return {
    ...state,
    transcript: [...state.transcript, entry],
    currentNodeId: targetId,
    stepsTaken: state.stepsTaken + 1,
  };
}

/**
 * Avança a simulação até ela precisar de novo insumo do operador (uma
 * mensagem do lead, ou o sinal de "sem resposta") ou concluir/errar.
 *
 * `entrada` é consumida no MÁXIMO uma vez, no primeiro nó capaz de lê-la —
 * exatamente como o motor real: uma resposta do contato só é "vista" pelo nó
 * em que o enrollment estava parado quando ela chegou. Chamada inicial (sem
 * `entrada`) corre o trecho síncrono a partir do Gatilho (ex.: mensagem de
 * abertura antes do primeiro `wait`).
 */
export async function avancarSimulacao(args: {
  graph: FlowGraph;
  state: SimState;
  entrada?: SimEntrada;
  classificar: Classificador;
  clock?: () => Date;
}): Promise<SimState> {
  const { graph, entrada, classificar } = args;
  const clock = args.clock ?? ((): Date => new Date());
  const edges = graph.edges;
  const porId = new Map(graph.nodes.map((n) => [n.id, n]));

  let state: SimState = {
    ...args.state,
    lead: { ...args.state.lead },
    repeatProgress: { ...args.state.repeatProgress },
    transcript: [...args.state.transcript],
  };

  if (state.status !== "aguardando_entrada") return state;

  if (entrada?.kind === "mensagem") {
    state = { ...state, transcript: [...state.transcript, { kind: "lead", texto: entrada.texto }] };
  } else if (entrada?.kind === "sem_resposta") {
    state = { ...state, transcript: [...state.transcript, { kind: "lead_sem_resposta" }] };
  } else if (entrada?.kind === "saida_do_agente") {
    state = {
      ...state,
      transcript: [...state.transcript, { kind: "saida_do_agente", nodeId: state.currentNodeId, saida: entrada.saida }],
    };
  } else if (entrada?.kind === "resultado_atribuicao") {
    state = {
      ...state,
      transcript: [...state.transcript, { kind: "resultado_atribuicao", nodeId: state.currentNodeId, atribuido: entrada.atribuido }],
    };
  }

  const mensagemAtual = entrada?.kind === "mensagem" ? entrada.texto : null;
  let primeiroPasso = true;

  for (let i = 0; i < LIMITE_PASSOS; i++) {
    const node = porId.get(state.currentNodeId);
    if (!node) return falha(state, `O nó "${state.currentNodeId}" não existe mais no grafo.`);

    // Agente de IA: caixa-preta (ver o cabeçalho). Só a saída escolhida pelo operador — ou "sem resposta", que é o
    // silêncio — avança; qualquer outra coisa deixa a simulação parada no nó, esperando.
    if (node.type === "agent") {
      const saida: SaidaDoAgente | null =
        primeiroPasso && entrada?.kind === "saida_do_agente"
          ? entrada.saida
          : primeiroPasso && entrada?.kind === "sem_resposta"
            ? AGENT_SILENCE_BRANCH_ID
            : null;
      primeiroPasso = false;
      if (saida === null) {
        const jaAguardava = state.aguardando === "agent" && state.currentNodeId === node.id;
        return {
          ...state,
          aguardando: "agent",
          status: "aguardando_entrada",
          transcript: jaAguardava
            ? state.transcript
            : [...state.transcript, { kind: "aguardando", nodeId: node.id, motivo: "agent" }],
        };
      }
      const edge = selectEdge(edges, node.id, { type: "branch", branch_id: saida });
      if (!edge) {
        return falha(state, `O nó "${node.label}" não tem aresta para a saída "${saida}" (nem saída padrão).`, node.id);
      }
      state = avancarPara({ ...state, aguardando: null }, edge.target, porId, null);
      continue;
    }

    const imune =
      node.type === "wait" && node.config.mode === "fixed" && node.config.immune_to_reply === true;
    const wokeEarly = primeiroPasso && entrada?.kind === "mensagem" && !imune;
    const waitElapsed = primeiroPasso && entrada?.kind === "sem_resposta";

    // ai_classify: a classificação de verdade acontece FORA do processNode —
    // mesmo desenho da produção (lib/followup/turn-bridge.ts): node-handlers só
    // decide QUE é preciso classificar; quem classifica e roteia pela classe é
    // a ponte (aqui, este driver).
    if (node.type === "ai_classify" && primeiroPasso && entrada?.kind === "mensagem") {
      primeiroPasso = false;
      let classe: string;
      try {
        classe = await classificar({
          candidateText: entrada.texto,
          classes: node.config.classes,
          ...(node.config.hint !== undefined ? { hint: node.config.hint } : {}),
        });
      } catch (err) {
        return falha(state, err instanceof Error ? err.message : String(err), node.id);
      }
      state = {
        ...state,
        lead: { ...state.lead, last_outcome: classe },
        transcript: [...state.transcript, { kind: "classificado", nodeId: node.id, classe }],
      };
      const edge = selectEdge(edges, node.id, classEdgeMatch(node, classe));
      if (!edge) {
        return falha(
          state,
          `O nó "${node.label}" não tem aresta para a classe "${classe}" (nem saída padrão).`,
          node.id,
        );
      }
      state = avancarPara(state, edge.target, porId, null);
      continue;
    }

    const alwaysEdge = selectEdge(edges, node.id, { type: "always" });
    const proximo = alwaysEdge ? (porId.get(alwaysEdge.target) ?? null) : null;

    const lead: LeadFacts = {
      lead_stage: state.lead.lead_stage,
      tags: state.lead.tags,
      steps_taken: state.stepsTaken,
      last_outcome: state.lead.last_outcome,
      custom_fields: state.lead.custom_fields,
    };

    const result: NodeResult = processNode({
      node,
      edges,
      enrollment: enrollmentFicticio(state),
      lead,
      clock,
      waitElapsed,
      wokeEarly,
      lastInboundBody: mensagemAtual ?? undefined,
      smartWaits: [],
      repeatTaken: state.repeatProgress[node.id]?.taken,
      repeatTotal: state.repeatProgress[node.id]?.total ?? null,
      proximo,
      actionEnqueued: node.type === "menu" && state.aguardando === "menu",
      actionCompleted: node.type === "menu" && state.aguardando === "menu",
      attendantAssigned:
        node.type === "attendant_route" && entrada?.kind === "resultado_atribuicao" && entrada.atribuido,
      attendantDeadlineAt:
        node.type === "attendant_route" && entrada?.kind === "resultado_atribuicao" && !entrada.atribuido
          ? clock()
          : undefined,
    });

    primeiroPasso = false;

    switch (result.kind) {
      case "advance": {
        const previa = mensagemSimuladaDePassagem(node, state.ultimaVolta);
        if (previa) {
          state = {
            ...state,
            transcript: [
              ...state.transcript,
              { kind: "mensagem_simulada", nodeId: node.id, texto: previa.texto, origem: previa.origem },
            ],
          };
        }
        if (result.repeat) {
          state = {
            ...state,
            repeatProgress: { ...state.repeatProgress, [node.id]: { taken: result.repeat.index, total: result.repeat.total } },
            ultimaVolta: result.repeat,
          };
        }
        state = avancarPara(state, result.next_node_id, porId, result.repeat ?? null);
        continue;
      }

      case "wait": {
        const motivo =
          node.type === "wait"
            ? "wait"
            : node.type === "match_reply"
              ? "match_reply"
              : node.type === "menu"
                ? "menu"
                : "attendant_route";
        state = {
          ...state,
          aguardando: motivo,
          status: "aguardando_entrada",
          transcript: [...state.transcript, { kind: "aguardando", nodeId: node.id, motivo }],
        };
        return state;
      }

      case "enqueue_turn": {
        if (result.purpose === "classify") {
          state = {
            ...state,
            aguardando: "ai_classify",
            status: "aguardando_entrada",
            transcript: [...state.transcript, { kind: "aguardando", nodeId: node.id, motivo: "ai_classify" }],
          };
          return state;
        }
        if (result.purpose === "send_message") {
          if (result.wake_status === "waiting_reply") {
            if (node.type === "menu") {
              state = {
                ...state,
                aguardando: "menu",
                status: "aguardando_entrada",
                transcript: [
                  ...state.transcript,
                  { kind: "mensagem_simulada", nodeId: node.id, texto: result.fixed_body ?? "", origem: "menu" },
                  { kind: "aguardando", nodeId: node.id, motivo: "menu" },
                ],
              };
              return state;
            }
            // match_reply em modo `if_exists: 'confirm'`: pergunta de
            // confirmação, e o fluxo PERMANECE no mesmo nó aguardando o
            // sim/não — nunca avança sozinho (espelha
            // completeTurnForEnrollment, turn-bridge.ts, caso 'sent' do
            // match_reply: "não avança — a resposta do lead é que avança").
            state = {
              ...state,
              aguardando: "match_reply",
              status: "aguardando_entrada",
              transcript: [
                ...state.transcript,
                { kind: "mensagem_simulada", nodeId: node.id, texto: result.fixed_body ?? "", origem: "confirmacao" },
              ],
            };
            return state;
          }
          if (node.type !== "action") {
            return falha(state, `Estado inesperado do simulador: enqueue_turn/send_message num nó "${node.type}".`, node.id);
          }
          const { texto, origem } = textoDaAcao(node, state.ultimaVolta);
          state = {
            ...state,
            transcript: [...state.transcript, { kind: "mensagem_simulada", nodeId: node.id, texto, origem }],
          };
          const edge = selectEdge(edges, node.id, { type: "always" });
          if (!edge) return falha(state, `O nó "${node.label}" não tem aresta de saída.`, node.id);
          state = avancarPara(state, edge.target, porId, null);
          continue;
        }
        // purpose 'plan_timing': inalcançável — smartWaits sempre [] (ver cabeçalho do arquivo).
        return falha(state, "Estado inesperado do simulador: planejamento de tempo não é simulado.", node.id);
      }

      // Rechecagem/dead-man são do relógio assíncrono real (vários ticks); este
      // driver resolve `action` numa passada só e nunca deveria pedir uma
      // segunda rodada no mesmo nó — chegar aqui é bug do driver, não do fluxo
      // do operador.
      case "recheck":
      case "dead":
        return falha(state, `Estado inesperado do simulador no nó "${node.label}" (${result.kind}).`, node.id);

      case "complete": {
        const outcome = { outcome: result.outcome, ...(result.cancel_reason ? { nota: result.cancel_reason } : {}) };
        state = {
          ...state,
          status: "concluido",
          aguardando: null,
          outcome,
          transcript: [
            ...state.transcript,
            { kind: "fim", nodeId: node.id, outcome: result.outcome, ...(result.cancel_reason ? { nota: result.cancel_reason } : {}) },
          ],
        };
        const finaliza = node.type === "end" ? node.config.ao_finalizar : undefined;
        if (finaliza && finaliza.tipo !== "nada") {
          state = {
            ...state,
            transcript: [
              ...state.transcript,
              {
                kind: "finalizacao",
                nodeId: node.id,
                tipo: finaliza.tipo,
                detalhe:
                  finaliza.tipo === "skill" ? finaliza.skill_name
                  : finaliza.tipo === "proximo_fluxo" ? finaliza.fluxo
                  : finaliza.prompt,
              },
            ],
          };
        }
        return state;
      }

      case "fail":
        return falha(state, result.error, node.id);
    }
  }

  return falha(
    state,
    "O fluxo passou de 80 passos sem parar (mesmo teto do motor real) — provável ciclo no grafo.",
  );
}
