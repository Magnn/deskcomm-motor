/**
 * Migration 0912 — o banco segura as regras do Telegram sem depender do código:
 *   1. sessão `telegram_bot` sem `telegram_bot_id` não existe;
 *   2. o mesmo bot ATIVO em duas organizações é recusado (um bot tem um webhook:
 *      a segunda conexão roubaria a entrega da primeira); excluído não conta;
 *   3. a conversa aceita o canal 'telegram' (sem ele, todo aviso seria 23514).
 */
import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

function novaOrg(slug: string): string {
  sql(`
    insert into public.organizations (slug, legal_name, display_name)
    values ('${slug}', 'inv 0912', 'inv 0912');
  `);
  return sql(`select id from public.organizations where slug = '${slug}'`).trim();
}

function insertBot(org: string, cols: Record<string, string>): string {
  const nomes = ["organization_id", "webhook_secret_encrypted", "provider", "waha_session_name", ...Object.keys(cols)];
  const vals = [`'${org}'`, `'\\x00'::bytea`, `'telegram_bot'`, "null", ...Object.values(cols)];
  return sql(`
    insert into public.channel_sessions (${nomes.join(", ")})
    values (${vals.join(", ")});
    select 'ok';
  `);
}

function erroDe(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    return String(err.stderr ?? "") + String(err.message ?? "");
  }
  throw new Error("o INSERT passou — a trava não existe neste banco");
}

describe("0912 · Telegram no banco", () => {
  it("sessão telegram_bot sem o bot é RECUSADA", () => {
    const org = novaOrg(`inv-0912-a-${Date.now()}`);
    expect(erroDe(() => insertBot(org, {}))).toMatch(/channel_sessions_provider_ref_check/);
  });

  it("o mesmo bot ativo em DUAS organizações é RECUSADO", () => {
    const bot = `'${Date.now()}'`;
    expect(insertBot(novaOrg(`inv-0912-b1-${Date.now()}`), { telegram_bot_id: bot })).toContain("ok");
    const msg = erroDe(() => insertBot(novaOrg(`inv-0912-b2-${Date.now()}`), { telegram_bot_id: bot }));
    expect(msg).toMatch(/channel_sessions_telegram_bot_id_ativo_unique/);
  });

  it("bot EXCLUÍDO numa organização pode ser conectado em outra", () => {
    const bot = `'arq${Date.now()}'`;
    insertBot(novaOrg(`inv-0912-c1-${Date.now()}`), { telegram_bot_id: bot, archived_at: "now()" });
    expect(insertBot(novaOrg(`inv-0912-c2-${Date.now()}`), { telegram_bot_id: bot })).toContain("ok");
  });

  it("a conversa aceita o canal telegram e o arquivo do webhook aceita o provider", () => {
    const canal = sql(`select pg_get_constraintdef(oid) from pg_constraint
                        where conrelid = 'public.conversations'::regclass and conname = 'conversations_channel_check'`);
    expect(canal).toContain("telegram");
    const arquivo = sql(`select pg_get_constraintdef(oid) from pg_constraint
                          where conrelid = 'public.webhook_events_log'::regclass and conname = 'webhook_events_log_provider_check'`);
    expect(arquivo).toContain("telegram_bot");
  });
});
