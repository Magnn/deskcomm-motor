import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { criarBancoEmMemoria } from "@/tests/helpers/banco-em-memoria";

import { CATEGORIA_LINK, CATEGORIA_PRECO, classificarNovasMensagens, CONSUMIDOR, marcosDaMensagem } from "./marcos";

describe("marcosDaMensagem", () => {
  it("mensagem que SAIU com preço dito ou link de pagamento = oferta apresentada", () => {
    expect(marcosDaMensagem({ direction: "outbound", body: "O valor é R$ 130 à vista." }, [])).toEqual([{ tipo: "oferta_apresentada", categoria: CATEGORIA_PRECO }]);
    expect(marcosDaMensagem({ direction: "outbound", body: "Fica por 97 reais." }, [])).toEqual([{ tipo: "oferta_apresentada", categoria: CATEGORIA_PRECO }]);
    expect(marcosDaMensagem({ direction: "outbound", body: "Aqui o link: https://pay.cakto.com.br/abc123" }, [])).toEqual([{ tipo: "oferta_apresentada", categoria: CATEGORIA_LINK }]);
  });

  it("a PESSOA dizer um preço não é a empresa apresentar a oferta", () => {
    expect(marcosDaMensagem({ direction: "inbound", body: "vi por R$ 50 em outro lugar" }, [])).toEqual([]);
  });

  it("mensagem que CHEGOU reclamando do valor = objeção de preço", () => {
    expect(marcosDaMensagem({ direction: "inbound", body: "nossa, tá caro" }, [])).toEqual([{ tipo: "objecao", categoria: CATEGORIA_PRECO }]);
    expect(marcosDaMensagem({ direction: "inbound", body: "tem desconto?" }, [])).toEqual([{ tipo: "objecao", categoria: CATEGORIA_PRECO }]);
  });

  it("frase cadastrada na aba Objeções casa sem acento, caixa ou pontuação; frase curta demais não casa nada", () => {
    const frases = ["Preciso falar com meu marido", "não"];
    expect(marcosDaMensagem({ direction: "inbound", body: "Hmm... PRECISO FALAR COM MEU MARIDO primeiro!" }, frases)).toEqual([
      { tipo: "objecao", categoria: "Preciso falar com meu marido" },
    ]);
    expect(marcosDaMensagem({ direction: "inbound", body: "não sei ainda" }, frases)).toEqual([]);
  });

  it("conversa comum, mensagem vazia e a empresa dizendo 'caro' não viram marco", () => {
    expect(marcosDaMensagem({ direction: "inbound", body: "oi, tudo bem?" }, [])).toEqual([]);
    expect(marcosDaMensagem({ direction: "outbound", body: "Entendo que pareça caro." }, [])).toEqual([]);
    expect(marcosDaMensagem({ direction: "inbound", body: null }, [])).toEqual([]);
  });
});

const msg = (id: string, em: string, direction: string, body: string, org = "org-1") => ({
  id,
  organization_id: org,
  conversation_id: `cv-${org}`,
  contact_id: "c1",
  direction,
  body,
  created_at: em,
  sent_at: null,
});

describe("classificarNovasMensagens", () => {
  const cenario = () =>
    criarBancoEmMemoria(
      {
        messages: [
          msg("m1", "2026-10-01T10:00:00.000Z", "inbound", "oi"),
          msg("m2", "2026-10-01T10:01:00.000Z", "outbound", "O valor é R$ 130."),
          msg("m3", "2026-10-01T10:02:00.000Z", "inbound", "tá caro"),
          msg("m4", "2026-10-01T10:03:00.000Z", "inbound", "vou pensar com calma", "org-2"),
        ],
        // A configuração mora no AGENTE (`ai_agents.config`), como o motor lê. A
        // versão existe sem coluna `config` — é o schema real, e foi por supor o
        // contrário que a rotina falhou em produção na primeira execução.
        ai_agents: [
          { id: "a2", organization_id: "org-2", published_version_id: "v2", archived_at: null, config: { objections: { enabled: true, objecoes: [{ quando: "vou pensar", resposta: "Claro, sem pressa." }] } } },
          { id: "rascunho", organization_id: "org-2", published_version_id: null, archived_at: null, config: { objections: { enabled: true, objecoes: [{ quando: "calma", resposta: "Ok." }] } } },
        ],
        watchdog_cursors: [],
        conversation_milestones: [],
      },
      { conversation_milestones: [["message_id", "kind"]], watchdog_cursors: [["consumer"]] },
    );

  it("grava os marcos de cada organização com as regras DELA, e avança o cursor", async () => {
    const b = cenario();
    const r = await classificarNovasMensagens(b.cliente as unknown as SupabaseClient);
    expect(r).toEqual({ lidas: 4, marcos: 3, haMais: false, linksDePagamento: [] });
    expect((b.tabelas.conversation_milestones ?? []).map((m) => `${String(m.message_id)}:${String(m.kind)}:${String(m.category)}`).sort()).toEqual([
      "m2:oferta_apresentada:preco",
      "m3:objecao:preco",
      "m4:objecao:vou pensar",
    ]);
    expect(b.tabelas.watchdog_cursors?.[0]).toMatchObject({ consumer: CONSUMIDOR, last_event_id: "m4" });
  });

  it("segunda rodada sem mensagem nova não lê nem duplica nada", async () => {
    const b = cenario();
    await classificarNovasMensagens(b.cliente as unknown as SupabaseClient);
    const r = await classificarNovasMensagens(b.cliente as unknown as SupabaseClient);
    expect(r).toEqual({ lidas: 0, marcos: 0, haMais: false, linksDePagamento: [] });
    expect(b.tabelas.conversation_milestones).toHaveLength(3);
  });

  it("gravação que falha NÃO avança o cursor — a próxima rodada refaz o lote", async () => {
    const b = cenario();
    b.falharProxima("conversation_milestones", "banco fora");
    await expect(classificarNovasMensagens(b.cliente as unknown as SupabaseClient)).rejects.toThrow("banco fora");
    expect(b.tabelas.watchdog_cursors).toHaveLength(0);
    const r = await classificarNovasMensagens(b.cliente as unknown as SupabaseClient);
    expect(r.marcos).toBe(3);
  });
});
