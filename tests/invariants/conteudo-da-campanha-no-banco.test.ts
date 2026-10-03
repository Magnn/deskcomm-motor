/**
 * Migration 0915 — o conteúdo da campanha no banco, e as colunas que o código lê.
 *
 * Duas provas:
 *   1. o banco recusa tipo de conteúdo fora do vocabulário e modelo sem idioma, e
 *      apagar o fluxo NÃO apaga a campanha (volta a "sem fluxo");
 *   2. os `select` EXATOS das leituras de campanha existem no schema real — os
 *      testes unitários rodam num banco em memória que aceita qualquer coluna, e
 *      foi assim que uma leitura de coluna inexistente chegou à produção na 0913.
 */
import { describe, expect, it } from "vitest";

import { COLUNAS_DE_CONTEUDO } from "@/lib/campanhas/conteudo";

import { sql } from "./gov-helpers";

function cenario(): { org: string; sessao: string } {
  const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  sql(`insert into public.organizations (slug, legal_name, display_name) values ('inv-0915-${sufixo}', 'inv 0915', 'inv 0915');`);
  const org = sql(`select id from public.organizations where slug = 'inv-0915-${sufixo}'`).trim();
  const sessao = sql(
    `insert into public.channel_sessions (organization_id, waha_session_name, webhook_secret_encrypted) values ('${org}', 'inv-0915-${sufixo}', '\\x00'::bytea) returning id;`,
  ).trim().split("\n")[0]!;
  return { org, sessao };
}

const campanha = (c: { org: string; sessao: string }, extra: string, valores: string) =>
  `insert into public.campaigns (organization_id, name, channel_session_id, base_legal${extra}) values ('${c.org}', 'inv', '${c.sessao}', 'consent'${valores}) returning id;`;

function erroDe(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    return String(err.stderr ?? "") + String(err.message ?? "");
  }
  throw new Error("o comando passou — a trava não existe neste banco");
}

describe("0915 · conteúdo da campanha no banco", () => {
  it("campanha criada sem dizer o tipo é de TEXTO — nada muda para quem já usava", () => {
    const id = sql(campanha(cenario(), "", "")).trim().split("\n")[0]!;
    expect(sql(`select content_kind from public.campaigns where id = '${id}'`).trim()).toBe("text");
  });

  it("tipo fora do vocabulário e modelo sem idioma são RECUSADOS", () => {
    expect(erroDe(() => sql(campanha(cenario(), ", content_kind", ", 'video'")))).toMatch(/campaigns_content_kind_conhecido/);
    expect(erroDe(() => sql(campanha(cenario(), ", content_kind, template_name", ", 'template', 'promo'")))).toMatch(/campaigns_template_com_idioma/);
  });

  it("apagar o fluxo não apaga a campanha: ela fica sem fluxo", () => {
    const c = cenario();
    const fluxo = sql(`insert into public.followup_flow_pointers (organization_id, name) values ('${c.org}', 'inv fluxo') returning id;`).trim().split("\n")[0]!;
    const id = sql(campanha(c, ", content_kind, flow_pointer_id", `, 'flow', '${fluxo}'`)).trim().split("\n")[0]!;
    sql(`delete from public.followup_flow_pointers where id = '${fluxo}';`);
    expect(sql(`select coalesce(flow_pointer_id::text, 'nulo') from public.campaigns where id = '${id}'`).trim()).toBe("nulo");
  });
});

describe("as leituras de campanha usam colunas que existem", () => {
  const LEITURAS: Record<string, string> = {
    "conteúdo (rodada, ações e rota)": `select ${COLUNAS_DE_CONTEUDO}, message_body, content_version from public.campaigns`,
    "fluxo da campanha": "select id, name, status, active_version_id, surface, organization_id from public.followup_flow_pointers",
    "números do pool e o que sabem enviar": "select id, provider, display_name, organization_id from public.channel_sessions",
    "números extras": "select channel_session_id, organization_id, campaign_id from public.campaign_channel_sessions",
    "desfecho do destinatário": "select status, sent_at, last_error_code, last_error_detail, message_id, conversation_id, channel_session_id from public.campaign_recipients",
  };

  it.each(Object.entries(LEITURAS))("%s", (_nome, consulta) => {
    expect(() => sql(`${consulta} limit 0;`)).not.toThrow();
  });
});
