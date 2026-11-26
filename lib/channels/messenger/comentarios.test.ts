import { describe, expect, it, vi } from "vitest";

import {
  atenderComentarioDaPagina,
  comentariosDaPagina,
  lerConfigDaResposta,
  type CanalDoComentario,
  type ComentarioDaPagina,
  type DepsDoComentarioDaPagina,
} from "./comentarios";

const aviso = (value: Record<string, unknown>, field = "feed") => ({
  object: "page",
  entry: [{ id: "PAGINA", time: 1, changes: [{ field, value }] }],
});
const comentarioNovo = { item: "comment", verb: "add", comment_id: "C1", post_id: "PAGINA_P1", from: { id: "PESSOA", name: "x" }, message: "quero" };

describe("os comentários novos do aviso da página", () => {
  it("lê o comentário novo de uma publicação ou anúncio", () => {
    expect(comentariosDaPagina(aviso(comentarioNovo))).toEqual([
      { pageId: "PAGINA", commentId: "C1", postId: "PAGINA_P1", autorId: "PESSOA", texto: "quero" },
    ]);
  });
  it("edição, remoção, curtida e aviso do Instagram ficam de fora", () => {
    expect(comentariosDaPagina(aviso({ ...comentarioNovo, verb: "edited" }))).toEqual([]);
    expect(comentariosDaPagina(aviso({ ...comentarioNovo, verb: "remove" }))).toEqual([]);
    expect(comentariosDaPagina(aviso({ item: "reaction", verb: "add", from: { id: "P" } }))).toEqual([]);
    expect(comentariosDaPagina({ ...aviso(comentarioNovo), object: "instagram" })).toEqual([]);
  });
});

describe("a configuração do canal", () => {
  it("só liga com ativo e texto", () => {
    expect(lerConfigDaResposta({ resposta_a_comentario: { ativo: true, mensagem: "Oi" } })).toEqual({ ativo: true, mensagem: "Oi" });
    expect(lerConfigDaResposta({ resposta_a_comentario: { ativo: false, mensagem: "Oi" } })).toBeNull();
    expect(lerConfigDaResposta({ resposta_a_comentario: { ativo: true, mensagem: "  " } })).toBeNull();
    expect(lerConfigDaResposta(null)).toBeNull();
  });
});

const canal: CanalDoComentario = { id: "canal-1", organizationId: "org-1", config: { ativo: true, mensagem: "Oi, vi seu comentário" } };
const c: ComentarioDaPagina = { pageId: "PAGINA", commentId: "C1", postId: null, autorId: "PESSOA", texto: "quero" };

function deps(parcial: Partial<DepsDoComentarioDaPagina> = {}): DepsDoComentarioDaPagina {
  return {
    acharCanal: vi.fn(async () => canal),
    registrar: vi.fn(async () => ({ id: "reg-1" })),
    enviar: vi.fn(async () => undefined),
    concluir: vi.fn(async () => undefined),
    ...parcial,
  };
}

describe("atender o comentário da página", () => {
  it("registra, manda a mensagem do canal e grava o desfecho", async () => {
    const d = deps();
    expect(await atenderComentarioDaPagina(d, c)).toBe("respondido");
    expect(d.enviar).toHaveBeenCalledWith(canal, c, "Oi, vi seu comentário");
    expect(d.concluir).toHaveBeenCalledWith("reg-1", { status: "sent", erro: null });
  });
  it("a Meta reentregou o aviso: não manda de novo", async () => {
    const d = deps({ registrar: vi.fn(async () => null) });
    expect(await atenderComentarioDaPagina(d, c)).toBe("repetido");
    expect(d.enviar).not.toHaveBeenCalled();
  });
  it("comentário da própria página não dispara nada", async () => {
    const d = deps();
    expect(await atenderComentarioDaPagina(d, { ...c, autorId: "PAGINA" })).toBe("da_propria_pagina");
    expect(d.registrar).not.toHaveBeenCalled();
  });
  it("canal desligado não registra nem manda", async () => {
    const d = deps({ acharCanal: vi.fn(async () => ({ ...canal, config: null })) });
    expect(await atenderComentarioDaPagina(d, c)).toBe("desligado");
    expect(d.registrar).not.toHaveBeenCalled();
  });
  it("envio recusado vira failed com o motivo", async () => {
    const d = deps({ enviar: vi.fn(async () => { throw new Error("(#10) fora da janela"); }) });
    expect(await atenderComentarioDaPagina(d, c)).toBe("falhou");
    expect(d.concluir).toHaveBeenCalledWith("reg-1", { status: "failed", erro: "(#10) fora da janela" });
  });
});
