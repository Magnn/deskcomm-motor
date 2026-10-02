/**
 * Comentou, recebe direct. O que se cobra: a conta não responde a si mesma, o
 * aviso repetido não vira dois directs, e a resposta pública só aparece quando o
 * direct saiu de verdade.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { atenderComentario, comentariosDoAviso } = await import("./comentarios");
type Deps = import("./comentarios").DepsDosComentarios;
type Regra = import("./regras").RegraDeComentario;

const CONEXAO = { id: "con-1", organizationId: "org-1", igId: "178400", igUserId: "999000", token: "token-da-conta" };

const regra = (mudancas: Partial<Regra> = {}): Regra => ({
  id: "regra-1",
  is_active: true,
  post_scope: "all",
  post_ids: [],
  match_type: "contains",
  keywords: ["quero"],
  dm_message: "Oi {{usuario}}! Aqui está o link.",
  public_replies: ["Te mandei no direct, {{usuario}}!"],
  ...mudancas,
});

const comentario = (mudancas: Record<string, unknown> = {}) => ({
  contaId: "999000",
  commentId: "comentario-1",
  texto: "Quero!",
  mediaId: "post-1",
  autorId: "555",
  autorUsername: "marina",
  ...mudancas,
});

let registrados: Set<string>;
let passos: string[];

function deps(mudancas: Partial<Deps> = {}): Deps {
  return {
    acharConexao: vi.fn(async (contaId: string) => (contaId === "999000" || contaId === "178400" ? CONEXAO : null)),
    listarRegras: vi.fn(async () => [regra()]),
    registrar: vi.fn(async ({ comentario: c }) => {
      passos.push("registrar");
      if (registrados.has(c.commentId)) return null;
      registrados.add(c.commentId);
      return { id: "evento-1" };
    }),
    concluir: vi.fn(async () => {
      passos.push("concluir");
    }),
    enviarRespostaPrivada: vi.fn(async () => {
      passos.push("direct");
    }),
    responderComentario: vi.fn(async () => {
      passos.push("publica");
    }),
    rng: () => 0,
    ...mudancas,
  };
}

beforeEach(() => {
  registrados = new Set();
  passos = [];
});

describe("atender um comentário", () => {
  it("⭐ registra ANTES de responder, manda o direct e só então a resposta pública", async () => {
    const d = deps();
    const r = await atenderComentario(d, comentario());
    expect(r).toEqual({ resultado: "atendido", dm: "sent", publica: "sent" });
    expect(passos).toEqual(["registrar", "direct", "publica", "concluir"]);
    expect(d.enviarRespostaPrivada).toHaveBeenCalledWith("token-da-conta", "comentario-1", "Oi @marina! Aqui está o link.");
    expect(d.responderComentario).toHaveBeenCalledWith("token-da-conta", "comentario-1", "Te mandei no direct, @marina!");
    expect(d.concluir).toHaveBeenCalledWith("evento-1", { dm: "sent", publica: "sent", erro: null });
  });

  it("⭐ aviso repetido pela Meta: a pessoa NÃO recebe dois directs", async () => {
    const d = deps();
    await atenderComentario(d, comentario());
    expect(await atenderComentario(d, comentario())).toEqual({ resultado: "repetido" });
    expect(d.enviarRespostaPrivada).toHaveBeenCalledTimes(1);
    expect(d.responderComentario).toHaveBeenCalledTimes(1);
  });

  it("⭐ comentário da PRÓPRIA conta não dispara nada — senão a resposta pública entraria em laço", async () => {
    for (const autorId of [CONEXAO.igId, CONEXAO.igUserId]) {
      const d = deps();
      expect(await atenderComentario(d, comentario({ autorId, texto: "quero" }))).toEqual({ resultado: "proprio" });
      expect(d.registrar).not.toHaveBeenCalled();
      expect(d.enviarRespostaPrivada).not.toHaveBeenCalled();
    }
  });

  it("⭐ o direct falhou: a resposta pública NÃO é postada, e o motivo fica no registro", async () => {
    const d = deps({ enviarRespostaPrivada: vi.fn(async () => { throw new Error("instagram_400: usuário não aceita mensagens"); }) });
    const r = await atenderComentario(d, comentario());
    expect(r).toEqual({ resultado: "atendido", dm: "failed", publica: "skipped" });
    expect(d.responderComentario).not.toHaveBeenCalled();
    expect(d.concluir).toHaveBeenCalledWith("evento-1", {
      dm: "failed",
      publica: "skipped",
      erro: "instagram_400: usuário não aceita mensagens",
    });
  });

  it("o direct saiu e a resposta pública falhou: o registro diz as duas coisas", async () => {
    const d = deps({ responderComentario: vi.fn(async () => { throw new Error("instagram_403: sem permissão"); }) });
    expect(await atenderComentario(d, comentario())).toEqual({ resultado: "atendido", dm: "sent", publica: "failed" });
    expect(d.concluir).toHaveBeenCalledWith("evento-1", { dm: "sent", publica: "failed", erro: "instagram_403: sem permissão" });
  });

  it("regra sem resposta pública: só o direct", async () => {
    const d = deps({ listarRegras: vi.fn(async () => [regra({ public_replies: [] })]) });
    expect(await atenderComentario(d, comentario())).toEqual({ resultado: "atendido", dm: "sent", publica: "skipped" });
    expect(d.responderComentario).not.toHaveBeenCalled();
  });

  it("comentário que nenhuma regra atende não é registrado nem respondido", async () => {
    const d = deps();
    expect(await atenderComentario(d, comentario({ texto: "que lindo" }))).toEqual({ resultado: "sem_regra" });
    expect(d.registrar).not.toHaveBeenCalled();
  });

  it("aviso de conta que não está conectada aqui: nada acontece", async () => {
    const d = deps();
    expect(await atenderComentario(d, comentario({ contaId: "outra-conta" }))).toEqual({ resultado: "conta_desconhecida" });
    expect(d.listarRegras).not.toHaveBeenCalled();
  });
});

describe("ler o aviso da Meta", () => {
  const AVISO = {
    object: "instagram",
    entry: [
      {
        id: "999000",
        time: 1790000000,
        changes: [
          {
            field: "comments",
            value: { id: "comentario-1", text: "Quero!", from: { id: "555", username: "marina" }, media: { id: "post-1", media_product_type: "FEED" } },
          },
          { field: "mentions", value: { comment_id: "x" } },
        ],
      },
      { id: "999000", time: 1790000001, changes: [{ field: "comments", value: { id: "comentario-2", from: { id: "556" }, media: { id: "post-1" } } }] },
    ],
  };

  it("tira todos os comentários, de todas as entradas — a Meta agrupa vários num aviso só", () => {
    expect(comentariosDoAviso(AVISO)).toEqual([
      { contaId: "999000", commentId: "comentario-1", texto: "Quero!", mediaId: "post-1", autorId: "555", autorUsername: "marina" },
      { contaId: "999000", commentId: "comentario-2", texto: "", mediaId: "post-1", autorId: "556", autorUsername: null },
    ]);
  });

  it("aviso de outro objeto, sem entradas ou malformado: lista vazia, sem lançar", () => {
    expect(comentariosDoAviso({ object: "page", entry: [] })).toEqual([]);
    expect(comentariosDoAviso({ object: "instagram" })).toEqual([]);
    expect(comentariosDoAviso(null)).toEqual([]);
    expect(comentariosDoAviso({ object: "instagram", entry: [{ id: "1", changes: [{ field: "comments", value: { text: "sem id" } }] }] })).toEqual([]);
  });

  it("aviso só de direct (sem comentário) não vira comentário", () => {
    expect(comentariosDoAviso({ object: "instagram", entry: [{ id: "999000", messaging: [{ sender: { id: "1" }, message: { text: "oi" } }] }] })).toEqual([]);
  });
});
