/**
 * O LEDGER FINANCEIRO IMUTÁVEL (migration 0401) — contra o banco de verdade.
 *
 * Três garantias que só existem no Postgres, nenhuma delas em teste unitário
 * (que só exercita a função pura de mapeamento e a chamada mockada):
 *
 *  1. **Isolamento entre organizações.** `revenue_ledger` guarda valor e
 *     provedor de cada compra — vazar leitura aqui é vazar faturamento de um
 *     cliente para outro.
 *  2. **Dedupe de BANCO**, não de aplicação. A chave é
 *     `(organization_id, provider, event_type, external_event_id)`: a MESMA
 *     reentrega do webhook colide (`23505`); um evento de TIPO diferente para
 *     o mesmo pedido (ex.: `refund` depois do `charge`) não é bloqueado como
 *     duplicata.
 *  3. **Append-only nos DOIS níveis, sob o default ACL real do Supabase** —
 *     mesmo molde da migration 0258 para `api_audit_log`. Todo projeto
 *     Supabase nasce com UPDATE/DELETE/TRUNCATE concedidos a
 *     `anon`/`authenticated`/`service_role` por default, e `service_role`
 *     ignora RLS — sem o `revoke` explícito do apêndice, a service key que o
 *     webhook já usa poderia apagar ou reescrever um fato financeiro direto
 *     pela REST.
 *
 * Roda contra o Postgres nascido do `baseline.sql` (o que o self-hoster
 * aplica), via `scripts/test-db.sh` (`pnpm test:db`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { motivoDoErro, sql } from "./psql-transporte";

const ORG_A = "40100000-0000-4000-8000-00000000000a";
const ORG_B = "40100000-0000-4000-8000-00000000000b";
const USER_A = "40101000-0000-4000-8000-00000000000a";
const USER_B = "40101000-0000-4000-8000-00000000000b";

function semear(): void {
  sql(`
    delete from public.revenue_ledger where organization_id in ('${ORG_A}','${ORG_B}');
    delete from public.user_organizations where user_id in ('${USER_A}','${USER_B}');
    delete from auth.users where id in ('${USER_A}','${USER_B}');
    delete from public.organizations where id in ('${ORG_A}','${ORG_B}');

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'inv-0401-a', 'Invariante 0401 A LTDA', 'Invariante 0401 A'),
      ('${ORG_B}', 'inv-0401-b', 'Invariante 0401 B LTDA', 'Invariante 0401 B');
    insert into auth.users (id, email) values
      ('${USER_A}', 'ledger-a@invariant.test'),
      ('${USER_B}', 'ledger-b@invariant.test');
    insert into public.user_organizations (user_id, organization_id, role) values
      ('${USER_A}', '${ORG_A}', 'admin'),
      ('${USER_B}', '${ORG_B}', 'admin');

    insert into public.revenue_ledger
      (organization_id, event_type, amount_cents, provider, external_event_id, metadata)
      values
      ('${ORG_A}', 'charge', 5070, 'cakto', 'inv-0401-pedido-a', '{}'::jsonb),
      ('${ORG_B}', 'charge', 9700, 'cakto', 'inv-0401-pedido-b', '{}'::jsonb);
  `);
}

/** Lê a tabela COMO o usuário, pelo mesmo caminho que a produção usa (RLS + JWT). */
function pedidosVistosPor(userId: string): string {
  const out = sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    select coalesce(string_agg(external_event_id, ',' order by external_event_id), '(nada)')
      from public.revenue_ledger
      where organization_id in ('${ORG_A}', '${ORG_B}');
  `);
  return out.split("\n").at(-1) ?? "";
}

describe("revenue_ledger — isolamento entre organizações", () => {
  beforeEach(semear);

  it("a fixture existe antes de qualquer conclusão (controle positivo)", () => {
    // Sem isto, uma fixture que falhou deixa a tabela vazia e "não vazou" fica
    // indistinguível de "não havia nada para vazar".
    expect(
      sql(`select count(*) from public.revenue_ledger where organization_id in ('${ORG_A}','${ORG_B}')`),
    ).toBe("2");
  });

  it("cada organização enxerga só o próprio fato de receita", () => {
    expect(pedidosVistosPor(USER_A)).toBe("inv-0401-pedido-a");
    expect(pedidosVistosPor(USER_B)).toBe("inv-0401-pedido-b");
  });

  it("gravar pela sessão de um usuário é barrado — não há policy de INSERT nenhuma (só o webhook, via service_role, escreve)", () => {
    let erro = "";
    try {
      sql(`
        set role authenticated;
        select set_config('request.jwt.claims', '{"sub":"${USER_A}"}', false);
        insert into public.revenue_ledger (organization_id, event_type, amount_cents, provider, external_event_id)
        values ('${ORG_A}', 'charge', 100, 'cakto', 'inv-0401-invasor');
      `);
    } catch (e) {
      erro = motivoDoErro(e);
    }
    // A mensagem é de GRANT, não de RLS: authenticated perde o INSERT no
    // próprio grant (não é "existe policy e ela recusa" — é "não há privilégio
    // de escrita nenhum"), desenho deliberado da 0401 (ver seu cabeçalho).
    expect(erro).toMatch(/permission denied/i);
    expect(
      sql(`select count(*) from public.revenue_ledger where external_event_id = 'inv-0401-invasor'`),
    ).toBe("0");
  });
});

describe("revenue_ledger — dedupe por (organização, provedor, tipo, id externo)", () => {
  beforeEach(semear);

  it("a MESMA reentrega do MESMO fato colide (23505) — não duplica", () => {
    let erro = "";
    try {
      sql(`
        insert into public.revenue_ledger (organization_id, event_type, amount_cents, provider, external_event_id)
        values ('${ORG_A}', 'charge', 5070, 'cakto', 'inv-0401-pedido-a');
      `);
    } catch (e) {
      erro = motivoDoErro(e);
    }
    expect(erro).toMatch(/duplicate key|revenue_ledger_dedupe_key/i);
    expect(
      sql(
        `select count(*) from public.revenue_ledger where organization_id = '${ORG_A}' and external_event_id = 'inv-0401-pedido-a'`,
      ),
    ).toBe("1");
  });

  it("um REFUND para o MESMO pedido do charge não é barrado como duplicata — o TIPO entra na chave", () => {
    sql(`
      insert into public.revenue_ledger (organization_id, event_type, amount_cents, provider, external_event_id)
      values ('${ORG_A}', 'refund', 5070, 'cakto', 'inv-0401-pedido-a');
    `);
    expect(
      sql(
        `select count(*) from public.revenue_ledger where organization_id = '${ORG_A}' and external_event_id = 'inv-0401-pedido-a'`,
      ),
    ).toBe("2");
  });

  it("a mesma chave em organizações DIFERENTES não colide — dedupe é por tenant", () => {
    sql(`
      insert into public.revenue_ledger (organization_id, event_type, amount_cents, provider, external_event_id)
      values ('${ORG_B}', 'charge', 5070, 'cakto', 'inv-0401-pedido-a');
    `);
    expect(
      sql(`select count(*) from public.revenue_ledger where external_event_id = 'inv-0401-pedido-a'`),
    ).toBe("2");
  });
});

describe("revenue_ledger — o valor obedece ao tipo", () => {
  beforeEach(semear);

  it("charge/refund/chargeback exigem magnitude positiva (zero é recusado)", () => {
    let erro = "";
    try {
      sql(`
        insert into public.revenue_ledger (organization_id, event_type, amount_cents, provider, external_event_id)
        values ('${ORG_A}', 'charge', 0, 'cakto', 'inv-0401-valor-zero');
      `);
    } catch (e) {
      erro = motivoDoErro(e);
    }
    expect(erro).toMatch(/revenue_ledger_valor_por_tipo/);
  });

  it("adjustment aceita negativo (débito), mas não zero", () => {
    sql(`
      insert into public.revenue_ledger (organization_id, event_type, amount_cents, provider, external_event_id)
      values ('${ORG_A}', 'adjustment', -500, 'cakto', 'inv-0401-ajuste-debito');
    `);
    expect(
      sql(`select amount_cents from public.revenue_ledger where external_event_id = 'inv-0401-ajuste-debito'`),
    ).toBe("-500");

    let erro = "";
    try {
      sql(`
        insert into public.revenue_ledger (organization_id, event_type, amount_cents, provider, external_event_id)
        values ('${ORG_A}', 'adjustment', 0, 'cakto', 'inv-0401-ajuste-zero');
      `);
    } catch (e) {
      erro = motivoDoErro(e);
    }
    expect(erro).toMatch(/revenue_ledger_valor_por_tipo/);
  });
});

describe("revenue_ledger sob o default ACL de tabelas do Supabase (mesmo molde da migration 0258)", () => {
  const BASELINE = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");
  const ROTULO = "-- ---- o ledger financeiro imutável (migration 0401) ----";

  /**
   * O bloco rotulado da 0401, do rótulo até o próximo rótulo de apêndice — ou
   * até o FIM DO ARQUIVO quando não houver um próximo. A 0401 é, hoje, o
   * ÚLTIMO bloco do apêndice (`baseline.sql` termina com `notify pgrst,
   * 'reload schema';` desta migration), e `-1` ali significa "não há próximo
   * rótulo", não "o bloco está corrompido" — tratar os dois casos igual faria
   * este teste quebrar sozinho no dia em que alguém acrescentasse o PRÓXIMO
   * apêndice depois do meu, sem eu ter mudado nada.
   */
  function blocoDa0401(): string {
    const inicio = BASELINE.indexOf(ROTULO);
    if (inicio === -1) throw new Error("rótulo da 0401 não encontrado no baseline");
    if (BASELINE.indexOf(ROTULO, inicio + 1) !== -1) throw new Error("rótulo da 0401 repetido no baseline");
    const proximoRotulo = BASELINE.indexOf("\n-- ---- ", inicio + ROTULO.length);
    const fim = proximoRotulo === -1 ? BASELINE.length : proximoRotulo;
    return BASELINE.slice(inicio, fim);
  }

  const DEFAULT_ACL_DO_SUPABASE =
    "grant all on table public.revenue_ledger to anon, authenticated, service_role;";
  const MARCA = "SONDA|";
  const ORG_ACL = "40199999-0000-4000-8000-000000000001";
  const LINHA_BASE = `
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG_ACL}', 'inv-0401-acl', 'Inv 0401 ACL', 'Inv 0401 ACL')
      on conflict (id) do nothing;
    insert into public.revenue_ledger (organization_id, event_type, amount_cents, provider, external_event_id)
      values ('${ORG_ACL}', 'charge', 100, 'cakto', 'inv-0401-acl-linha');
  `;

  function sondasDesfeitas(corpo: string): string[] {
    return sql(`begin;\n${corpo}\nrollback;`)
      .split("\n")
      .filter((linha) => linha.startsWith(MARCA))
      .map((linha) => linha.slice(MARCA.length));
  }

  it("controle: SEM o bloco da 0401, a simulação reproduz o defeito (service_role apaga)", () => {
    const [apagadas] = sondasDesfeitas(`
      ${LINHA_BASE}
      ${DEFAULT_ACL_DO_SUPABASE}
      set local role service_role;
      with d as (delete from public.revenue_ledger where organization_id = '${ORG_ACL}' returning 1)
      select '${MARCA}' || count(*) from d;
    `);
    expect(
      apagadas,
      "a simulação não reproduz o Supabase — sem o bloco da 0401, service_role já deveria apagar",
    ).toBe("1");
  });

  for (const [comando, dml] of [
    ["DELETE", `delete from public.revenue_ledger where organization_id = '${ORG_ACL}'`],
    ["UPDATE", `update public.revenue_ledger set amount_cents = 999999 where organization_id = '${ORG_ACL}'`],
    ["TRUNCATE", "truncate public.revenue_ledger"],
  ] as const) {
    it(`service_role recebe permission denied no ${comando}, com o bloco da 0401 reaplicado sobre o default ACL`, () => {
      let erro: string | null = null;
      try {
        sql(`
          begin;
          ${LINHA_BASE}
          ${DEFAULT_ACL_DO_SUPABASE}
          ${blocoDa0401()}
          set local role service_role;
          ${dml};
          rollback;
        `);
      } catch (e) {
        erro = motivoDoErro(e);
      }
      expect(erro, `service_role executou ${comando} em revenue_ledger SEM erro`).not.toBeNull();
      expect(erro).toContain("permission denied for table revenue_ledger");
    });
  }

  it("INSERT e SELECT seguem de pé para service_role — o revoke não é largo demais (a auditoria não morre)", () => {
    const [inseridas] = sondasDesfeitas(`
      insert into public.organizations (id, slug, legal_name, display_name)
        values ('${ORG_ACL}', 'inv-0401-acl', 'Inv 0401 ACL', 'Inv 0401 ACL')
        on conflict (id) do nothing;
      ${DEFAULT_ACL_DO_SUPABASE}
      ${blocoDa0401()}
      set local role service_role;
      insert into public.revenue_ledger (organization_id, event_type, amount_cents, provider, external_event_id)
        values ('${ORG_ACL}', 'charge', 100, 'cakto', 'inv-0401-acl-insert');
      select '${MARCA}' || count(*) from public.revenue_ledger where organization_id = '${ORG_ACL}';
    `);
    expect(inseridas).toBe("1");
  });
});
