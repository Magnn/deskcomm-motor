import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import { decidirRajada } from "@/lib/agent-engine/edge/crm/debounce";

/**
 * A JANELA DESLIZANTE TEM TETO.
 *
 * Quem escreve em partes manda a segunda 12–25 s depois da primeira (medido em 21/11/2026). Com
 * `INBOUND_DEBOUNCE_MAX_MS`, cada mensagem empurra o `run_after` do job para "agora + janela" — sem passar de
 * "criação do job + teto", que é o que a âncora protegia (#1390). Invariante e não unidade: `least`/`greatest` com
 * intervalo é semântica que só o Postgres decide.
 *
 * Roda contra o Postgres efêmero do `scripts/test-db.sh`, com o `baseline.sql` aplicado.
 */
const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 2,
});

const ORG = "0be7a70a-2580-4000-8000-000000000201";
const CONTATO = "0be7a70a-2580-4000-8000-000000000202";
const alvo = { organizationId: ORG, contactId: CONTATO };

/** Job pendente criado há `idadeS` segundos, com a janela vencendo em `venceEmS` segundos. */
async function jobPendente(idadeS: number, venceEmS: number, status = "pending"): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into job_queue (organization_id, contact_id, kind, payload, status, run_after, created_at)
     values ($1, $2, 'inbound_turn', '{}'::jsonb, $3, now() + $4 * interval '1 second', now() - $5 * interval '1 second')
     returning id`,
    [ORG, CONTATO, status, venceEmS, idadeS],
  );
  return rows[0]!.id;
}

/** Segundos entre agora e o `run_after` do job. */
async function venceEm(id: string): Promise<number> {
  const { rows } = await pool.query<{ s: number }>(
    `select extract(epoch from run_after - now())::float as s from job_queue where id = $1`,
    [id],
  );
  return rows[0]!.s;
}

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name)
     values ($1, 'org-janela-deslizante', 'Org Janela LTDA', 'Org Janela') on conflict (id) do nothing`,
    [ORG],
  );
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number)
     values ($1, $2, 'Lead da Janela', '+5511900000201') on conflict (id) do nothing`,
    [CONTATO, ORG],
  );
});

afterEach(async () => {
  await pool.query("delete from job_queue where organization_id = $1", [ORG]);
});

afterAll(async () => {
  await pool.query("delete from job_queue where organization_id = $1", [ORG]);
  await pool.query("delete from contacts where id = $1", [CONTATO]);
  await pool.query("delete from organizations where id = $1", [ORG]);
  await pool.end();
});

describe("janela deslizante com teto", () => {
  it("⭐ a segunda parte empurra a espera para agora + janela", async () => {
    const id = await jobPendente(6, 6);

    const decisao = await decidirRajada(pool, alvo, 12_000, Date.now(), 40_000);

    expect(decisao).toEqual({ tipo: "coalescido", jobId: id });
    expect(await venceEm(id)).toBeGreaterThan(11);
  });

  it("não passa do teto contado da criação do job", async () => {
    const id = await jobPendente(35, 3);

    await decidirRajada(pool, alvo, 12_000, Date.now(), 40_000);

    const s = await venceEm(id);
    expect(s).toBeGreaterThan(4);
    expect(s).toBeLessThan(6);
  });

  it("job já pego por um worker não é esticado: a mensagem abre janela nova", async () => {
    await jobPendente(6, 6, "running");

    const decisao = await decidirRajada(pool, alvo, 12_000, Date.now(), 40_000);

    expect(decisao.tipo).toBe("enfileirar");
  });

  it("sem teto, a janela segue ancorada: o run_after não muda", async () => {
    const id = await jobPendente(6, 2);

    const decisao = await decidirRajada(pool, alvo, 12_000, Date.now(), 0);

    expect(decisao).toEqual({ tipo: "coalescido", jobId: id });
    expect(await venceEm(id)).toBeLessThan(3);
  });
});
