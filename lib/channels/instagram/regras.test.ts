import { describe, expect, it } from "vitest";

import {
  comentarioCasa,
  escolherRespostaPublica,
  normalizarComentario,
  preencherMensagem,
  regraQueAtende,
  regraValeParaAPublicacao,
  type RegraDeComentario,
} from "./regras";

const regra = (mudancas: Partial<RegraDeComentario> = {}): RegraDeComentario => ({
  id: "r1",
  is_active: true,
  post_scope: "all",
  post_ids: [],
  match_type: "contains",
  keywords: ["quero"],
  dm_message: "Aqui está o link!",
  public_replies: [],
  ...mudancas,
});

describe("o comentário casa com a regra?", () => {
  it("sem acento, sem caixa e sem pontuação: 'QUÉRO!!' é 'quero'", () => {
    expect(normalizarComentario("  QUÉRO   muito ")).toBe("quero muito");
    for (const texto of ["quero", "QUERO", "Quéro!!", "eu quero sim 🙏", "quero."]) {
      expect(comentarioCasa(texto, regra()), texto).toBe(true);
    }
  });

  it("⭐ 'contém' é a PALAVRA inteira — 'eu' não casa com 'meu', 'quero' não casa com 'querosene'", () => {
    expect(comentarioCasa("meu deus", regra({ keywords: ["eu"] }))).toBe(false);
    expect(comentarioCasa("querosene", regra())).toBe(false);
    expect(comentarioCasa("eu também", regra({ keywords: ["eu"] }))).toBe(true);
  });

  it("palavra-chave de mais de uma palavra casa como frase", () => {
    expect(comentarioCasa("me manda o link por favor", regra({ keywords: ["manda o link"] }))).toBe(true);
    expect(comentarioCasa("o link que manda", regra({ keywords: ["manda o link"] }))).toBe(false);
  });

  it("'exato' exige o comentário inteiro; 'qualquer comentário' casa com tudo", () => {
    const exata = regra({ match_type: "exact" });
    expect(comentarioCasa("Quero!", exata)).toBe(true);
    expect(comentarioCasa("eu quero", exata)).toBe(false);
    expect(comentarioCasa("qualquer coisa", regra({ match_type: "any", keywords: [] }))).toBe(true);
    expect(comentarioCasa("", regra({ match_type: "any", keywords: [] }))).toBe(true);
  });

  it("⭐ regra por palavra SEM palavra não casa com nada — campo esquecido não vira 'todo comentário'", () => {
    expect(comentarioCasa("quero", regra({ keywords: [] }))).toBe(false);
    expect(comentarioCasa("quero", regra({ keywords: ["  ", "!!"] }))).toBe(false);
  });

  it("comentário só de emoji não casa por palavra", () => {
    expect(comentarioCasa("🔥🔥🔥", regra())).toBe(false);
  });
});

describe("qual regra atende", () => {
  it("regra de publicação específica só vale nela", () => {
    const r = regra({ post_scope: "specific", post_ids: ["post-1"] });
    expect(regraValeParaAPublicacao(r, "post-1")).toBe(true);
    expect(regraValeParaAPublicacao(r, "post-2")).toBe(false);
    expect(regraValeParaAPublicacao(r, null)).toBe(false);
    expect(regraValeParaAPublicacao(regra(), null)).toBe(true);
  });

  it("⭐ a regra da publicação ganha da regra geral, mesmo criada depois", () => {
    const geral = regra({ id: "geral" });
    const doPost = regra({ id: "do-post", post_scope: "specific", post_ids: ["post-1"] });
    expect(regraQueAtende([geral, doPost], { texto: "quero", mediaId: "post-1" })?.id).toBe("do-post");
    expect(regraQueAtende([geral, doPost], { texto: "quero", mediaId: "post-2" })?.id).toBe("geral");
  });

  it("regra desligada não atende; sem regra que case, ninguém atende", () => {
    expect(regraQueAtende([regra({ is_active: false })], { texto: "quero", mediaId: "p" })).toBeNull();
    expect(regraQueAtende([regra()], { texto: "que lindo", mediaId: "p" })).toBeNull();
    expect(regraQueAtende([], { texto: "quero", mediaId: "p" })).toBeNull();
  });

  it("entre duas do mesmo escopo, vale a primeira da lista", () => {
    const a = regra({ id: "a", keywords: ["quero"] });
    const b = regra({ id: "b", keywords: ["quero", "link"] });
    expect(regraQueAtende([a, b], { texto: "quero o link", mediaId: null })?.id).toBe("a");
  });
});

describe("as mensagens", () => {
  it("resposta pública: uma das variações; sem variação válida, nenhuma", () => {
    const v = ["Te mandei no direct!", "Olha o direct 😉", "  "];
    expect(escolherRespostaPublica(v, () => 0)).toBe("Te mandei no direct!");
    expect(escolherRespostaPublica(v, () => 0.99)).toBe("Olha o direct 😉");
    expect(escolherRespostaPublica([], () => 0)).toBeNull();
    expect(escolherRespostaPublica(["   "], () => 0)).toBeNull();
  });

  it("{{usuario}} vira o @ de quem comentou; sem nome, some sem deixar buraco", () => {
    expect(preencherMensagem("Oi {{usuario}}, segue o link", { username: "marina" })).toBe("Oi @marina, segue o link");
    expect(preencherMensagem("Oi {{ Usuario }}, segue o link", { username: null })).toBe("Oi, segue o link");
    expect(preencherMensagem("Sem marca", { username: "x" })).toBe("Sem marca");
  });
});
