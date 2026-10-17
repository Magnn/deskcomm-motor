/**
 * Silêncio deixado num número ARQUIVADO não cala a IA no número novo.
 *
 * ## O defeito, medido em produção em 17/10/2026
 *
 * `isLeadInHandoff` olha TODAS as conversas do contato. Quando um número cai e
 * é arquivado, as conversas dele que estavam com humano (`bot_silenced_until =
 * 'infinity'`) ficam lá para sempre — e o humano não tem mais por onde
 * responder. Uma cliente que pagou escreveu para o número novo ("Fala comigo")
 * e o worker pulou os três turnos com "lead em handoff humano"; a tela da
 * conversa nova mostrava o automático ligado. 134 contatos estavam presos assim.
 *
 * ## Os controles
 *
 * O mesmo silêncio, num número só PARADO (não arquivado), continua valendo: a
 * sessão volta a subir e o humano volta a responder por ali. E o silêncio da
 * própria conversa, no número novo, também. Sem esses dois casos, um conserto
 * que simplesmente ignorasse o silêncio passaria.
 */
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { isLeadInHandoff } from "@/lib/agent-engine/agent/human-handoff";

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 2,
});

const ORG = "5113c10a-0000-4000-8000-000000000001";
const CONTACT = "5113c10a-0000-4000-8000-000000000002";
const SESSAO_NOVA = "5113c10a-0000-4000-8000-000000000003";
const SESSAO_VELHA = "5113c10a-0000-4000-8000-000000000004";
const CONV_NOVA = "5113c10a-0000-4000-8000-000000000005";
const CONV_VELHA = "5113c10a-0000-4000-8000-000000000006";

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name)
     values ($1, 'org-silencio-arquivado', 'Org Silencio LTDA', 'Org Silencio')
     on conflict (id) do nothing`,
    [ORG],
  );
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $3, 'silencio-nova', 'WORKING', '\\x00'::bytea),
            ($2, $3, 'silencio-velha', 'STOPPED', '\\x00'::bytea)
     on conflict (id) do nothing`,
    [SESSAO_NOVA, SESSAO_VELHA, ORG],
  );
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number)
     values ($1, $2, 'Cliente do numero novo', '+5511900000934') on conflict (id) do nothing`,
    [CONTACT, ORG],
  );
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
     values ($1, $3, $4, $5, 'open', false),
            ($2, $3, $4, $6, 'claimed', false)
     on conflict (id) do nothing`,
    [CONV_NOVA, CONV_VELHA, ORG, CONTACT, SESSAO_NOVA, SESSAO_VELHA],
  );
});

beforeEach(async () => {
  await pool.query(`update contacts set force_human = false where id = $1`, [CONTACT]);
  await pool.query(`update conversations set bot_silenced_until = null where organization_id = $1`, [ORG]);
  await pool.query(`update conversations set bot_silenced_until = 'infinity' where id = $1`, [CONV_VELHA]);
  await pool.query(`update channel_sessions set archived_at = null where id = $1`, [SESSAO_VELHA]);
});

afterAll(async () => {
  await pool.query("delete from organizations where id = $1", [ORG]);
  await pool.end();
});

describe("isLeadInHandoff e o número arquivado", () => {
  it("controle: silêncio em número só parado segue segurando o contato", async () => {
    expect(await isLeadInHandoff(pool, ORG, CONTACT)).toBe(true);
  });

  it("silêncio em número arquivado não segura mais o contato", async () => {
    await pool.query(`update channel_sessions set archived_at = now() where id = $1`, [SESSAO_VELHA]);
    expect(await isLeadInHandoff(pool, ORG, CONTACT)).toBe(false);
  });

  it("controle: o silêncio da conversa no número novo continua valendo", async () => {
    await pool.query(`update channel_sessions set archived_at = now() where id = $1`, [SESSAO_VELHA]);
    await pool.query(`update conversations set bot_silenced_until = 'infinity' where id = $1`, [CONV_NOVA]);
    expect(await isLeadInHandoff(pool, ORG, CONTACT)).toBe(true);
  });

  it("controle: force_human no contato continua valendo", async () => {
    await pool.query(`update channel_sessions set archived_at = now() where id = $1`, [SESSAO_VELHA]);
    await pool.query(`update contacts set force_human = true where id = $1`, [CONTACT]);
    expect(await isLeadInHandoff(pool, ORG, CONTACT)).toBe(true);
  });
});
