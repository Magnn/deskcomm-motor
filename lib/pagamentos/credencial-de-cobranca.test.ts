import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const decifrar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/webhooks/secrets", () => ({ decryptWebhookSecret: decifrar }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { lerCredencialDeCobranca } from "./credencial-de-cobranca";

function admin(resposta: { data: unknown; error?: { message: string } | null }) {
  const filtros: Array<[string, unknown]> = [];
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (filtros.push([c, v]), q),
    maybeSingle: async () => ({ data: resposta.data, error: resposta.error ?? null }),
  };
  return { client: { from: () => q } as unknown as SupabaseClient, filtros };
}

beforeEach(() => decifrar.mockReset().mockResolvedValue("chave-decifrada"));

describe("lerCredencialDeCobranca", () => {
  it("conexão ativa: devolve a chave decifrada e o ambiente", async () => {
    const { client } = admin({ data: { api_key_encrypted: "cifrado", environment: "sandbox", enabled: true } });
    expect(await lerCredencialDeCobranca(client, "org-1")).toEqual({ ok: true, credencial: { apiKey: "chave-decifrada", ambiente: "sandbox" } });
  });

  it("filtra SEMPRE por organização e provedor (o client é service-role e ignora RLS)", async () => {
    const { client, filtros } = admin({ data: null });
    await lerCredencialDeCobranca(client, "org-7");
    expect(filtros).toEqual([
      ["organization_id", "org-7"],
      ["provider", "asaas"],
    ]);
  });

  it.each([
    ["nunca conectou", { data: null }, "sem_conexao"],
    ["erro de leitura", { data: null, error: { message: "boom" } }, "sem_conexao"],
    ["pausada", { data: { api_key_encrypted: "x", environment: "production", enabled: false } }, "conexao_desabilitada"],
    ["sem chave gravada", { data: { api_key_encrypted: null, environment: "production", enabled: true } }, "credencial_incompleta"],
  ])("%s → %s, e nada é decifrado sem necessidade", async (_t, resposta, motivo) => {
    const { client } = admin(resposta as never);
    expect(await lerCredencialDeCobranca(client, "org-1")).toEqual({ ok: false, motivo });
    expect(decifrar).not.toHaveBeenCalled();
  });

  it("instalação sem a chave mestra: motivo de INSTALAÇÃO, não de cadastro", async () => {
    decifrar.mockResolvedValueOnce(null);
    const { client } = admin({ data: { api_key_encrypted: "x", environment: "production", enabled: true } });
    expect(await lerCredencialDeCobranca(client, "org-1")).toEqual({ ok: false, motivo: "cifra_indisponivel" });
  });

  it("ambiente desconhecido no banco cai em produção só se não for sandbox — nunca inventa um terceiro", async () => {
    const { client } = admin({ data: { api_key_encrypted: "x", environment: "qualquer", enabled: true } });
    const r = await lerCredencialDeCobranca(client, "org-1");
    expect(r).toMatchObject({ ok: true, credencial: { ambiente: "production" } });
  });
});
