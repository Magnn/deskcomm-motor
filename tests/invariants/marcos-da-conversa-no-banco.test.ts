/**
 * Migration 0913 — o banco segura as regras dos marcos da conversa:
 *   1. um marco por mensagem e tipo (a rotina pode repassar sem duplicar);
 *   2. tipo fora do vocabulário é recusado;
 *   3. apagar a MENSAGEM apaga o marco (o texto não é copiado — LGPD);
 *   4. o cursor da rotina (`watchdog_cursors`) aceita a gravação do servidor.
 */
import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

function cenario(): { org: string; conversa: string; mensagem: string } {
  const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  sql(`insert into public.organizations (slug, legal_name, display_name) values ('inv-0913-${sufixo}', 'inv 0913', 'inv 0913');`);
  const org = sql(`select id from public.organizations where slug = 'inv-0913-${sufixo}'`).trim();
  const pegar = (comando: string) => sql(comando).trim().split("\n")[0]!;
  const sessao = pegar(
    `insert into public.channel_sessions (organization_id, waha_session_name, webhook_secret_encrypted) values ('${org}', 'inv-0913-${sufixo}', '\\x00'::bytea) returning id;`,
  );
  const contato = pegar(`insert into public.contacts (organization_id, display_name) values ('${org}', 'Inv 0913') returning id;`);
  const conversa = pegar(
    `insert into public.conversations (organization_id, contact_id, channel_session_id, status) values ('${org}', '${contato}', '${sessao}', 'open') returning id;`,
  );
  const mensagem = pegar(
    `insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, status, sent_via, body)
       values ('${org}', '${conversa}', '${sessao}', '${contato}', 'text', 'outbound', 'sent', 'ai', 'R$ 10') returning id;`,
  );
  return { org, conversa, mensagem };
}

const marco = (c: { org: string; conversa: string; mensagem: string }, kind: string) =>
  `insert into public.conversation_milestones (organization_id, conversation_id, message_id, kind, occurred_at) values ('${c.org}', '${c.conversa}', '${c.mensagem}', '${kind}', now());`;

function erroDe(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    return String(err.stderr ?? "") + String(err.message ?? "");
  }
  throw new Error("o comando passou — a trava não existe neste banco");
}

describe("0913 · marcos da conversa no banco", () => {
  it("um marco por mensagem e tipo; o segundo é RECUSADO", () => {
    const c = cenario();
    sql(marco(c, "oferta_apresentada"));
    expect(erroDe(() => sql(marco(c, "oferta_apresentada")))).toMatch(/conversation_milestones_mensagem_tipo_uk/);
  });

  it("tipo fora do vocabulário é RECUSADO", () => {
    expect(erroDe(() => sql(marco(cenario(), "palpite")))).toMatch(/conversation_milestones_kind_conhecido/);
  });

  it("apagar a mensagem apaga o marco", () => {
    const c = cenario();
    sql(marco(c, "oferta_apresentada"));
    sql(`delete from public.messages where id = '${c.mensagem}';`);
    expect(sql(`select count(*) from public.conversation_milestones where message_id = '${c.mensagem}'`).trim()).toBe("0");
  });

  it("o cursor da rotina é gravável pelo servidor", () => {
    sql(`set role service_role;
         insert into public.watchdog_cursors (consumer, last_created_at) values ('marcos_da_conversa', now())
           on conflict (consumer) do update set last_created_at = excluded.last_created_at;
         reset role;`);
    expect(sql(`select count(*) from public.watchdog_cursors where consumer = 'marcos_da_conversa'`).trim()).toBe("1");
  });
});
