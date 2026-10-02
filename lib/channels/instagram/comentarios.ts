/**
 * COMENTOU, RECEBE DIRECT — o que acontece quando o aviso de um comentário chega.
 *
 *   1. acha a conta (a organização vem DAQUI, nunca do corpo do aviso);
 *   2. ignora o comentário da própria conta — a nossa resposta pública também é um
 *      comentário, e sem isto ela dispararia a regra de novo, em laço;
 *   3. escolhe a regra que atende (`regras.ts`);
 *   4. registra o comentário ANTES de responder: o índice único é a trava contra
 *      a Meta reentregar o aviso e a pessoa receber dois directs;
 *   5. manda o direct; e SÓ SE ELE SAIU posta a resposta pública — dizer "te
 *      mandei no direct" embaixo de um direct que falhou é mentir em público.
 *
 * As pontas (banco e Instagram) entram por `DepsDosComentarios`: a ordem acima é
 * o que erra sem barulho, e assim ela se testa sem rede.
 */
import { logger } from "@/lib/logger";

import { escolherRespostaPublica, preencherMensagem, regraQueAtende, type RegraDeComentario } from "./regras";

export interface ComentarioRecebido {
  /** `entry.id` do aviso: a conta que recebeu o comentário. */
  contaId: string;
  commentId: string;
  texto: string;
  mediaId: string | null;
  autorId: string;
  autorUsername: string | null;
}

export interface ConexaoParaComentarios {
  id: string;
  organizationId: string;
  /** Os dois ids pelos quais a Meta chama a conta — o comentário próprio pode vir com qualquer um. */
  igId: string;
  igUserId: string;
  token: string;
}

export interface DepsDosComentarios {
  /** A conexão ATIVA da conta, com o token já decifrado. `null` = conta que não é nossa. */
  acharConexao(contaId: string): Promise<ConexaoParaComentarios | null>;
  listarRegras(conexaoId: string): Promise<RegraDeComentario[]>;
  /** Grava o comentário como "em atendimento". `false` = já estava gravado (aviso repetido). */
  registrar(evento: {
    organizationId: string;
    conexaoId: string;
    regraId: string;
    comentario: ComentarioRecebido;
  }): Promise<{ id: string } | null>;
  concluir(
    eventoId: string,
    desfecho: { dm: "sent" | "failed"; publica: "sent" | "failed" | "skipped"; erro: string | null },
  ): Promise<void>;
  enviarRespostaPrivada(token: string, commentId: string, texto: string): Promise<void>;
  responderComentario(token: string, commentId: string, texto: string): Promise<void>;
  rng?: () => number;
}

export type DesfechoDoComentario =
  | { resultado: "conta_desconhecida" }
  | { resultado: "proprio" }
  | { resultado: "sem_regra" }
  | { resultado: "repetido" }
  | { resultado: "atendido"; dm: "sent" | "failed"; publica: "sent" | "failed" | "skipped" };

const motivo = (err: unknown): string => (err instanceof Error ? err.message : String(err)).slice(0, 300);

export async function atenderComentario(deps: DepsDosComentarios, comentario: ComentarioRecebido): Promise<DesfechoDoComentario> {
  const conexao = await deps.acharConexao(comentario.contaId);
  if (conexao === null) return { resultado: "conta_desconhecida" };

  if (comentario.autorId === conexao.igId || comentario.autorId === conexao.igUserId) return { resultado: "proprio" };

  const regra = regraQueAtende(await deps.listarRegras(conexao.id), { texto: comentario.texto, mediaId: comentario.mediaId });
  if (regra === null) return { resultado: "sem_regra" };

  const evento = await deps.registrar({ organizationId: conexao.organizationId, conexaoId: conexao.id, regraId: regra.id, comentario });
  if (evento === null) return { resultado: "repetido" };

  const quem = { username: comentario.autorUsername };
  let dm: "sent" | "failed" = "failed";
  let publica: "sent" | "failed" | "skipped" = "skipped";
  let erro: string | null = null;

  try {
    await deps.enviarRespostaPrivada(conexao.token, comentario.commentId, preencherMensagem(regra.dm_message, quem));
    dm = "sent";
  } catch (err) {
    erro = motivo(err);
    logger.warn("[instagram.comentarios] o direct não saiu", { conexao: conexao.id, regra: regra.id, erro });
  }

  if (dm === "sent") {
    const resposta = escolherRespostaPublica(regra.public_replies, deps.rng);
    if (resposta !== null) {
      try {
        await deps.responderComentario(conexao.token, comentario.commentId, preencherMensagem(resposta, quem));
        publica = "sent";
      } catch (err) {
        publica = "failed";
        erro = motivo(err);
        logger.warn("[instagram.comentarios] a resposta pública não saiu", { conexao: conexao.id, regra: regra.id, erro });
      }
    }
  }

  await deps.concluir(evento.id, { dm, publica, erro });
  return { resultado: "atendido", dm, publica };
}

/** Os comentários de um aviso da Meta, do jeito que ela manda (`object: "instagram"`). */
export function comentariosDoAviso(payload: unknown): ComentarioRecebido[] {
  const p = payload as { object?: unknown; entry?: unknown } | null;
  if (!p || p.object !== "instagram" || !Array.isArray(p.entry)) return [];
  const saida: ComentarioRecebido[] = [];
  for (const entrada of p.entry as Array<Record<string, unknown>>) {
    const contaId = typeof entrada?.id === "string" || typeof entrada?.id === "number" ? String(entrada.id) : null;
    if (contaId === null) continue;
    const mudancas = Array.isArray(entrada.changes) ? (entrada.changes as Array<Record<string, unknown>>) : [];
    // A Meta manda o comentário em `changes[]`; uma variante antiga o traz direto na entrada.
    const valores = [
      ...mudancas.filter((m) => m?.field === "comments").map((m) => m.value),
      ...(entrada.field === "comments" ? [entrada.value] : []),
    ];
    for (const bruto of valores) {
      const v = bruto as { id?: unknown; text?: unknown; from?: { id?: unknown; username?: unknown }; media?: { id?: unknown } } | null;
      const commentId = typeof v?.id === "string" ? v.id : null;
      const autorId = typeof v?.from?.id === "string" || typeof v?.from?.id === "number" ? String(v.from.id) : null;
      if (commentId === null || autorId === null) continue;
      saida.push({
        contaId,
        commentId,
        texto: typeof v?.text === "string" ? v.text : "",
        mediaId: typeof v?.media?.id === "string" ? v.media.id : null,
        autorId,
        autorUsername: typeof v?.from?.username === "string" ? v.from.username : null,
      });
    }
  }
  return saida;
}
