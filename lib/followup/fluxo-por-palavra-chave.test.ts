import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  escolherFluxoPelaMensagem,
  etiquetaDoFluxo,
  esquecerFluxosDePalavraChave,
  fluxosDePalavraChaveAtivos,
  fluxosDePalavraChaveDe,
} from "./fluxo-por-palavra-chave";

const ORG = "11111111-1111-4111-8111-111111111111";

/** Início → Conteúdo, na forma que o editor grava (medida num fluxo publicado em produção). */
function grafo(inicio: Record<string, unknown>) {
  return {
    nodes: [
      { id: "trigger_1", type: "trigger", label: "Início do fluxo", config: inicio, position: { x: 53, y: 99.5 } },
      {
        id: "action-1",
        type: "action",
        label: "Conteúdo",
        config: { mode: "content", items: [{ type: "text", body: "oi" }] },
        position: { x: 267, y: 110 },
      },
    ],
    edges: [{ id: "edge-1", source: "trigger_1", target: "action-1", priority: 0, condition: { type: "always" } }],
  };
}

describe("escolherFluxoPelaMensagem", () => {
  const fluxos = [{ pointerId: "tarot", palavra: "quero tarot sem misterio" }];

  it("⭐ a frase do anúncio abre o fluxo — com acento, maiúscula e texto em volta", () => {
    expect(escolherFluxoPelaMensagem(fluxos, "Olá! Quero Tarot sem Mistério 🔮")).toBe("tarot");
    expect(escolherFluxoPelaMensagem(fluxos, "quero   tarot sem misterio")).toBe("tarot");
  });

  it("frase com palavra no meio NÃO casa — é o que separa o fluxo do atendimento comum", () => {
    expect(escolherFluxoPelaMensagem(fluxos, "quero aprender tarot sem misterio")).toBeNull();
    expect(escolherFluxoPelaMensagem(fluxos, "quero uma consulta")).toBeNull();
  });

  it("mensagem sem texto (áudio, imagem) não abre fluxo", () => {
    expect(escolherFluxoPelaMensagem(fluxos, null)).toBeNull();
    expect(escolherFluxoPelaMensagem(fluxos, "   ")).toBeNull();
  });

  it("duas palavras-chave contidas na mensagem: ganha a mais longa, em qualquer ordem da lista", () => {
    const dois = [
      { pointerId: "curto", palavra: "quero tarot" },
      { pointerId: "longo", palavra: "quero tarot sem misterio" },
    ];
    expect(escolherFluxoPelaMensagem(dois, "quero tarot sem misterio")).toBe("longo");
    expect(escolherFluxoPelaMensagem([...dois].reverse(), "quero tarot sem misterio")).toBe("longo");
    expect(escolherFluxoPelaMensagem(dois, "quero tarot hoje")).toBe("curto");
  });
});

describe("etiquetaDoFluxo", () => {
  it("⭐ o nome do fluxo vira a etiqueta de quem entrou por ele", () => {
    expect(etiquetaDoFluxo("TAROT RAPIDO")).toBe("fluxo:tarot-rapido");
    expect(etiquetaDoFluxo("  Tarô sem Mistério — oferta 2 ")).toBe("fluxo:taro-sem-misterio-oferta-2");
  });

  it("nome que não deixa nada depois de limpo não vira etiqueta", () => {
    expect(etiquetaDoFluxo("🔮✨")).toBeNull();
    expect(etiquetaDoFluxo(null)).toBeNull();
    expect(etiquetaDoFluxo(undefined)).toBeNull();
  });
});

describe("fluxosDePalavraChaveDe", () => {
  it("só entra fluxo cuja caixa Início é WhatsApp + palavra-chave preenchida", () => {
    const lista = fluxosDePalavraChaveDe([
      { pointerId: "a", graph: grafo({ integration: "whatsapp", event: "keyword", keyword: "Quero Tarot Sem Mistério" }) },
      { pointerId: "b", graph: grafo({ integration: "whatsapp", event: "keyword", keyword: "   " }) },
      { pointerId: "c", graph: grafo({ integration: "whatsapp", event: "message_received" }) },
      { pointerId: "d", graph: grafo({}) },
      { pointerId: "e", graph: { nodes: "quebrado" } },
      { pointerId: "f", graph: undefined },
    ]);
    expect(lista).toEqual([{ pointerId: "a", palavra: "quero tarot sem misterio" }]);
  });
});

describe("fluxosDePalavraChaveAtivos", () => {
  beforeEach(() => esquecerFluxosDePalavraChave());

  function banco(opts: { ponteiros: unknown[]; versoes: unknown[]; erro?: boolean }) {
    const chamadas: string[] = [];
    const filtros: Array<[string, string, unknown]> = [];
    const admin = {
      from(tabela: string) {
        chamadas.push(tabela);
        const q: Record<string, unknown> = {};
        const encadeia = (nome: string) => (coluna: string, valor?: unknown) => {
          filtros.push([tabela, `${nome}:${coluna}`, valor]);
          return q;
        };
        q.select = () => q;
        q.eq = encadeia("eq");
        q.not = encadeia("not");
        q.in = encadeia("in");
        q.limit = () => q;
        q.then = (ok: (v: unknown) => unknown) =>
          Promise.resolve(
            opts.erro ? { data: null, error: { message: "caiu" } } : { data: tabela === "followup_flow_pointers" ? opts.ponteiros : opts.versoes, error: null },
          ).then(ok);
        return q;
      },
    } as unknown as SupabaseClient;
    return { admin, chamadas, filtros };
  }

  const ponteiros = [{ id: "p1", name: "TAROT RAPIDO", active_version_id: "v1" }];
  const versoes = [{ id: "v1", graph: grafo({ integration: "whatsapp", event: "keyword", keyword: "quero tarot sem misterio" }) }];

  it("⭐ lê só fluxo ATIVO, PUBLICADO e de follow-up, sempre com a organização nos dois passos", async () => {
    const b = banco({ ponteiros, versoes });
    expect(await fluxosDePalavraChaveAtivos(b.admin, ORG, 1_000)).toEqual([{ pointerId: "p1", palavra: "quero tarot sem misterio", nome: "TAROT RAPIDO" }]);
    expect(b.filtros).toContainEqual(["followup_flow_pointers", "eq:organization_id", ORG]);
    expect(b.filtros).toContainEqual(["followup_flow_pointers", "eq:status", "active"]);
    expect(b.filtros).toContainEqual(["followup_flow_pointers", "eq:surface", "followup"]);
    expect(b.filtros).toContainEqual(["followup_flow_versions", "eq:organization_id", ORG]);
    expect(b.filtros).toContainEqual(["followup_flow_versions", "in:id", ["v1"]]);
  });

  it("dentro de 30 s não volta ao banco; depois disso, volta", async () => {
    const b = banco({ ponteiros, versoes });
    await fluxosDePalavraChaveAtivos(b.admin, ORG, 1_000);
    await fluxosDePalavraChaveAtivos(b.admin, ORG, 20_000);
    expect(b.chamadas).toHaveLength(2);
    await fluxosDePalavraChaveAtivos(b.admin, ORG, 40_000);
    expect(b.chamadas).toHaveLength(4);
  });

  it("organização sem fluxo publicado: lista vazia e nenhuma leitura de versão", async () => {
    const b = banco({ ponteiros: [], versoes: [] });
    expect(await fluxosDePalavraChaveAtivos(b.admin, ORG, 1_000)).toEqual([]);
    expect(b.chamadas).toEqual(["followup_flow_pointers"]);
  });

  it("falha de leitura devolve vazio (o agente atende) e NÃO fica guardada", async () => {
    const quebrado = banco({ ponteiros, versoes, erro: true });
    expect(await fluxosDePalavraChaveAtivos(quebrado.admin, ORG, 1_000)).toEqual([]);
    const bom = banco({ ponteiros, versoes });
    expect(await fluxosDePalavraChaveAtivos(bom.admin, ORG, 2_000)).toHaveLength(1);
  });
});

describe("a entrada de mensagem do número do agente", () => {
  it("consulta o fluxo de palavra-chave ANTES de acordar o agente, e só no caminho do agente", async () => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync("lib/channels/pos-entrada.ts", "utf8");
    const corpo = fonte.slice(fonte.indexOf("async function processarFluxoOuDespachoDoCanal"));
    const fluxo = corpo.indexOf("if (await entrarEmFluxoPorPalavraChave(admin, entrada)) return;");
    const agente = corpo.indexOf("await pedirDespachoDoAgente(admin, entrada);");
    const numeroDeFluxo = corpo.indexOf('if (dono.quem === "fluxo")');
    expect(fluxo).toBeGreaterThan(-1);
    expect(agente).toBeGreaterThan(fluxo);
    // Número de fluxo e número de humano saem antes: a regra nova não toca neles.
    expect(numeroDeFluxo).toBeGreaterThan(-1);
    expect(fluxo).toBeGreaterThan(numeroDeFluxo);
  });
});
