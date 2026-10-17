/**
 * `registrarEncerramento` grava a recusa em `contacts.consent.marketing` sem apagar o resto do consent,
 * sem sobrescrever uma recusa mais antiga, e só no contato da organização certa. Postgres real: o que
 * decide é o `jsonb_set` do banco, não uma imitação dele.
 */
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { registrarEncerramento } from "@/lib/contacts/encerrar-acompanhamento";
import { recusouMarketing } from "@/lib/campanhas/elegibilidade";

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`, max: 2 });

const ORG = "e7ce0a00-0000-4000-8000-000000000001";
const OUTRA_ORG = "e7ce0a00-0000-4000-8000-000000000002";
const CONTATO = "e7ce0a00-0000-4000-8000-000000000003";
const DA_OUTRA = "e7ce0a00-0000-4000-8000-000000000004";

const consent = async (id: string) =>
  (await pool.query<{ consent: Record<string, unknown> | null }>("select consent from contacts where id = $1", [id])).rows[0]?.consent;

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name)
     values ($1, 'org-encerra-a', 'Org A LTDA', 'Org A'), ($2, 'org-encerra-b', 'Org B LTDA', 'Org B')
     on conflict (id) do nothing`,
    [ORG, OUTRA_ORG],
  );
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number)
     values ($1, $3, 'Cliente', '+5511900000951'), ($2, $4, 'Da outra', '+5511900000952')
     on conflict (id) do nothing`,
    [CONTATO, DA_OUTRA, ORG, OUTRA_ORG],
  );
});

beforeEach(async () => {
  await pool.query(`update contacts set consent = $2::jsonb where id = $1`, [CONTATO, JSON.stringify({ lgpd: { aceito: true } })]);
  await pool.query(`update contacts set consent = '{}'::jsonb where id = $1`, [DA_OUTRA]);
});

afterAll(async () => {
  await pool.query("delete from organizations where id = any($1::uuid[])", [[ORG, OUTRA_ORG]]);
  await pool.end();
});

describe("registrarEncerramento", () => {
  it("grava declined_at e a origem, e preserva o resto do consent", async () => {
    await registrarEncerramento(pool, { organizationId: ORG, contactId: CONTATO, agora: new Date("2026-10-17T18:45:00Z") });
    const c = await consent(CONTATO);
    expect(c).toMatchObject({ lgpd: { aceito: true }, marketing: { declined_at: "2026-10-17T18:45:00.000Z", declined_source: "conversa" } });
    expect(recusouMarketing(c)).toBe(true);
  });

  it("consent vazio ganha a recusa", async () => {
    await registrarEncerramento(pool, { organizationId: OUTRA_ORG, contactId: DA_OUTRA });
    expect(recusouMarketing(await consent(DA_OUTRA))).toBe(true);
  });

  it("a recusa mais antiga não é sobrescrita", async () => {
    await registrarEncerramento(pool, { organizationId: ORG, contactId: CONTATO, agora: new Date("2026-10-01T10:00:00Z") });
    await registrarEncerramento(pool, { organizationId: ORG, contactId: CONTATO, agora: new Date("2026-10-17T18:45:00Z") });
    expect((await consent(CONTATO))?.marketing).toMatchObject({ declined_at: "2026-10-01T10:00:00.000Z" });
  });

  it("organização errada não toca no contato", async () => {
    await registrarEncerramento(pool, { organizationId: OUTRA_ORG, contactId: CONTATO });
    expect(recusouMarketing(await consent(CONTATO))).toBe(false);
  });
});
