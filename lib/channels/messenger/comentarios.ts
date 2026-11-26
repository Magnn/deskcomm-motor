/**
 * COMENTOU NA PÁGINA, RECEBE MENSAGEM NO MESSENGER — o par do "comentou, recebe direct" do Instagram
 * (`lib/channels/instagram/comentarios.ts`) para a página do Facebook.
 *
 * Medido em 26/11/2026: comentário em anúncio da página nem chegava ao CRM, porque a página não assinava o campo
 * `feed`. Agora assina (`AVISOS_DA_PAGINA`), e cada comentário NOVO de outra pessoa recebe UMA resposta privada
 * pelo Messenger — a Meta aceita uma por comentário, até 7 dias depois. Quando a pessoa responde, a conversa entra
 * no canal do Messenger pelo caminho de sempre e o agente ligado ao canal atende.
 *
 *   1. o canal vem do id da PÁGINA do aviso (nunca do corpo além disso);
 *   2. comentário da própria página é ignorado: senão a nossa resposta pública dispararia a regra em laço;
 *   3. só atende com `metadata.resposta_a_comentario.ativo` e um texto;
 *   4. registra ANTES de mandar: o índice único (canal, comentário) é a trava contra a reentrega do aviso;
 *   5. manda e grava o desfecho; falha vira `failed` com o motivo, e log.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { logger } from "@/lib/logger";

import { responderComentarioEmPrivado } from "./api";
import { sessaoDaPagina, tokenDaPagina } from "./paginas";

export interface ComentarioDaPagina {
  pageId: string;
  commentId: string;
  postId: string | null;
  autorId: string;
  texto: string;
}

const id = (v: unknown): string | null => (typeof v === "string" || typeof v === "number" ? String(v) : null);

/** Os comentários NOVOS de um aviso da página (`object: page`, campo `feed`). Edição, remoção e curtida ficam de fora. */
export function comentariosDaPagina(payload: unknown): ComentarioDaPagina[] {
  const p = payload as { object?: unknown; entry?: unknown } | null;
  if (!p || p.object !== "page" || !Array.isArray(p.entry)) return [];
  const saida: ComentarioDaPagina[] = [];
  for (const entrada of p.entry as Array<Record<string, unknown>>) {
    const pageId = id(entrada?.id);
    if (pageId === null || !Array.isArray(entrada.changes)) continue;
    for (const m of entrada.changes as Array<{ field?: unknown; value?: Record<string, unknown> }>) {
      const v = m?.value;
      if (m?.field !== "feed" || !v || v.item !== "comment" || v.verb !== "add") continue;
      const commentId = id(v.comment_id);
      const autorId = id((v.from as { id?: unknown } | undefined)?.id);
      if (commentId === null || autorId === null) continue;
      saida.push({ pageId, commentId, postId: id(v.post_id), autorId, texto: typeof v.message === "string" ? v.message : "" });
    }
  }
  return saida;
}

/** `channel_sessions.metadata.resposta_a_comentario`. Texto vazio ou ausente = desligado. */
export const configDaRespostaAComentario = z.object({
  ativo: z.boolean(),
  mensagem: z.string().trim().min(1).max(2000),
});
export type ConfigDaRespostaAComentario = z.infer<typeof configDaRespostaAComentario>;

export function lerConfigDaResposta(metadata: unknown): ConfigDaRespostaAComentario | null {
  const r = configDaRespostaAComentario.safeParse((metadata as { resposta_a_comentario?: unknown } | null)?.resposta_a_comentario);
  return r.success && r.data.ativo ? r.data : null;
}

export interface CanalDoComentario {
  id: string;
  organizationId: string;
  config: ConfigDaRespostaAComentario | null;
}

export interface DepsDoComentarioDaPagina {
  acharCanal(pageId: string): Promise<CanalDoComentario | null>;
  /** `null` = já registrado (reentrega da Meta): não responde de novo. */
  registrar(canal: CanalDoComentario, c: ComentarioDaPagina): Promise<{ id: string } | null>;
  enviar(canal: CanalDoComentario, c: ComentarioDaPagina, texto: string): Promise<void>;
  concluir(registroId: string, desfecho: { status: "sent" | "failed"; erro: string | null }): Promise<void>;
}

export type DesfechoDoComentario = "respondido" | "falhou" | "repetido" | "da_propria_pagina" | "desligado" | "sem_canal";

export async function atenderComentarioDaPagina(deps: DepsDoComentarioDaPagina, c: ComentarioDaPagina): Promise<DesfechoDoComentario> {
  if (c.autorId === c.pageId) return "da_propria_pagina";
  const canal = await deps.acharCanal(c.pageId);
  if (!canal) return "sem_canal";
  if (!canal.config) return "desligado";
  const registro = await deps.registrar(canal, c);
  if (!registro) return "repetido";
  try {
    await deps.enviar(canal, c, canal.config.mensagem);
    await deps.concluir(registro.id, { status: "sent", erro: null });
    return "respondido";
  } catch (err) {
    const erro = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    await deps.concluir(registro.id, { status: "failed", erro });
    logger.error("[messenger] resposta ao comentário da página não saiu", {
      organization_id: canal.organizationId,
      channel_session_id: canal.id,
      erro,
    });
    return "falhou";
  }
}

/** As pontas de verdade: o canal e o token da página, o registro e a resposta privada pela página. */
export function depsReaisDoComentarioDaPagina(admin: SupabaseClient): DepsDoComentarioDaPagina {
  return {
    async acharCanal(pageId) {
      const sessao = await sessaoDaPagina(admin, pageId);
      if (!sessao) return null;
      const { data, error } = await admin.from("channel_sessions").select("metadata").eq("id", sessao.id).maybeSingle();
      if (error) throw new Error(`messenger: leitura da configuração do canal falhou: ${error.message}`);
      return { ...sessao, config: lerConfigDaResposta((data as { metadata?: unknown } | null)?.metadata) };
    },
    async registrar(canal, c) {
      const { data, error } = await admin
        .from("messenger_comment_replies")
        .insert({
          organization_id: canal.organizationId,
          channel_session_id: canal.id,
          comment_id: c.commentId,
          post_id: c.postId,
          from_id: c.autorId,
          comment_text: c.texto.slice(0, 2000),
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") return null;
        throw new Error(`messenger: registro do comentário falhou: ${error.message}`);
      }
      return data as { id: string };
    },
    async enviar(canal, c, texto) {
      const token = await tokenDaPagina(admin, { organizationId: canal.organizationId, pageId: c.pageId });
      if (!token) throw new Error("token da página indisponível — reconecte a página");
      await responderComentarioEmPrivado(c.pageId, token, c.commentId, texto);
    },
    async concluir(registroId, desfecho) {
      const { error } = await admin
        .from("messenger_comment_replies")
        .update({ status: desfecho.status, error: desfecho.erro })
        .eq("id", registroId);
      if (error) throw new Error(`messenger: desfecho do comentário não foi gravado: ${error.message}`);
    },
  };
}
