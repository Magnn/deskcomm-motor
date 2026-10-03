import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { criarBancoEmMemoria } from "@/tests/helpers/banco-em-memoria";

import {
  analisarPendentes,
  conversasPendentes,
  corrigirMotivo,
  lerPainelDePerdas,
  lerResposta,
  montarPedido,
  type DepsDaAnalise,
} from "./motivo-da-perda";

const AGORA = new Date("2026-10-10T00:00:00.000Z");
const ANTIGA = "2026-10-01T10:00:00.000Z";

describe("lerResposta", () => {
  it("aceita só o vocabulário fechado, com a confiança limitada a 0–100", () => {
    expect(lerResposta('{"motivo": "preco", "confianca": 87}')).toEqual({ motivo: "preco", confianca: 87 });
    expect(lerResposta('Claro! {"motivo":"timing","confianca":"140"} pronto')).toEqual({ motivo: "timing", confianca: 100 });
    expect(lerResposta('{"motivo": "inventado", "confianca": 90}')).toBeNull();
    expect(lerResposta('{"motivo": "preco"}')).toBeNull();
    expect(lerResposta("não sei")).toBeNull();
  });

  it("o modelo NÃO pode escolher 'sem_resposta' — isso é fato, vem só da regra", () => {
    expect(lerResposta('{"motivo": "sem_resposta", "confianca": 99}')).toBeNull();
  });
});

describe("montarPedido", () => {
  it("manda só as falas com texto, marcadas por quem falou, cortadas e limitadas às últimas", () => {
    const muitas = Array.from({ length: 40 }, (_, i) => ({ direction: i % 2 ? "inbound" : "outbound", body: `fala ${i}` }));
    const pedido = montarPedido([...muitas, { direction: "inbound", body: null }, { direction: "inbound", body: "x".repeat(1000) }]);
    expect(pedido).not.toContain("fala 5\n");
    expect(pedido).toContain("Cliente: fala 39");
    expect(pedido).toContain("Empresa: fala 38");
    expect(pedido).toContain(`Cliente: ${"x".repeat(300)}`);
    expect(pedido).not.toContain("x".repeat(301));
    // `sem_resposta` não é oferecido ao modelo.
    expect(pedido).not.toContain("- sem_resposta");
  });
});

/** Três conversas com oferta: silêncio (regra), objeção (IA), e uma que comprou (fora). */
function cenario() {
  const conversa = (id: string, contato: string, ultimaEntrada: string, ultimaMsg = "2026-10-01T10:30:00.000Z") => ({
    id,
    organization_id: "org-1",
    contact_id: contato,
    is_group: false,
    created_at: ANTIGA,
    last_inbound_at: ultimaEntrada,
    last_outbound_at: "2026-10-01T10:10:00.000Z",
    last_message_at: ultimaMsg,
  });
  const oferta = (c: string) => ({ organization_id: "org-1", conversation_id: c, kind: "oferta_apresentada", occurred_at: "2026-10-01T10:10:00.000Z" });
  return criarBancoEmMemoria(
    {
      conversations: [
        conversa("silencio", "c1", "2026-10-01T10:05:00.000Z"),
        conversa("objetou", "c2", "2026-10-01T10:20:00.000Z"),
        conversa("comprou", "c3", "2026-10-01T10:20:00.000Z"),
        // Falou ontem: ainda pode fechar — não é perda.
        conversa("viva", "c4", "2026-10-09T10:20:00.000Z", "2026-10-09T10:20:00.000Z"),
      ],
      conversation_milestones: [
        oferta("silencio"),
        oferta("objetou"),
        oferta("comprou"),
        oferta("viva"),
        { organization_id: "org-1", conversation_id: "objetou", kind: "objecao", occurred_at: "2026-10-01T10:20:00.000Z" },
      ],
      revenue_ledger: [{ organization_id: "org-1", contact_id: "c3", event_type: "charge", occurred_at: "2026-10-01T11:00:00.000Z" }],
      conversation_loss_reasons: [],
      messages: [
        { organization_id: "org-1", conversation_id: "objetou", direction: "outbound", body: "Fica R$ 130.", created_at: "2026-10-01T10:10:00.000Z" },
        { organization_id: "org-1", conversation_id: "objetou", direction: "inbound", body: "tá caro", created_at: "2026-10-01T10:20:00.000Z" },
      ],
    },
    { conversation_loss_reasons: [["conversation_id"]] },
  );
}

const deps = (inferir: DepsDaAnalise["inferir"]): DepsDaAnalise => ({ inferir });

describe("conversasPendentes", () => {
  it("só quem recebeu a oferta, não comprou e está parada há dois dias", async () => {
    const b = cenario();
    const p = await conversasPendentes(b.cliente as unknown as SupabaseClient, "org-1", AGORA);
    expect(p.map((c) => c.id).sort()).toEqual(["objetou", "silencio"]);
  });
});

describe("analisarPendentes", () => {
  it("silêncio depois da oferta vira FATO por regra (sem IA); objeção vai para a IA com a confiança dela", async () => {
    const b = cenario();
    const inferir = vi.fn<DepsDaAnalise["inferir"]>(async () => ({ motivo: "preco", confianca: 91, modelo: "gpt-x" }));
    const r = await analisarPendentes(b.cliente as unknown as SupabaseClient, deps(inferir), "org-1", AGORA);
    expect(r).toEqual({ porRegra: 1, porIa: 1, semLeitura: 0, interrompida: null, restantes: 0 });
    expect(inferir).toHaveBeenCalledTimes(1);
    // A IA recebeu a conversa em ordem cronológica.
    expect(inferir.mock.calls[0]?.[1].map((m) => m.body)).toEqual(["Fica R$ 130.", "tá caro"]);
    const linhas = Object.fromEntries((b.tabelas.conversation_loss_reasons ?? []).map((l) => [l.conversation_id, l]));
    expect(linhas.silencio).toMatchObject({ reason: "sem_resposta", source: "regra", confidence: 100, model: null });
    expect(linhas.objetou).toMatchObject({ reason: "preco", source: "ia", confidence: 91, model: "gpt-x" });
    // Nenhum texto da conversa foi gravado.
    expect(JSON.stringify(b.tabelas.conversation_loss_reasons)).not.toContain("caro");
  });

  it("IA que para (teto de gasto) interrompe a análise, guarda o que já fez e diz o porquê", async () => {
    const b = cenario();
    const r = await analisarPendentes(
      b.cliente as unknown as SupabaseClient,
      deps(async () => Promise.reject(new Error("limite de gasto com IA atingido"))),
      "org-1",
      AGORA,
    );
    expect(r).toMatchObject({ porRegra: 1, porIa: 0, restantes: 1, interrompida: "limite de gasto com IA atingido" });
    expect(b.tabelas.conversation_loss_reasons).toHaveLength(1);
  });

  it("resposta fora do vocabulário não grava nada — a conversa continua pendente", async () => {
    const b = cenario();
    const r = await analisarPendentes(b.cliente as unknown as SupabaseClient, deps(async () => null), "org-1", AGORA);
    expect(r).toMatchObject({ porIa: 0, semLeitura: 1 });
    expect((b.tabelas.conversation_loss_reasons ?? []).map((l) => l.conversation_id)).toEqual(["silencio"]);
  });
});

describe("corrigirMotivo", () => {
  it("a correção vira 'humano', sem confiança, e uma nova análise NÃO a reescreve", async () => {
    const b = cenario();
    const db = b.cliente as unknown as SupabaseClient;
    await expect(corrigirMotivo(db, { organizationId: "org-1", conversationId: "objetou", motivo: "timing", userId: "u1", agora: AGORA })).resolves.toBe(true);
    const inferir = vi.fn(async () => ({ motivo: "preco" as const, confianca: 99, modelo: null }));
    await analisarPendentes(db, deps(inferir), "org-1", AGORA);
    expect(inferir).not.toHaveBeenCalled();
    const linha = (b.tabelas.conversation_loss_reasons ?? []).find((l) => l.conversation_id === "objetou");
    expect(linha).toMatchObject({ reason: "timing", source: "humano", confidence: null, corrected_by: "u1" });
  });

  it("conversa de OUTRA organização não é corrigida", async () => {
    const b = cenario();
    await expect(
      corrigirMotivo(b.cliente as unknown as SupabaseClient, { organizationId: "org-2", conversationId: "objetou", motivo: "timing", userId: "u1", agora: AGORA }),
    ).resolves.toBe(false);
    expect(b.tabelas.conversation_loss_reasons).toHaveLength(0);
  });
});

describe("lerPainelDePerdas", () => {
  it("a confiança média é só da inferência; fato e correção não entram na média", async () => {
    const b = cenario();
    const db = b.cliente as unknown as SupabaseClient;
    await analisarPendentes(db, deps(async () => ({ motivo: "preco" as const, confianca: 80, modelo: null })), "org-1", AGORA);
    const painel = await lerPainelDePerdas(db, "org-1", { inicio: new Date("2026-10-09T00:00:00.000Z"), fim: new Date("2026-10-11T00:00:00.000Z") }, AGORA);
    expect(painel.pendentes).toBe(0);
    expect(painel.porMotivo.find((m) => m.motivo === "preco")).toEqual({ motivo: "preco", total: 1, confiancaMedia: 80 });
    expect(painel.porMotivo.find((m) => m.motivo === "sem_resposta")).toEqual({ motivo: "sem_resposta", total: 1, confiancaMedia: null });
  });
});
