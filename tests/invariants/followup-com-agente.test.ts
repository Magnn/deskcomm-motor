import { afterAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";

import { isolarFixtureDeFollowup } from "./followup-isolamento";

/**
 * Migration 0901 — o status `com_agente`: um agente de IA conduz a conversa dentro
 * de um fluxo (fatia 1 do nó "Agente de IA").
 *
 * O que só um Postgres de verdade prova, e que nenhum teste de TypeScript alcança:
 *
 *   1. o CHECK de vocabulário aceita o status novo;
 *   2. a COERÊNCIA DE RELÓGIO o exige com `next_eval_at` — um `com_agente` sem
 *      prazo seria uma conversa que ninguém encerra e que ninguém vê parar;
 *   3. ele OCUPA a vaga de "um follow-up vivo por contato" (ao contrário do
 *      `dormente`): quem conversa com um agente não entra noutra cadência ao mesmo
 *      tempo, seriam duas vozes;
 *   4. o CLAIM o enxerga quando vence — sem isso o prazo de silêncio nunca acorda a
 *      inscrição e nada acusa (a armadilha da 0308), e uma inscrição que ainda não
 *      venceu NÃO é reclamada;
 *   5. um roteiro de atendimento não pode estar `com_agente` (gatilho da 0394).
 *
 * Quem chama o claim aqui é a função SQL de produção, por SQL puro: é ela que o
 * worker 24/7 executa, e a propriedade está na lista de status dentro dela.
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

const ORG = "f0000901-0000-4000-8000-000000000901";

const GRAFO_MINIMO = JSON.stringify({
  nodes: [
    { id: "t1", type: "trigger", label: "i", position: { x: 0, y: 0 }, config: {} },
    { id: "e1", type: "end", label: "f", position: { x: 0, y: 0 }, config: { outcome: "converted" } },
  ],
  edges: [{ id: "a", source: "t1", target: "e1", priority: 0, condition: { type: "always" } }],
});

interface Base {
  pointerId: string;
  versionId: string;
}

async function semear(surface: "followup" | "atendimento" = "followup"): Promise<Base> {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name) values ($1, 'com-agente-0901', 'Org 0901', 'Org 0901')
     on conflict (id) do nothing`,
    [ORG],
  );
  const { rows: v } = await pool.query<{ id: string }>(
    `insert into followup_flow_versions (organization_id, graph) values ($1, $2) returning id`,
    [ORG, GRAFO_MINIMO],
  );
  const { rows: p } = await pool.query<{ id: string }>(
    `insert into followup_flow_pointers (organization_id, name, status, active_version_id, surface)
     values ($1, $2, 'active', $3, $4) returning id`,
    [ORG, `Fluxo 0901 ${Date.now()}-${Math.random()}`, v[0]!.id, surface],
  );
  return { pointerId: p[0]!.id, versionId: v[0]!.id };
}

async function novoContato(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into contacts (organization_id, display_name) values ($1, 'Lead 0901') returning id`,
    [ORG],
  );
  return rows[0]!.id;
}

/** `proximaAvaliacao` em SQL (`now() + interval`) ou null, para escrever o relógio na própria consulta. */
async function inscrever(
  base: Base,
  contato: string,
  status: string,
  proximaAvaliacao: string | null,
): Promise<void> {
  await pool.query(
    `insert into followup_enrollments
       (organization_id, pointer_id, version_id, contact_id, current_node_id, status, next_eval_at)
     values ($1, $2, $3, $4, 't1', $5, ${proximaAvaliacao ?? "null"})`,
    [ORG, base.pointerId, base.versionId, contato, status],
  );
}

async function erroDe(op: () => Promise<unknown>): Promise<{ code?: string; message: string } | null> {
  try {
    await op();
    return null;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { code: err.code, message: err.message ?? String(e) };
  }
}

describe("followup_enrollments — status com_agente (0901)", () => {
  it("o vocabulário de status aceita `com_agente` com relógio", async () => {
    const base = await semear();
    const contato = await novoContato();

    const erro = await erroDe(() => inscrever(base, contato, "com_agente", "now() + interval '60 minutes'"));

    expect(erro).toBeNull();
  });

  it("`com_agente` SEM `next_eval_at` é recusado — conversa sem prazo é conversa que ninguém encerra", async () => {
    const base = await semear();
    const contato = await novoContato();

    const erro = await erroDe(() => inscrever(base, contato, "com_agente", null));

    expect(erro?.code).toBe("23514"); // check_violation
    expect(erro?.message).toContain("followup_enrollments_relogio_coerente");
  });

  it("controle: um status que o vocabulário NÃO conhece continua recusado", async () => {
    // Sem este controle, o caso 1 passaria por vacuidade se o CHECK tivesse sido afrouxado demais.
    const base = await semear();
    const contato = await novoContato();

    const erro = await erroDe(() => inscrever(base, contato, "com_robo", "now() + interval '60 minutes'"));

    // Um status fora do vocabulário viola os DOIS checks (`status_valido` e `relogio_coerente`), e o
    // Postgres reporta o primeiro por ordem de nome — hoje `relogio_coerente`. A propriedade é a
    // recusa; qual dos dois fala primeiro não é.
    expect(erro?.code).toBe("23514");
    expect(erro?.message).toMatch(/followup_enrollments_(status_valido|relogio_coerente)/);
  });

  it("OCUPA a vaga de um follow-up vivo por contato: uma segunda inscrição viva é recusada", async () => {
    const base = await semear();
    const outra = await semear();
    const contato = await novoContato();
    await inscrever(base, contato, "com_agente", "now() + interval '60 minutes'");

    const erro = await erroDe(() => inscrever(outra, contato, "active", "now() + interval '5 minutes'"));

    expect(erro?.code).toBe("23505"); // unique_violation
    expect(erro?.message).toContain("idx_followup_enrollments_one_live");
  });

  it("controle: o `dormente` NÃO ocupa a vaga (a diferença que justifica o status novo)", async () => {
    // O dormente libera a vaga de propósito (0308: uma espera de 28 dias não pode trancar o contato
    // fora de outras cadências). O com_agente faz o contrário. Os dois lados ficam pinados aqui.
    const base = await semear();
    const outra = await semear();
    const contato = await novoContato();
    await inscrever(base, contato, "dormente", "now() + interval '28 days'");

    const erro = await erroDe(() => inscrever(outra, contato, "active", "now() + interval '5 minutes'"));

    expect(erro).toBeNull();
  });
});

describe("fn_claim_due_followup_enrollments — enxerga o com_agente (0901)", () => {
  it("reclama o `com_agente` cujo prazo venceu, e só ele", async () => {
    const base = await semear();
    const vencido = await novoContato();
    const aindaNoPrazo = await novoContato();
    await inscrever(base, vencido, "com_agente", "now() - interval '1 minute'");
    await inscrever(base, aindaNoPrazo, "com_agente", "now() + interval '60 minutes'");

    const { rows } = await pool.query<{ contact_id: string; status: string }>(
      `select contact_id, status from fn_claim_due_followup_enrollments(10, 60)`,
    );

    expect(rows.map((r) => r.contact_id)).toEqual([vencido]);
    expect(rows[0]?.status).toBe("com_agente");
  });

  it("controle: `active` vencido também é reclamado (o claim não passou a reclamar só o novo)", async () => {
    const base = await semear();
    const contato = await novoContato();
    await inscrever(base, contato, "active", "now() - interval '1 minute'");

    const { rows } = await pool.query<{ status: string }>(
      `select status from fn_claim_due_followup_enrollments(10, 60)`,
    );

    expect(rows.map((r) => r.status)).toEqual(["active"]);
  });
});

describe("roteiro de atendimento — não pode estar com_agente (gatilho da 0394)", () => {
  it("uma inscrição `com_agente` num ponteiro da superfície `atendimento` é recusada", async () => {
    const roteiro = await semear("atendimento");
    const contato = await novoContato();

    const erro = await erroDe(() => inscrever(roteiro, contato, "com_agente", "now() + interval '60 minutes'"));

    expect(erro).not.toBeNull();
    expect(erro?.message).toMatch(/roteiro de atendimento só roda como coletando/);
  });
});
