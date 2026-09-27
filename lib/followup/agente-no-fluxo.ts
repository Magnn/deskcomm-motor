/**
 * O AGENTE NO COMANDO DE UM FLUXO — o lado do TURNO do nó "Agente de IA" (fatia 3 de 4).
 *
 * Quem conduz a conversa aqui não é o relógio do follow-up, é o TURNO: enquanto a inscrição está `com_agente`,
 * cada mensagem da pessoa é respondida pelo agente do nó, e este módulo é o que o turno consulta para saber
 * (1) SE há um agente no comando, (2) qual é o objetivo e quantas respostas ainda restam, e (3) como SAIR do
 * nó — pela ferramenta `concluir_etapa` (objetivo cumprido), pelo limite de respostas, ou pelo relógio de
 * silêncio, que é do motor (`processNode`, `node-handlers.ts`), não daqui.
 *
 * O desenho copia o do roteiro de atendimento (`atendimento.ts`), que também é conduzido por turno, de
 * propósito: quem já entende um entende o outro, e os defeitos que o roteiro pagou (falha do módulo não
 * derruba o atendimento; um retry da fila não conta duas vezes; fluxo desativado para de guiar na hora)
 * já vêm resolvidos.
 *
 * ─── O agente NÃO abre a conversa ────────────────────────────────────────────────────────────────────
 * Ao chegar no nó a inscrição fica `com_agente` e ESPERA a pessoa: o agente assume quando ela responde. Para
 * abrir a conversa, o dono do fluxo põe uma caixa de Mensagem ANTES do agente — é a composição natural (o
 * fluxo fala, o agente conduz o que vem depois), e evita um segundo caminho de envio com as suas travas.
 * Se a pessoa não responde em `silencio_minutos`, o nó sai pela saída "silêncio".
 *
 * ─── O que é idempotente, e o que não é ───────────────────────────────────────────────────────────────
 *   • Contar um turno: a chave do evento leva o passo e a mensagem (ou o job) que o motivou. Um retry da fila
 *     bate na chave e não conta de novo; sem isso o limite estouraria mais cedo a cada falha de envio.
 *   • Sair do nó: UM comando SQL que só move a inscrição se ela ainda está `com_agente`, ainda neste nó e neste
 *     passo, e sem lease de tick — e grava o evento de saída na mesma instrução. Quem chegar em segundo
 *     (o relógio de silêncio disputando com a ferramenta) não move nada e não duplica nada.
 *
 * ─── O que o cliente digita é dado ────────────────────────────────────────────────────────────────────
 * O `objetivo` é texto do dono do fluxo. Entra no bloco pelo sanitizador compartilhado das abas
 * (`lib/prompt/texto-do-cliente.ts`): uma linha, sem aspas duplas, sem controles.
 */
import type pg from "pg";

import { umaLinha } from "@/lib/prompt/texto-do-cliente";

import {
  flowGraphSchema,
  type AGENT_CONCLUDED_BRANCH_ID,
  type AGENT_LIMIT_BRANCH_ID,
  type FlowGraph,
  type FlowNode,
} from "./graph-schema";
import { selectEdge } from "./node-handlers";

export type BancoDoAgenteNoFluxo = Pick<pg.Pool, "query">;

export type NoDoAgente = Extract<FlowNode, { type: "agent" }>;

/** As saídas que o TURNO produz. A terceira (silêncio) é do relógio do motor. */
export type SaidaDoTurno = typeof AGENT_CONCLUDED_BRANCH_ID | typeof AGENT_LIMIT_BRANCH_ID;

export const EVENTO_TURNO_DO_AGENTE = "agente_turno";
export const EVENTO_SAIDA_DO_AGENTE = "agente_saiu";

export interface EstadoDoAgenteNoFluxo {
  enrollment: {
    id: string;
    pointer_id: string;
    version_id: string;
    current_node_id: string;
    /** O "passo" da inscrição neste nó: muda a cada avanço, então separa uma visita ao nó da seguinte. */
    steps_taken: number;
    conversation_id: string | null;
  };
  node: NoDoAgente;
  graph: FlowGraph;
  /** Respostas que o agente JÁ deu nesta visita ao nó. */
  turnosDados: number;
  /** Quantas ele ainda pode dar, contando a do turno que está começando (mínimo 0). */
  respostasRestantes: number;
}

/** O mínimo que quem decide o limite precisa saber. */
export function respostasRestantes(maxTurnos: number, turnosDados: number): number {
  return Math.max(0, maxTurnos - turnosDados);
}

/**
 * O limite de respostas foi atingido — depois de CONTAR o turno que acabou de sair. `>=`, e não `===`: uma
 * contagem que passou do teto (evento gravado a mais por qualquer motivo) não pode deixar o agente falando
 * para sempre.
 */
export function limiteAtingido(maxTurnos: number, turnosDadosDepoisDoTurno: number): boolean {
  return turnosDadosDepoisDoTurno >= maxTurnos;
}

type LinhaDoEstado = {
  id: string;
  pointer_id: string;
  version_id: string;
  current_node_id: string;
  steps_taken: number;
  conversation_id: string | null;
  graph: unknown;
};

/**
 * O agente que está no comando da conversa deste contato, ou `null`.
 *
 * Só conta inscrição `com_agente` de um fluxo que segue ATIVO: fluxo desativado para de guiar na hora (a
 * inscrição fica parada e volta se o fluxo voltar a `active`) — o mesmo achado da auditoria do roteiro. Grafo
 * ilegível, nó que não é mais `agent` ou qualquer falha de leitura viram `null`: o cliente continua sendo
 * atendido pelo agente de sempre, só sem o comando do fluxo neste turno.
 */
export async function carregarAgenteDoFluxo(
  db: BancoDoAgenteNoFluxo,
  args: { organizationId: string; contactId: string },
): Promise<EstadoDoAgenteNoFluxo | null> {
  const { rows } = await db.query<LinhaDoEstado>(
    `select e.id, e.pointer_id, e.version_id, e.current_node_id, e.steps_taken, e.conversation_id, v.graph
       from followup_enrollments e
       join followup_flow_pointers p on p.id = e.pointer_id and p.organization_id = e.organization_id
       join followup_flow_versions v on v.id = e.version_id and v.organization_id = e.organization_id
      where e.organization_id = $1
        and e.contact_id = $2
        and e.status = 'com_agente'
        and p.status = 'active'
      order by e.started_at desc
      limit 1`,
    [args.organizationId, args.contactId],
  );
  const row = rows[0];
  if (!row) return null;

  const parsed = flowGraphSchema.safeParse(row.graph);
  if (!parsed.success) return null;
  const node = parsed.data.nodes.find((n) => n.id === row.current_node_id);
  if (node === undefined || node.type !== "agent") return null;

  const { rows: contagem } = await db.query<{ n: number }>(
    `select count(*)::int as n
       from followup_enrollment_events
      where organization_id = $1
        and enrollment_id = $2
        and event_type = $3
        and (payload->>'passo')::int = $4`,
    [args.organizationId, row.id, EVENTO_TURNO_DO_AGENTE, row.steps_taken],
  );
  const turnosDados = contagem[0]?.n ?? 0;

  return {
    enrollment: {
      id: row.id,
      pointer_id: row.pointer_id,
      version_id: row.version_id,
      current_node_id: row.current_node_id,
      steps_taken: row.steps_taken,
      conversation_id: row.conversation_id,
    },
    node,
    graph: parsed.data,
    turnosDados,
    respostasRestantes: respostasRestantes(node.config.max_turnos, turnosDados),
  };
}

/** O `agent_id` do nó no comando, para o resolvedor do turno. Uma leitura só; `null` = ninguém no comando. */
export async function agenteDoFluxoDoContato(
  db: BancoDoAgenteNoFluxo,
  organizationId: string,
  contactId: string,
): Promise<string | null> {
  const estado = await carregarAgenteDoFluxo(db, { organizationId, contactId });
  return estado?.node.config.agent_id ?? null;
}

/**
 * O bloco que o agente lê no turno em que está no comando: o objetivo, quantas respostas restam e como
 * encerrar a etapa. Vazio quando ninguém está no comando — o turno segue idêntico.
 *
 * Na ÚLTIMA resposta o bloco muda de tom: já que não haverá outra, o agente fecha com gentileza e deixa
 * combinado o próximo passo, em vez de ser cortado no meio de uma pergunta.
 */
export function blocoDoFluxo(estado: EstadoDoAgenteNoFluxo | null): string {
  if (estado === null) return "";
  const objetivo = umaLinha(estado.node.config.objetivo);
  if (objetivo === "") return "";
  const ultima = estado.respostasRestantes <= 1;
  const linhas = [
    "",
    "",
    "FLUXO (você está conduzindo uma etapa de um fluxo de atendimento; o objetivo foi definido pelo dono do fluxo)",
    `- Objetivo desta etapa: "${objetivo}"`,
    `- Respostas que você ainda pode dar nesta etapa, contando esta: ${estado.respostasRestantes}`,
    "- Quando o objetivo estiver cumprido, chame a ferramenta concluir_etapa, com um resumo curto do que ficou combinado, e encerre o turno. Não anuncie à pessoa que está mudando de etapa.",
  ];
  if (ultima) {
    linhas.push(
      "- Esta é a sua ÚLTIMA resposta nesta etapa: conduza a conversa para um fechamento gentil e, se o objetivo ainda não foi cumprido, deixe combinado o próximo passo.",
    );
  }
  return linhas.join("\n");
}

/**
 * Conta UM turno do agente nesta visita ao nó e renova o relógio de silêncio (a pessoa falou e o agente
 * respondeu: o prazo recomeça). Idempotente pela chave `agente_turno:<passo>:<chave>`, com `chave` = a mensagem
 * (ou o job) que motivou o turno. Devolve quantos turnos há AGORA nesta visita.
 */
export async function registrarTurnoDoAgente(
  db: BancoDoAgenteNoFluxo,
  args: { organizationId: string; estado: EstadoDoAgenteNoFluxo; chave: string; agora: Date },
): Promise<{ novo: boolean; turnosDados: number }> {
  const { estado } = args;
  const { rows: inseridos } = await db.query<{ id: string }>(
    `insert into followup_enrollment_events
       (organization_id, enrollment_id, node_id, event_type, payload, idempotency_key)
     values ($1, $2, $3, $4, $5::jsonb, $6)
     on conflict (enrollment_id, idempotency_key) where idempotency_key is not null do nothing
     returning id`,
    [
      args.organizationId,
      estado.enrollment.id,
      estado.enrollment.current_node_id,
      EVENTO_TURNO_DO_AGENTE,
      JSON.stringify({ passo: estado.enrollment.steps_taken }),
      `${EVENTO_TURNO_DO_AGENTE}:${estado.enrollment.steps_taken}:${args.chave}`,
    ],
  );
  const novo = inseridos.length > 0;
  if (novo) {
    const prazo = new Date(args.agora.getTime() + estado.node.config.silencio_minutos * 60_000);
    await db.query(
      `update followup_enrollments
          set next_eval_at = $5, updated_at = $6
        where id = $1 and organization_id = $2
          and status = 'com_agente' and current_node_id = $3 and steps_taken = $4`,
      [
        estado.enrollment.id,
        args.organizationId,
        estado.enrollment.current_node_id,
        estado.enrollment.steps_taken,
        prazo.toISOString(),
        args.agora.toISOString(),
      ],
    );
  }
  return { novo, turnosDados: estado.turnosDados + (novo ? 1 : 0) };
}

export type ResultadoDaSaida =
  | { ok: true; para: string }
  /** Já não estava mais neste nó (o relógio ou outra chamada chegou antes) — não é erro, é uma corrida perdida. */
  | { ok: false; motivo: "ja_saiu" }
  /** O grafo não liga esta saída a lugar nenhum. O publish cobra isso; chegar aqui é grafo alterado por fora. */
  | { ok: false; motivo: "sem_aresta" };

/**
 * Tira a inscrição do nó pela saída dada: ela volta a `active` no destino, com o passo avançado e avaliação
 * imediata, e o motor segue dali no próximo tick. Um comando SQL só (move + evento), condicionado a ainda
 * estar `com_agente`, neste nó e neste passo, e a não haver lease de tick vivo — quem chega em segundo não move
 * nada e não duplica nada.
 */
export async function encerrarAgenteNoFluxo(
  db: BancoDoAgenteNoFluxo,
  args: {
    organizationId: string;
    estado: EstadoDoAgenteNoFluxo;
    saida: SaidaDoTurno;
    /** O que o agente diz que ficou combinado (só na saída "cumpriu"). Curto: vai para a linha do tempo. */
    resumo?: string;
  },
): Promise<ResultadoDaSaida> {
  const { estado } = args;
  const aresta = selectEdge(estado.graph.edges, estado.node.id, { type: "branch", branch_id: args.saida });
  if (aresta === null) return { ok: false, motivo: "sem_aresta" };

  const resumo = args.resumo === undefined ? null : umaLinha(args.resumo).slice(0, 300);
  // "Avaliar agora": o instante é o `now()` do PRÓPRIO Postgres, nunca o relógio do processo. O claim compara
  // `next_eval_at` com `now()` do banco, e o do processo fica 17–34 ms à frente — a inscrição esperaria o tick
  // DEPOIS do que devia (`tests/unit/followup-agendamento-declarado.test.ts`, migration 0147). Sendo SQL, `now()`
  // resolve; o `fn_agora()` existe para quem grava por PostgREST.
  const { rows } = await db.query<{ id: string }>(
    `with movida as (
       update followup_enrollments
          set status = 'active',
              current_node_id = $4,
              steps_taken = steps_taken + 1,
              next_eval_at = now(),
              claimed_until = null,
              attempts = 0,
              updated_at = now()
        where id = $1 and organization_id = $2
          and status = 'com_agente'
          and current_node_id = $3
          and steps_taken = $5
          and (claimed_until is null or claimed_until < now())
        returning id
     )
     insert into followup_enrollment_events
       (organization_id, enrollment_id, node_id, event_type, payload, idempotency_key)
     select $2, id, $3, $6, $7::jsonb, $8 from movida
     on conflict (enrollment_id, idempotency_key) where idempotency_key is not null do nothing
     returning id`,
    [
      estado.enrollment.id,
      args.organizationId,
      estado.enrollment.current_node_id,
      aresta.target,
      estado.enrollment.steps_taken,
      EVENTO_SAIDA_DO_AGENTE,
      JSON.stringify({ saida: args.saida, para: aresta.target, ...(resumo !== null && resumo !== "" ? { resumo } : {}) }),
      `${EVENTO_SAIDA_DO_AGENTE}:${estado.enrollment.steps_taken}`,
    ],
  );
  return rows.length > 0 ? { ok: true, para: aresta.target } : { ok: false, motivo: "ja_saiu" };
}
