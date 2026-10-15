import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GOV_ORG, GOV_SESSION, seedGov } from "./gov-helpers";

/**
 * O HISTÓRICO DO CELULAR ENTRA SEM VIRAR ATENDIMENTO (migration 0929).
 *
 * `fn_importar_historico_da_conversa` grava mensagens que JÁ aconteceram. Aqui o
 * banco real responde o que nenhum mock responde:
 *
 *   - não sai `message.received` (a IA responderia conversa de meses atrás);
 *   - não abre demanda nem carimbo de atendimento;
 *   - conversa nova nasce ENCERRADA, sem não lidas nem espera na Fila;
 *   - a primeira mensagem AO VIVO depois disso reabre a conversa como sempre;
 *   - conversa que já existe não anda para trás e não ganha não lidas;
 *   - re-entrega da Meta não duplica.
 */
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 3,
});

beforeAll(() => seedGov());
afterAll(async () => pool.end());

async function contatoNovo() {
  const id = randomUUID();
  await pool.query("insert into contacts(id,organization_id,display_name) values($1,$2,'Histórico')", [id, GOV_ORG]);
  return id;
}

function lote(prefixo: string) {
  return [
    { external_id: `${prefixo}.1`, direction: "inbound", type: "text", body: "Oi, tem horário?", sent_at: "2026-07-01T12:00:00Z", status: "delivered", metadata: {} },
    { external_id: `${prefixo}.2`, direction: "outbound", type: "text", body: "Tem sim", sent_at: "2026-07-01T12:05:00Z", status: "read", metadata: {} },
    { external_id: `${prefixo}.3`, direction: "inbound", type: "text", body: "Obrigada", sent_at: "2026-07-01T12:10:00Z", status: "delivered", metadata: {} },
  ];
}

async function importar(contact: string, mensagens: unknown[]) {
  const { rows } = await pool.query(
    "select * from fn_importar_historico_da_conversa($1,$2,$3,$4::jsonb)",
    [GOV_ORG, GOV_SESSION, contact, JSON.stringify(mensagens)],
  );
  return rows[0] as { conversation_id: string; inseridas: number };
}

describe("histórico importado", () => {
  it("⭐ não emite message.received, não abre demanda, e a conversa nasce encerrada", async () => {
    const contact = await contatoNovo();
    const prefixo = `wamid.hist.${randomUUID()}`;
    const r = await importar(contact, lote(prefixo));
    expect(r.inseridas).toBe(3);

    const { rows: msgs } = await pool.query(
      "select id, imported_at, service_revision, demanda_id, sent_via from messages where conversation_id=$1 order by sent_at",
      [r.conversation_id],
    );
    expect(msgs).toHaveLength(3);
    expect(msgs.every((m) => m.imported_at !== null && m.service_revision === null && m.demanda_id === null)).toBe(true);
    expect(msgs[1].sent_via).toBe("external_device");

    const { rows: eventos } = await pool.query(
      "select count(*)::int as n from event_log where event_type like 'message.%' and payload->>'conversation_id'=$1",
      [r.conversation_id],
    );
    expect(eventos[0].n).toBe(0);

    const { rows: demandas } = await pool.query("select count(*)::int as n from demandas where contact_id=$1", [contact]);
    expect(demandas[0].n).toBe(0);

    const { rows: conv } = await pool.query(
      "select status, unread_count_for_assignee, awaiting_since, last_message_at, last_inbound_at, last_outbound_at, last_message_preview, service_closed_at from conversations where id=$1",
      [r.conversation_id],
    );
    expect(conv[0]).toMatchObject({ status: "closed", unread_count_for_assignee: 0, awaiting_since: null, last_message_preview: "Obrigada" });
    expect(new Date(conv[0].last_message_at).toISOString()).toBe("2026-07-01T12:10:00.000Z");
    expect(new Date(conv[0].last_outbound_at).toISOString()).toBe("2026-07-01T12:05:00.000Z");
    expect(new Date(conv[0].service_closed_at).toISOString()).toBe("2026-07-01T12:10:00.000Z");
  });

  it("re-entrega não duplica", async () => {
    const contact = await contatoNovo();
    const prefixo = `wamid.hist.${randomUUID()}`;
    await importar(contact, lote(prefixo));
    const r = await importar(contact, lote(prefixo));
    expect(r.inseridas).toBe(0);
    const { rows } = await pool.query("select count(*)::int as n from messages where conversation_id=$1", [r.conversation_id]);
    expect(rows[0].n).toBe(3);
  });

  it("a primeira mensagem AO VIVO depois do histórico reabre a conversa e abre demanda", async () => {
    const contact = await contatoNovo();
    const r = await importar(contact, lote(`wamid.hist.${randomUUID()}`));
    await pool.query(
      `insert into messages(id,organization_id,conversation_id,channel_session_id,contact_id,type,direction,status,body,sent_at)
       values($1,$2,$3,$4,$5,'text','inbound','delivered','Voltei',clock_timestamp())`,
      [randomUUID(), GOV_ORG, r.conversation_id, GOV_SESSION, contact],
    );
    const { rows: conv } = await pool.query("select status from conversations where id=$1", [r.conversation_id]);
    expect(conv[0].status).toBe("open");
    const { rows: demandas } = await pool.query("select count(*)::int as n from demandas where contact_id=$1", [contact]);
    expect(demandas[0].n).toBe(1);
    const { rows: eventos } = await pool.query(
      "select count(*)::int as n from event_log where event_type='message.received' and payload->>'conversation_id'=$1",
      [r.conversation_id],
    );
    expect(eventos[0].n).toBe(1);
  });

  it("conversa que já existe não anda para trás nem ganha não lidas", async () => {
    const contact = await contatoNovo();
    const conversation = randomUUID();
    await pool.query(
      `insert into conversations(id,organization_id,contact_id,channel_session_id,status,last_message_at,last_message_preview,unread_count_for_assignee)
       values($1,$2,$3,$4,'open','2026-10-15T10:00:00Z','Mensagem de hoje',2)`,
      [conversation, GOV_ORG, contact, GOV_SESSION],
    );
    const r = await importar(contact, lote(`wamid.hist.${randomUUID()}`));
    expect(r.conversation_id).toBe(conversation);
    const { rows } = await pool.query(
      "select status, last_message_at, last_message_preview, unread_count_for_assignee from conversations where id=$1",
      [conversation],
    );
    expect(rows[0]).toMatchObject({ status: "open", last_message_preview: "Mensagem de hoje", unread_count_for_assignee: 2 });
    expect(new Date(rows[0].last_message_at).toISOString()).toBe("2026-10-15T10:00:00.000Z");
  });

  it("contato de outra organização é recusado", async () => {
    const { rows } = await pool.query("select id from organizations where id<>$1 limit 1", [GOV_ORG]);
    const outra = rows[0]?.id as string | undefined;
    const contact = await contatoNovo();
    const org = outra ?? randomUUID();
    await expect(
      pool.query("select * from fn_importar_historico_da_conversa($1,$2,$3,$4::jsonb)", [org, GOV_SESSION, contact, "[]"]),
    ).rejects.toThrow(/historico_scope_mismatch/);
  });
});
