/**
 * Migration 0914 — o banco segura as regras do motivo da perda:
 *   1. uma linha por conversa;
 *   2. motivo e origem fora do vocabulário são recusados, e confiança fora de 0–100;
 *   3. apagar a CONVERSA apaga o motivo (nada sobra depois do apagamento).
 */
import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

function cenario(): { org: string; conversa: string } {
  const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  sql(`insert into public.organizations (slug, legal_name, display_name) values ('inv-0914-${sufixo}', 'inv 0914', 'inv 0914');`);
  const org = sql(`select id from public.organizations where slug = 'inv-0914-${sufixo}'`).trim();
  const pegar = (comando: string) => sql(comando).trim().split("\n")[0]!;
  const sessao = pegar(
    `insert into public.channel_sessions (organization_id, waha_session_name, webhook_secret_encrypted) values ('${org}', 'inv-0914-${sufixo}', '\\x00'::bytea) returning id;`,
  );
  const contato = pegar(`insert into public.contacts (organization_id, display_name) values ('${org}', 'Inv 0914') returning id;`);
  const conversa = pegar(
    `insert into public.conversations (organization_id, contact_id, channel_session_id, status) values ('${org}', '${contato}', '${sessao}', 'open') returning id;`,
  );
  return { org, conversa };
}

const linha = (c: { org: string; conversa: string }, reason: string, source: string, confidence: string) =>
  `insert into public.conversation_loss_reasons (organization_id, conversation_id, reason, source, confidence) values ('${c.org}', '${c.conversa}', '${reason}', '${source}', ${confidence});`;

function erroDe(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    return String(err.stderr ?? "") + String(err.message ?? "");
  }
  throw new Error("o comando passou — a trava não existe neste banco");
}

describe("0914 · motivo da perda no banco", () => {
  it("uma linha por conversa; a segunda é RECUSADA", () => {
    const c = cenario();
    sql(linha(c, "preco", "ia", "80"));
    expect(erroDe(() => sql(linha(c, "timing", "ia", "70")))).toMatch(/conversation_loss_reasons_conversa_uk/);
  });

  it("motivo, origem e confiança fora do vocabulário são RECUSADOS", () => {
    expect(erroDe(() => sql(linha(cenario(), "palpite", "ia", "80")))).toMatch(/conversation_loss_reasons_reason_conhecido/);
    expect(erroDe(() => sql(linha(cenario(), "preco", "achismo", "80")))).toMatch(/conversation_loss_reasons_source_conhecida/);
    expect(erroDe(() => sql(linha(cenario(), "preco", "ia", "140")))).toMatch(/conversation_loss_reasons_confidence_valida/);
  });

  it("apagar a conversa apaga o motivo", () => {
    const c = cenario();
    sql(linha(c, "sem_resposta", "regra", "100"));
    sql(`delete from public.conversations where id = '${c.conversa}';`);
    expect(sql(`select count(*) from public.conversation_loss_reasons where conversation_id = '${c.conversa}'`).trim()).toBe("0");
  });
});
