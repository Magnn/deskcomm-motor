/**
 * Migration 0911 — o banco segura as duas regras do Messenger direto, sem
 * depender do código:
 *
 *   1. sessão `meta_messenger` sem `messenger_page_id` não existe (ramo do
 *      `channel_sessions_provider_ref_check`);
 *   2. a mesma página ATIVA em duas organizações é recusada — o webhook é um só
 *      por app e acha a organização pela página, então duas linhas fariam a
 *      entrega cair na errada. Excluída (arquivada) não conta: reconectar em
 *      outra empresa depois de excluir é legítimo.
 */
import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

function novaOrg(slug: string): string {
  sql(`
    insert into public.organizations (slug, legal_name, display_name)
    values ('${slug}', 'inv 0911', 'inv 0911');
  `);
  return sql(`select id from public.organizations where slug = '${slug}'`).trim();
}

function insertPagina(org: string, cols: Record<string, string>): string {
  const nomes = ["organization_id", "webhook_secret_encrypted", "provider", "waha_session_name", ...Object.keys(cols)];
  const vals = [`'${org}'`, `'\\x00'::bytea`, `'meta_messenger'`, "null", ...Object.values(cols)];
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

describe("0911 · Messenger direto no banco", () => {
  it("sessão meta_messenger sem a página é RECUSADA", () => {
    const org = novaOrg(`inv-0911-a-${Date.now()}`);
    expect(erroDe(() => insertPagina(org, {}))).toMatch(/channel_sessions_provider_ref_check/);
  });

  it("a mesma página ativa em DUAS organizações é RECUSADA", () => {
    const pagina = `'pg-${Date.now()}'`;
    expect(insertPagina(novaOrg(`inv-0911-b1-${Date.now()}`), { messenger_page_id: pagina })).toContain("ok");
    const msg = erroDe(() => insertPagina(novaOrg(`inv-0911-b2-${Date.now()}`), { messenger_page_id: pagina }));
    expect(msg).toMatch(/channel_sessions_messenger_page_id_ativo_unique/);
  });

  it("página EXCLUÍDA numa organização pode ser conectada em outra", () => {
    const pagina = `'pg-arq-${Date.now()}'`;
    insertPagina(novaOrg(`inv-0911-c1-${Date.now()}`), { messenger_page_id: pagina, archived_at: "now()" });
    expect(insertPagina(novaOrg(`inv-0911-c2-${Date.now()}`), { messenger_page_id: pagina })).toContain("ok");
  });

  it("o arquivo do webhook aceita o provider (senão o corpo cru é perdido)", () => {
    const def = sql(`select pg_get_constraintdef(oid) from pg_constraint
                      where conrelid = 'public.webhook_events_log'::regclass
                        and conname = 'webhook_events_log_provider_check'`);
    expect(def).toContain("meta_messenger");
  });
});
