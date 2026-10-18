import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { STRIPE_CONNECT_TAXA_CENTAVOS: 99 } }));
vi.mock("@/lib/planos/stripe-dos-planos", () => ({
  configuracaoDaStripeDosPlanos: () => ({ chave: "sk_plataforma" }),
}));
vi.mock("@/lib/webhooks/secrets", () => ({
  decryptWebhookSecret: async (_: unknown, texto: string) => texto.replace("cifrada:", ""),
}));

import {
  lerConexaoStripe,
  lerConexaoStripePorConta,
  lerConexaoStripePorId,
} from "./conexao-stripe";

const filtros = vi.fn();
let linha: Record<string, unknown>;
function banco() {
  const query = {
    select: () => query,
    eq: (campo: string, valor: string) => {
      filtros(campo, valor);
      return query;
    },
    maybeSingle: async () => ({ data: linha, error: null }),
  };
  return { from: () => query } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  linha = {
    id: "con-1",
    organization_id: "org-1",
    enabled: true,
    stripe_account_id: "acct_empresa",
    stripe_pronta: true,
    api_key_encrypted: "cifrada:sk_antiga",
    webhook_secret_encrypted: "cifrada:whsec_antigo",
  };
});

describe("credencial da cobrança e credencial do aviso são da mesma conta", () => {
  it("novas cobranças usam a conta conectada com a taxa, filtrada por organização", async () => {
    expect(await lerConexaoStripe(banco(), "org-1")).toMatchObject({
      chave: "sk_plataforma",
      conta: "acct_empresa",
      taxaCentavos: 99,
    });
    expect(filtros).toHaveBeenCalledWith("organization_id", "org-1");
  });

  it("a pausa impede novas cobranças", async () => {
    linha.enabled = false;
    expect(await lerConexaoStripe(banco(), "org-1")).toBeNull();
  });

  it("aviso antigo usa a chave antiga mesmo depois de migrar para Connect e pausar", async () => {
    linha.enabled = false;
    const conexao = await lerConexaoStripePorId(banco(), "con-1");
    expect(conexao).toMatchObject({ chave: "sk_antiga", segredoDoAviso: "whsec_antigo" });
    expect(conexao?.conta).toBeUndefined();
    expect(filtros).toHaveBeenCalledWith("id", "con-1");
  });

  it("pagamento conectado continua entrando com a conexão pausada e a conta restrita", async () => {
    linha.enabled = false;
    linha.stripe_pronta = false;
    expect(await lerConexaoStripePorConta(banco(), "acct_empresa")).toMatchObject({
      chave: "sk_plataforma",
      conta: "acct_empresa",
    });
    expect(filtros).toHaveBeenCalledWith("stripe_account_id", "acct_empresa");
  });

  it("aviso conectado nunca cai na chave antiga", async () => {
    linha.stripe_account_id = null;
    expect(await lerConexaoStripePorConta(banco(), "acct_empresa")).toBeNull();
  });
});
