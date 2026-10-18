import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { motivoDoErro, sql } from "./psql-transporte";

const ORG_A = "93500000-0000-4000-8000-00000000000a";
const ORG_B = "93500000-0000-4000-8000-00000000000b";

beforeEach(() => {
  sql(`delete from public.organizations where id in ('${ORG_A}', '${ORG_B}');
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'stripe-connect-inv-a', 'Connect A', 'Connect A'),
      ('${ORG_B}', 'stripe-connect-inv-b', 'Connect B', 'Connect B');
    insert into public.payment_gateway_connections (organization_id, provider, stripe_account_id, stripe_connect_webhook_secret_encrypted)
    values ('${ORG_A}', 'stripe', 'acct_invarianteA', 'segredo_cifrado_a'),
      ('${ORG_B}', 'stripe', 'acct_invarianteB', 'segredo_cifrado_b');`);
});

describe("Stripe Connect no banco real", () => {
  it("a migration reaplica sem mudar as conexões de duas organizações", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20261017230000_0935_stripe_connect.sql"),
      "utf8",
    );
    sql(migration);
    sql(migration);
    expect(
      sql(`select stripe_account_id || ':' || stripe_pronta::text from public.payment_gateway_connections
      where organization_id = '${ORG_A}' and provider = 'stripe'`),
    ).toBe("acct_invarianteA:false");
    expect(
      sql(`select stripe_connect_webhook_secret_encrypted from public.payment_gateway_connections
      where organization_id = '${ORG_B}' and provider = 'stripe'`),
    ).toBe("segredo_cifrado_b");
  });

  it("a mesma conta não pode ser ligada a outra organização", () => {
    let erro: string | null = null;
    try {
      sql(
        `update public.payment_gateway_connections set stripe_account_id = 'acct_invarianteA' where organization_id = '${ORG_B}' and provider = 'stripe'`,
      );
    } catch (err) {
      erro = motivoDoErro(err);
    }
    expect(erro).toContain("payment_gateway_connections_stripe_account_uk");
    expect(
      sql(
        `select stripe_account_id from public.payment_gateway_connections where organization_id = '${ORG_B}' and provider = 'stripe'`,
      ),
    ).toBe("acct_invarianteB");
  });

  it.each(["anon", "authenticated"])("%s não lê as contas nem os segredos cifrados", (papel) => {
    expect(
      sql(
        `select has_table_privilege('${papel}', 'public.payment_gateway_connections', 'SELECT')::text`,
      ),
    ).toBe("false");
    let erro: string | null = null;
    try {
      sql(
        `set role ${papel}; select stripe_account_id, stripe_connect_webhook_secret_encrypted from public.payment_gateway_connections; reset role;`,
      );
    } catch (err) {
      erro = motivoDoErro(err);
    }
    expect(erro).toContain("permission denied");
  });
});
