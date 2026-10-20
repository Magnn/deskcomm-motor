/**
 * Quem veio pela página de um anúncio da Meta (origem `site` + `fbclid`) tem atribuição — medido em 20/10/2026: as
 * vendas da página de pré-venda eram puladas sem registro e o Gerenciador não marcava nenhuma.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { lerAtribuicao } from "./leitura-da-atribuicao";

function admin(linha: { phone_number: string | null; source_metadata: unknown } | null): SupabaseClient {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: async () => ({ data: linha, error: null }),
  };
  return { from: () => consulta } as unknown as SupabaseClient;
}

describe("lerAtribuicao", () => {
  it("⭐ veio da página com fbclid: é clique da Meta, com o telefone em dígitos", async () => {
    const r = await lerAtribuicao(
      admin({ phone_number: "+55 66 99939-4450", source_metadata: { origem: "site", ad_platform: "site", fbclid: "PAZXh0bgN", utm_source: "facebook" } }),
      "org",
      "contato",
    );
    expect(r).toEqual({ temAtribuicao: true, atribuicao: { plataforma: "meta_ads", cliqueDeOrigem: "PAZXh0bgN", telefone: "5566999394450" } });
  });

  it("clique de mensageria (ctwa) continua mandando, mesmo com fbclid junto", async () => {
    const r = await lerAtribuicao(
      admin({ phone_number: "5511999990000", source_metadata: { ad_platform: "meta_ads", ad_source_id: "ctwa-1", fbclid: "x" } }),
      "org",
      "contato",
    );
    expect(r).toMatchObject({ temAtribuicao: true, atribuicao: { cliqueDeOrigem: "ctwa-1", plataforma: "meta_ads" } });
  });

  it("sem clique nenhum (contato orgânico): sem atribuição, como antes", async () => {
    const r = await lerAtribuicao(admin({ phone_number: "5511999990000", source_metadata: { origem: "site" } }), "org", "contato");
    expect(r).toEqual({ temAtribuicao: false, motivo: "sem_atribuicao" });
  });
});
