import { afterAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";

import {
  EVENTO_SAIDA_DO_AGENTE,
  EVENTO_TURNO_DO_AGENTE,
  agenteDoFluxoDoContato,
  carregarAgenteDoFluxo,
  encerrarAgenteNoFluxo,
  registrarTurnoDoAgente,
} from "@/lib/followup/agente-no-fluxo";
import { runFollowupTick, type FollowupJobRequest, type TickDeps } from "@/lib/followup/engine";
import {
  AGENT_CONCLUDED_BRANCH_ID,
  AGENT_LIMIT_BRANCH_ID,
  AGENT_SILENCE_BRANCH_ID,
  type FlowGraph,
} from "@/lib/followup/graph-schema";
import { createPgAdminClient } from "@/lib/followup/turn-bridge";

import { isolarFixtureDeFollowup } from "./followup-isolamento";
import { relogioAncoradoNoBanco } from "./followup-relogio";
import { criarOrigemDeFollowup } from "./followup-service-origin";

/**
 * O agente no comando de um fluxo (nó "Agente de IA", fatia 3) contra um Postgres de verdade.
 *
 * O que só o banco real prova, e que o teste unitário (com um banco de mentira) não alcança:
 *
 *   1. o SQL de leitura e o de escrita rodam no schema REAL, e o filtro de organização, de contato, de status e
 *      de fluxo ATIVO vale de verdade;
 *   2. contar um turno é idempotente pelo ÍNDICE ÚNICO de eventos (`idx_followup_events_idem`), não por um
 *      `if` do TypeScript;
 *   3. sair do nó é UM comando: só move quem ainda está `com_agente`, neste nó, neste passo e sem lease — e o
 *      evento de saída nasce na mesma instrução;
 *   4. o MOTOR, pelo tick de produção: a chegada ao nó estaciona a inscrição em `com_agente` com o prazo de
 *      silêncio, e, vencido o prazo, o mesmo tick a leva pela saída de silêncio e o fluxo termina.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 4,
});

afterAll(async () => {
  // Quem suja, limpa: o claim é global e o arquivo seguinte não pode herdar linha devida.
  await isolarFixtureDeFollowup(pool);
  await pool.end();
});

beforeEach(async () => {
  await isolarFixtureDeFollowup(pool);
});

const ORG = "f0000903-0000-4000-8000-000000000903";
const OUTRA_ORG = "f0000903-0000-4000-8000-000000000904";
const AGENTE = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const POS = { x: 0, y: 0 };

const GRAFO: FlowGraph = {
  nodes: [
    { id: "t", type: "trigger", label: "Início", position: POS, config: {} },
    {
      id: "ag",
      type: "agent",
      label: "Atendimento",
      position: POS,
      config: { agent_id: AGENTE, objetivo: "Agendar uma visita", max_turnos: 3, silencio_minutos: 30 },
    },
    { id: "f-ok", type: "end", label: "Cumpriu", position: POS, config: { outcome: "converted" } },
    { id: "f-limite", type: "end", label: "Limite", position: POS, config: { outcome: "exhausted" } },
    { id: "f-silencio", type: "end", label: "Silêncio", position: POS, config: { outcome: "exhausted" } },
  ],
  edges: [
    { id: "e0", source: "t", target: "ag", priority: 0, condition: { type: "always" } },
    { id: "e1", source: "ag", target: "f-ok", priority: 0, condition: { type: "branch", branch_id: AGENT_CONCLUDED_BRANCH_ID } },
    { id: "e2", source: "ag", target: "f-limite", priority: 0, condition: { type: "branch", branch_id: AGENT_LIMIT_BRANCH_ID } },
    { id: "e3", source: "ag", target: "f-silencio", priority: 0, condition: { type: "branch", branch_id: AGENT_SILENCE_BRANCH_ID } },
  ],
};

async function semearOrg(org: string): Promise<void> {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name) values ($1, $2, $3, $4) on conflict (id) do nothing`,
    [org, `agente-no-fluxo-${org.slice(-3)}`, `Org agente no fluxo ${org.slice(-3)}`, `Org agente no fluxo ${org.slice(-3)}`],
  );
}

async function semearFluxo(org: string, status: "active" | "disabled" = "active"): Promise<{ pointerId: string; versionId: string }> {
  const { rows: v } = await pool.query<{ id: string }>(
    `insert into followup_flow_versions (organization_id, graph) values ($1, $2) returning id`,
    [org, JSON.stringify(GRAFO)],
  );
  const { rows: p } = await pool.query<{ id: string }>(
    `insert into followup_flow_pointers (organization_id, name, status, active_version_id, surface)
     values ($1, $2, $3, $4, 'followup') returning id`,
    [org, `Fluxo agente ${Date.now()}-${Math.random()}`, status, v[0]!.id],
  );
  return { pointerId: p[0]!.id, versionId: v[0]!.id };
}

async function novoContato(org: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into contacts (organization_id, display_name) values ($1, 'Lead agente') returning id`,
    [org],
  );
  return rows[0]!.id;
}

async function inscrever(args: {
  org: string;
  pointerId: string;
  versionId: string;
  contatoId: string;
  status: string;
  proxima: string;
  passo?: number;
  lease?: string | null;
}): Promise<string> {
  const origem = await criarOrigemDeFollowup(pool, args.org, args.contatoId);
  const { rows } = await pool.query<{ id: string }>(
    `insert into followup_enrollments
       (organization_id, pointer_id, version_id, contact_id, current_node_id, status, next_eval_at, steps_taken, claimed_until, service_boundary)
     values ($1, $2, $3, $4, 'ag', $5, ${args.proxima}, $6, ${args.lease ?? "null"}, $7::jsonb)
     returning id`,
    [args.org, args.pointerId, args.versionId, args.contatoId, args.status, args.passo ?? 0, origem],
  );
  return rows[0]!.id;
}

const inscricao = async (id: string) => (await pool.query(`select * from followup_enrollments where id = $1`, [id])).rows[0]!;
const eventos = async (id: string, tipo: string) =>
  (await pool.query(`select * from followup_enrollment_events where enrollment_id = $1 and event_type = $2 order by created_at`, [id, tipo])).rows;

describe("carregarAgenteDoFluxo — o SQL no schema real", () => {
  it("acha o agente no comando, com o objetivo e a contagem de turnos DESTA visita ao nó", async () => {
    await semearOrg(ORG);
    const fluxo = await semearFluxo(ORG);
    const contato = await novoContato(ORG);
    const enr = await inscrever({ org: ORG, ...fluxo, contatoId: contato, status: "com_agente", proxima: "now() + interval '30 minutes'", passo: 2 });

    const e = await carregarAgenteDoFluxo(pool, { organizationId: ORG, contactId: contato });
    expect(e?.enrollment).toMatchObject({ id: enr, current_node_id: "ag", steps_taken: 2 });
    expect(e?.node.config).toMatchObject({ agent_id: AGENTE, objetivo: "Agendar uma visita", max_turnos: 3 });
    expect(e).toMatchObject({ turnosDados: 0, respostasRestantes: 3 });
    expect(await agenteDoFluxoDoContato(pool, ORG, contato)).toBe(AGENTE);

    // um evento de OUTRA visita ao nó (outro passo) não conta para esta
    await pool.query(
      `insert into followup_enrollment_events (organization_id, enrollment_id, node_id, event_type, payload, idempotency_key)
       values ($1, $2, 'ag', $3, '{"passo": 0}'::jsonb, 'agente_turno:0:antiga')`,
      [ORG, enr, EVENTO_TURNO_DO_AGENTE],
    );
    expect((await carregarAgenteDoFluxo(pool, { organizationId: ORG, contactId: contato }))?.turnosDados).toBe(0);
  });

  it("não acha: outro contato, outra organização, status que não é `com_agente`, fluxo DESATIVADO", async () => {
    await semearOrg(ORG);
    await semearOrg(OUTRA_ORG);
    const fluxo = await semearFluxo(ORG);
    const contato = await novoContato(ORG);
    const enr = await inscrever({ org: ORG, ...fluxo, contatoId: contato, status: "com_agente", proxima: "now() + interval '30 minutes'" });

    // outro contato
    expect(await carregarAgenteDoFluxo(pool, { organizationId: ORG, contactId: await novoContato(ORG) })).toBeNull();
    // a mesma pessoa vista por OUTRA organização (o agent_id vem do grafo; a consulta filtra a org)
    expect(await carregarAgenteDoFluxo(pool, { organizationId: OUTRA_ORG, contactId: contato })).toBeNull();
    // fluxo desativado para de guiar na hora
    await pool.query(`update followup_flow_pointers set status = 'disabled' where id = $1`, [fluxo.pointerId]);
    expect(await carregarAgenteDoFluxo(pool, { organizationId: ORG, contactId: contato })).toBeNull();
    await pool.query(`update followup_flow_pointers set status = 'active' where id = $1`, [fluxo.pointerId]);
    expect(await carregarAgenteDoFluxo(pool, { organizationId: ORG, contactId: contato })).not.toBeNull();
    // status diferente de com_agente (o relógio do silêncio já a tirou dali)
    await pool.query(`update followup_enrollments set status = 'active', next_eval_at = now() where id = $1`, [enr]);
    expect(await carregarAgenteDoFluxo(pool, { organizationId: ORG, contactId: contato })).toBeNull();
  });
});

describe("registrarTurnoDoAgente — idempotente pelo índice único", () => {
  it("a mesma mensagem duas vezes conta UMA vez; outra mensagem conta; o relógio de silêncio é renovado", async () => {
    await semearOrg(ORG);
    const fluxo = await semearFluxo(ORG);
    const contato = await novoContato(ORG);
    const enr = await inscrever({ org: ORG, ...fluxo, contatoId: contato, status: "com_agente", proxima: "now() + interval '1 minute'" });
    const estado = (await carregarAgenteDoFluxo(pool, { organizationId: ORG, contactId: contato }))!;
    const agora = new Date();

    expect(await registrarTurnoDoAgente(pool, { organizationId: ORG, estado, chave: "msg-1", agora })).toEqual({ novo: true, turnosDados: 1 });
    expect(await registrarTurnoDoAgente(pool, { organizationId: ORG, estado, chave: "msg-1", agora })).toEqual({ novo: false, turnosDados: 0 });
    expect((await registrarTurnoDoAgente(pool, { organizationId: ORG, estado, chave: "msg-2", agora })).novo).toBe(true);
    expect(await eventos(enr, EVENTO_TURNO_DO_AGENTE)).toHaveLength(2);

    // agora + silencio_minutos (30) — o prazo recomeça a cada troca
    const depois = await inscricao(enr);
    const esperado = agora.getTime() + 30 * 60_000;
    expect(Math.abs(new Date(depois.next_eval_at).getTime() - esperado)).toBeLessThan(2_000);
    expect(depois.status).toBe("com_agente");
    // e a contagem que o próximo turno lê já reflete os dois
    expect((await carregarAgenteDoFluxo(pool, { organizationId: ORG, contactId: contato }))).toMatchObject({ turnosDados: 2, respostasRestantes: 1 });
  });
});

describe("encerrarAgenteNoFluxo — UM comando condicionado", () => {
  async function preparar(over: { lease?: string | null } = {}) {
    await semearOrg(ORG);
    const fluxo = await semearFluxo(ORG);
    const contato = await novoContato(ORG);
    const enr = await inscrever({ org: ORG, ...fluxo, contatoId: contato, status: "com_agente", proxima: "now() + interval '30 minutes'", passo: 4, lease: over.lease ?? null });
    const estado = (await carregarAgenteDoFluxo(pool, { organizationId: ORG, contactId: contato }))!;
    return { enr, contato, estado };
  }

  it("cumpriu o objetivo: a inscrição volta a `active` no destino, com o passo avançado, avaliação imediata e o evento com o resumo", async () => {
    const { enr, estado } = await preparar();
    const r = await encerrarAgenteNoFluxo(pool, { organizationId: ORG, estado, saida: AGENT_CONCLUDED_BRANCH_ID, resumo: "Visita marcada para sábado" });
    expect(r).toEqual({ ok: true, para: "f-ok" });

    const depois = await inscricao(enr);
    expect(depois).toMatchObject({ status: "active", current_node_id: "f-ok", steps_taken: 5, claimed_until: null });
    expect(new Date(depois.next_eval_at).getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
    const saidas = await eventos(enr, EVENTO_SAIDA_DO_AGENTE);
    expect(saidas).toHaveLength(1);
    expect(saidas[0].payload).toEqual({ saida: "concluiu", para: "f-ok", resumo: "Visita marcada para sábado" });
  });

  it("quem chega em segundo (o relógio, uma segunda chamada da ferramenta) NÃO move nada e NÃO duplica o evento", async () => {
    const { enr, estado } = await preparar();
    expect((await encerrarAgenteNoFluxo(pool, { organizationId: ORG, estado, saida: AGENT_CONCLUDED_BRANCH_ID })).ok).toBe(true);
    // o mesmo estado (velho) tentando de novo, e por OUTRA saída: nada acontece
    expect(await encerrarAgenteNoFluxo(pool, { organizationId: ORG, estado, saida: AGENT_CONCLUDED_BRANCH_ID })).toEqual({ ok: false, motivo: "ja_saiu" });
    expect(await encerrarAgenteNoFluxo(pool, { organizationId: ORG, estado, saida: AGENT_LIMIT_BRANCH_ID })).toEqual({ ok: false, motivo: "ja_saiu" });
    expect(await eventos(enr, EVENTO_SAIDA_DO_AGENTE)).toHaveLength(1);
    expect((await inscricao(enr)).current_node_id).toBe("f-ok");
  });

  it("um tick com o lease vivo (claimed_until no futuro) BLOQUEIA a saída: quem move é o tick", async () => {
    const { enr, estado } = await preparar({ lease: "now() + interval '2 minutes'" });
    expect(await encerrarAgenteNoFluxo(pool, { organizationId: ORG, estado, saida: AGENT_LIMIT_BRANCH_ID })).toEqual({ ok: false, motivo: "ja_saiu" });
    expect(await eventos(enr, EVENTO_SAIDA_DO_AGENTE)).toHaveLength(0);
    expect((await inscricao(enr)).status).toBe("com_agente");
  });

  it("o passo é parte da condição: um estado de uma visita ANTERIOR ao nó não move a inscrição de agora", async () => {
    const { enr, estado } = await preparar();
    const velho = { ...estado, enrollment: { ...estado.enrollment, steps_taken: 3 } };
    expect(await encerrarAgenteNoFluxo(pool, { organizationId: ORG, estado: velho, saida: AGENT_CONCLUDED_BRANCH_ID })).toEqual({ ok: false, motivo: "ja_saiu" });
    expect((await inscricao(enr)).current_node_id).toBe("ag");
  });
});

describe("o motor, pelo tick de produção", () => {
  const db = createPgAdminClient(pool);
  const deps = (jobs: FollowupJobRequest[]): TickDeps => ({ db, clock: relogioAncoradoNoBanco(), enqueueJob: async (job) => void jobs.push(job) });

  it("CHEGADA estaciona em `com_agente` com o prazo de silêncio; vencido o prazo, o silêncio leva ao fim do fluxo", async () => {
    await semearOrg(ORG);
    const fluxo = await semearFluxo(ORG);
    const contato = await novoContato(ORG);
    const enr = await inscrever({ org: ORG, ...fluxo, contatoId: contato, status: "active", proxima: "now() - interval '1 second'" });
    const jobs: FollowupJobRequest[] = [];

    // 1) o tick chega ao nó: o agente NÃO abre a conversa (nenhum job de envio), a inscrição passa a `com_agente`
    await runFollowupTick(deps(jobs), { limit: 5 });
    const estacionada = await inscricao(enr);
    expect(estacionada).toMatchObject({ status: "com_agente", current_node_id: "ag" });
    expect(jobs).toHaveLength(0);
    const espera = new Date(estacionada.next_eval_at).getTime() - Date.now();
    expect(espera).toBeGreaterThan(29 * 60_000);
    expect(espera).toBeLessThan(31 * 60_000);
    const chegada = await eventos(enr, "wait_started");
    expect(chegada[0].payload).toMatchObject({ wake_status: "com_agente" });

    // 2) ainda não venceu: o tick não a toca
    await runFollowupTick(deps(jobs), { limit: 5 });
    expect((await inscricao(enr)).status).toBe("com_agente");

    // 3) o prazo vence: o MESMO tick a leva pela saída de silêncio, e o seguinte fecha o fluxo
    await pool.query(`update followup_enrollments set next_eval_at = now() - interval '1 second' where id = $1`, [enr]);
    await runFollowupTick(deps(jobs), { limit: 5 });
    expect(await inscricao(enr)).toMatchObject({ status: "active", current_node_id: "f-silencio" });
    await runFollowupTick(deps(jobs), { limit: 5 });
    expect((await inscricao(enr)).status).toBe("completed");
    expect(jobs).toHaveLength(0);
  });
});

describe("0902 — `com_agente` e `dormente` contam como inscrição atual no guarda de agenda", () => {
  const atual = async (enr: string, no: string | null = null) =>
    (await pool.query<{ ok: boolean }>(`select fn_appointment_enrollment_current($1, $2, $3) as ok`, [ORG, enr, no])).rows[0]!.ok;

  it("a função reconhece os QUATRO status com relógio, e só eles", async () => {
    await semearOrg(ORG);
    const fluxo = await semearFluxo(ORG);
    const vivos = ["active", "waiting_reply", "dormente", "com_agente"];
    for (const status of vivos) {
      const enr = await inscrever({ org: ORG, ...fluxo, contatoId: await novoContato(ORG), status, proxima: "now() + interval '1 hour'" });
      expect(await atual(enr, "ag"), status).toBe(true);
      // e o nó faz parte da pergunta: a inscrição está em `ag`, não em `t`
      expect(await atual(enr, "t"), `${status} em outro nó`).toBe(false);
    }
    // pausadas por pessoa não têm relógio: o claim não as acorda, então não são "atuais" para um efeito
    const pausada = await inscrever({ org: ORG, ...fluxo, contatoId: await novoContato(ORG), status: "paused_handoff", proxima: "null" });
    expect(await atual(pausada, "ag")).toBe(false);
  });

  it("uma espera longa IMUNE (`dormente`) num nó de espera de verdade, VENCIDA, NÃO é mais cancelada pelo guarda de agenda", async () => {
    const db = createPgAdminClient(pool);
    await semearOrg(ORG);
    const grafoEspera = {
      nodes: [
        { id: "t", type: "trigger", label: "Início", position: POS, config: {} },
        { id: "w", type: "wait", label: "Espera longa", position: POS, config: { mode: "fixed", duration_ms: 172_800_000, immune_to_reply: true, fallback_template_id: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b" } },
        { id: "e", type: "end", label: "Fim", position: POS, config: { outcome: "converted" } },
      ],
      edges: [
        { id: "a", source: "t", target: "w", priority: 0, condition: { type: "always" } },
        { id: "b", source: "w", target: "e", priority: 0, condition: { type: "always" } },
      ],
    };
    const { rows: v } = await pool.query<{ id: string }>(
      `insert into followup_flow_versions (organization_id, graph) values ($1, $2) returning id`,
      [ORG, JSON.stringify(grafoEspera)],
    );
    const { rows: p } = await pool.query<{ id: string }>(
      `insert into followup_flow_pointers (organization_id, name, status, active_version_id, surface)
       values ($1, $2, 'active', $3, 'followup') returning id`,
      [ORG, `Fluxo espera longa ${Date.now()}-${Math.random()}`, v[0]!.id],
    );
    const contato = await novoContato(ORG);
    const origem = await criarOrigemDeFollowup(pool, ORG, contato);
    const { rows: e } = await pool.query<{ id: string }>(
      `insert into followup_enrollments
         (organization_id, pointer_id, version_id, contact_id, current_node_id, status, next_eval_at, steps_taken, service_boundary)
       values ($1, $2, $3, $4, 'w', 'dormente', now() - interval '1 second', 1, $5::jsonb) returning id`,
      [ORG, p[0]!.id, v[0]!.id, contato, origem],
    );
    // a espera já foi armada numa visita anterior: o evento que o motor lê para saber que ela venceu
    await pool.query(
      `insert into followup_enrollment_events (organization_id, enrollment_id, node_id, event_type, payload, idempotency_key)
       values ($1, $2, 'w', 'wait_started', '{}'::jsonb, 'w:0')`,
      [ORG, e[0]!.id],
    );
    await runFollowupTick({ db, clock: relogioAncoradoNoBanco(), enqueueJob: async () => undefined }, { limit: 5 });
    const depois = await inscricao(e[0]!.id);
    // Antes da 0902 este tick a cancelava com "Atendimento encerrado ou substituído" (sonda reproduzida no mesmo
    // arquivo). O que o motor faz DEPOIS com a espera (avançar, reprogramar) é assunto dos testes da espera imune;
    // aqui só a propriedade que o guarda de agenda tirava: a inscrição sobrevive ao tick.
    expect(depois.status, `motivo: ${depois.cancel_reason}`).not.toBe("cancelled");
    expect(depois.cancel_reason).toBeNull();
  });

  it("o mesmo com `com_agente` num nó de agente: vencida, NÃO é cancelada (já provado no ciclo completo acima)", async () => {
    const db = createPgAdminClient(pool);
    await semearOrg(ORG);
    const fluxo = await semearFluxo(ORG);
    const contato = await novoContato(ORG);
    const enr = await inscrever({ org: ORG, ...fluxo, contatoId: contato, status: "com_agente", proxima: "now() - interval '1 second'" });
    await runFollowupTick({ db, clock: relogioAncoradoNoBanco(), enqueueJob: async () => undefined }, { limit: 5 });
    const depois = await inscricao(enr);
    expect(depois.status).not.toBe("cancelled");
    expect(depois.cancel_reason).toBeNull();
  });
});
