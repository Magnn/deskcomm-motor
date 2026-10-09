/**
 * O RADAR LÊ OS CONTATOS EM LOTES, E LÊ O ERRO.
 *
 * Medido na tela de produção em 09/10/2026: "0 em voo" com dezenas de retornos agendados. As três
 * leituras por contato (retornos, conversas, nomes) levavam os até 500 contatos da tela num pedido
 * só — acima do que a resposta do PostgREST comporta (ver `lib/supabase/em-lotes.ts`) — e o código
 * usava `data ?? []` sem olhar o erro: a falha virava "não tem retorno", "sem nome", "sem conversa".
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const fonte = readFileSync("lib/leads/radar-de-risco.ts", "utf8");

describe("radar de risco", () => {
  it("nenhuma leitura leva a lista inteira de contatos num pedido só", () => {
    expect(fonte).not.toContain('.in("contact_id", contactIds)');
    expect(fonte).not.toContain('.in("id", contactIds)');
    expect(fonte.match(/buscaEmLotes</g)?.length).toBe(3);
  });

  it("⭐ leitura que falha derruba a rodada, em vez de virar lista vazia", () => {
    expect(fonte).toContain("followups.error ?? convs.error ?? contacts.error");
    expect(fonte).toContain("radar_leitura_indisponivel");
  });
});
