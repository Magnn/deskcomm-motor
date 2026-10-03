/**
 * Entrada do Messenger direto: aviso da página → contato, conversa, mensagem.
 *
 * A gravação é a MESMA do Messenger pelo intermediário (`../zernio/ingest.ts`,
 * pelo ramo de rede social): identidade `facebook:<página>:<pessoa>`, conversa
 * endereçada pela thread, idempotência por `(organization_id, external_id)`, e o
 * passo compartilhado de depois da entrada (lead, opt-out, agente, fluxo,
 * atribuição do anúncio). Duplicar aquilo aqui seria a cópia privada que já fez
 * um canal ficar sem os três efeitos uma vez.
 *
 * O que é só deste canal mora aqui:
 *   - achar a ORGANIZAÇÃO pela página (`entry.id`), porque o webhook é um só
 *     para o app inteiro;
 *   - ler o NOME de quem escreveu, que o aviso do Messenger não traz;
 *   - os desfechos de entrega (por `mid`) e de leitura (por marca d'água — a
 *     Meta diz "leu tudo até tal hora", não "leu a mensagem X").
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import { abrirArquivoDoWebhook, fecharArquivoDoWebhook } from "../arquivo-de-webhook";
import { CHANNEL_PROVIDER_MESSENGER } from "../capabilities";
import { ingestZernioInbound } from "../zernio/ingest";
import { lerPerfil } from "./api";
import { sessaoDaPagina, tokenDaPagina } from "./paginas";
import type { EventoDoMessenger } from "./parser";

export type DesfechoDoEvento =
  | { status: "ingested" | "duplicate"; conversationId?: string }
  | { status: "ignored"; reason: string };

/** O contato desta pessoa já existe nesta organização? (Decide se vale ler o perfil.) */
async function contatoExiste(db: SupabaseClient, organizationId: string, identidade: string): Promise<boolean> {
  const { data } = await db
    .from("contacts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("social_identity", identidade)
    .is("is_merged_into", null)
    .maybeSingle();
  return !!data;
}

/**
 * Um acontecimento, já roteado para a sessão da página. Lança só em falha de
 * ESCRITA — aí a reentrega da Meta é o que queremos.
 */
export async function ingerirEvento(
  db: SupabaseClient,
  sessao: { id: string; organizationId: string },
  evento: EventoDoMessenger,
): Promise<DesfechoDoEvento> {
  const { organizationId } = sessao;

  if (evento.tipo === "entregue") {
    const { data, error } = await db
      .from("messages")
      .update({ status: "delivered" })
      .eq("organization_id", organizationId)
      .eq("channel_session_id", sessao.id)
      .in("external_id", evento.externalIds)
      // Não rebaixa: um `delivered` atrasado não desfaz um `read`.
      .not("status", "in", "(read)")
      .select("id");
    if (error) throw new Error(`messenger: desfecho de entrega não gravado: ${error.message}`);
    return (data ?? []).length > 0 ? { status: "ingested" } : { status: "ignored", reason: "mensagem_desconhecida" };
  }

  if (evento.tipo === "lida") {
    const { data: conversa } = await db
      .from("conversations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("channel_session_id", sessao.id)
      .eq("provider_conversation_id", evento.psid)
      .maybeSingle();
    const conversationId = (conversa as { id: string } | null)?.id;
    if (!conversationId) return { status: "ignored", reason: "conversa_desconhecida" };
    const { error } = await db
      .from("messages")
      .update({ status: "read" })
      .eq("organization_id", organizationId)
      .eq("conversation_id", conversationId)
      .eq("direction", "outbound")
      .in("status", ["sent", "delivered"])
      .lte("created_at", evento.ate);
    if (error) throw new Error(`messenger: desfecho de leitura não gravado: ${error.message}`);
    return { status: "ingested", conversationId };
  }

  const mensagem = { ...evento.mensagem, identity: { ...evento.mensagem.identity } };
  // Só a ENTRADA de quem ainda não é contato paga a leitura do perfil: depois
  // disso o nome já está gravado, e ler a cada mensagem seria uma chamada à Meta
  // por mensagem sem ganho nenhum.
  const identidade = `facebook:${mensagem.accountId}:${mensagem.participantId}`;
  if (!(await contatoExiste(db, organizationId, identidade))) {
    const token = await tokenDaPagina(db, { organizationId, pageId: evento.pageId });
    if (token) {
      try {
        const perfil = await lerPerfil(mensagem.participantId, token);
        mensagem.identity.displayName = perfil.nome;
      } catch (err) {
        // Sem nome o contato nasce mesmo assim (o atendimento não pode esperar o
        // perfil); o nome entra quando alguém o editar.
        logger.warn("[messenger] perfil de quem escreveu não pôde ser lido", {
          organization_id: organizationId,
          erro: err instanceof Error ? err.message.slice(0, 200) : String(err),
        });
      }
    }
  }

  const r = await ingestZernioInbound(db, {
    organizationId,
    channelSessionId: sessao.id,
    payload: null,
    socialMessage: mensagem,
  });
  if (r.status === "ingested" || r.status === "duplicate") return { status: r.status, conversationId: r.conversationId };
  return { status: "ignored", reason: r.reason ?? r.status };
}

/**
 * Um corpo de aviso inteiro. Cada página do corpo é roteada para a SUA sessão;
 * página que não é canal de ninguém aqui é ignorada (a Meta ainda pode entregar
 * por alguns minutos depois de a página ser desconectada).
 */
export async function ingerirAviso(
  db: SupabaseClient,
  input: { rawBody: string; headers: Headers; eventos: EventoDoMessenger[] },
): Promise<{ processados: number; ignorados: number }> {
  const porPagina = new Map<string, EventoDoMessenger[]>();
  for (const e of input.eventos) porPagina.set(e.pageId, [...(porPagina.get(e.pageId) ?? []), e]);

  let processados = 0;
  let ignorados = 0;
  let falha: Error | null = null;

  for (const [pageId, eventos] of porPagina) {
    const sessao = await sessaoDaPagina(db, pageId);
    if (!sessao) {
      ignorados += eventos.length;
      continue;
    }
    // O corpo cru vai para o arquivo ANTES de processar: se o processo morrer no
    // meio, é justamente aí que alguém vai querer lê-lo.
    const arquivo = await abrirArquivoDoWebhook(db, {
      organizationId: sessao.organizationId,
      channelSessionId: sessao.id,
      provider: CHANNEL_PROVIDER_MESSENGER,
      rawBody: input.rawBody,
      headers: input.headers,
    });
    let erroDaPagina: string | null = null;
    for (const evento of eventos) {
      try {
        const r = await ingerirEvento(db, sessao, evento);
        if (r.status === "ignored") ignorados += 1;
        else processados += 1;
      } catch (err) {
        erroDaPagina = err instanceof Error ? err.message : String(err);
        falha = err instanceof Error ? err : new Error(erroDaPagina);
        logger.error("[messenger] evento não pôde ser gravado", {
          organization_id: sessao.organizationId,
          channel_session_id: sessao.id,
          erro: erroDaPagina.slice(0, 300),
        });
      }
    }
    await fecharArquivoDoWebhook(db, arquivo, {
      status: erroDaPagina ? "error" : "processed",
      validSignature: true,
      erro: erroDaPagina,
    });
  }

  // Falha de ESCRITA sobe: a rota responde 500 e a Meta reentrega o corpo. Os
  // eventos que já entraram voltam como repetidos (idempotência por `mid`).
  if (falha) throw falha;
  return { processados, ignorados };
}
