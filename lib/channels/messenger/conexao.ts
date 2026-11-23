/**
 * Conectar as páginas que a pessoa autorizou no login do Facebook.
 *
 *   token longo → páginas autorizadas → (webhook do app ligado) → para cada
 *   página: grava o canal → liga os avisos da página → marca WORKING ou FAILED.
 *
 * A página é escolhida NA TELA DA META (o consentimento lista as páginas e a
 * pessoa marca quais libera), então aqui não há segunda escolha: toda página
 * autorizada com permissão de mensagens vira canal.
 *
 * Falha de UMA página não derruba as outras — cada uma volta com o seu desfecho,
 * e a que não ligou os avisos aparece na tela com o motivo.
 *
 * O INSTAGRAM da página vem junto: página conectada com conta profissional
 * ligada → a conta vira canal (direct no inbox) e conexão de comentários (as
 * regras de "comentou, recebe direct"), as duas com o token da página. O webhook
 * do app para o objeto `instagram` é ligado uma vez, se houver conta. Falha no
 * Instagram não desfaz a página: ela segue atendendo no Messenger.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { salvarConexao } from "@/lib/channels/instagram/repositorio";
import { logger } from "@/lib/logger";

import {
  assinarAvisosDaPagina,
  assinarWebhookDoApp,
  assinarWebhookDoInstagram,
  contaDoInstagramDaPagina,
  listarPaginas,
  type ContaDoInstagramDaPagina,
  type PaginaAutorizada,
} from "./api";
import { gravarContaDoInstagram, gravarPagina, marcarEstadoDaPagina, type DesfechoDaPagina } from "./paginas";

export type ResultadoDaPagina = (
  | DesfechoDaPagina
  | { pageId: string; nome: string; resultado: "avisos_nao_ligados"; motivo: string }
) & { rede?: "messenger" | "instagram" };

export interface DepsDaConexao {
  listarPaginas: (token: string) => Promise<PaginaAutorizada[]>;
  assinarWebhookDoApp: () => Promise<void>;
  assinarAvisosDaPagina: (pageId: string, token: string) => Promise<void>;
  contaDoInstagram: (pageId: string, token: string) => Promise<ContaDoInstagramDaPagina | null>;
  assinarWebhookDoInstagram: () => Promise<"ligado" | "ja_estava" | "outro_endereco">;
  /** A conta nas regras de comentário (`instagram_connections`), falando pela página. */
  salvarConexaoDeComentarios: (input: {
    organizationId: string;
    userId: string;
    pagina: PaginaAutorizada;
    conta: ContaDoInstagramDaPagina;
  }) => Promise<void>;
}

export function depsReaisDaConexao(
  app: { appId: string; appSecret: string; verifyToken: string; callbackUrl: string },
  db: SupabaseClient,
): DepsDaConexao {
  return {
    listarPaginas: (token) => listarPaginas(token),
    assinarWebhookDoApp: () => assinarWebhookDoApp(app),
    assinarAvisosDaPagina: (pageId, token) => assinarAvisosDaPagina(pageId, token),
    contaDoInstagram: (pageId, token) => contaDoInstagramDaPagina(pageId, token),
    assinarWebhookDoInstagram: () => assinarWebhookDoInstagram(app),
    salvarConexaoDeComentarios: async ({ organizationId, userId, pagina, conta }) => {
      await salvarConexao(db, {
        organizationId,
        userId,
        // Na Graph do Facebook a conta tem UM id: é ele nos avisos e nas chamadas.
        conta: { id: conta.id, userId: conta.id, username: conta.username, name: conta.name, profilePictureUrl: conta.fotoUrl },
        token: pagina.accessToken,
        expiraEm: null,
        paginaId: pagina.id,
      });
    },
  };
}

export async function conectarPaginas(
  db: SupabaseClient,
  deps: DepsDaConexao,
  input: { organizationId: string; userId: string; tokenDoUsuario: string },
): Promise<ResultadoDaPagina[]> {
  const paginas = await deps.listarPaginas(input.tokenDoUsuario);
  if (paginas.length === 0) return [];

  // O webhook do APP é pré-requisito de toda página: sem ele, os avisos de cada
  // uma são ligados e nada chega. Idempotente; a falha não impede tentar as
  // páginas (o painel da Meta pode já ter o webhook cadastrado à mão).
  try {
    await deps.assinarWebhookDoApp();
  } catch (err) {
    logger.warn("[messenger] webhook do app não pôde ser ligado por aqui", {
      erro: err instanceof Error ? err.message.slice(0, 300) : String(err),
    });
  }

  const resultados: ResultadoDaPagina[] = [];
  let webhookDoInstagram: Promise<void> | null = null;
  for (const pagina of paginas) {
    const gravada = await gravarPagina(db, { organizationId: input.organizationId, userId: input.userId, pagina });
    if (gravada.resultado !== "conectada" && gravada.resultado !== "reconectada") {
      resultados.push({ ...gravada, rede: "messenger" });
      continue;
    }
    try {
      await deps.assinarAvisosDaPagina(pagina.id, pagina.accessToken);
      await marcarEstadoDaPagina(db, { organizationId: input.organizationId, channelSessionId: gravada.channelSessionId, ok: true });
      resultados.push({ ...gravada, rede: "messenger" });
    } catch (err) {
      const motivo = err instanceof Error ? err.message.slice(0, 300) : String(err);
      await marcarEstadoDaPagina(db, {
        organizationId: input.organizationId,
        channelSessionId: gravada.channelSessionId,
        ok: false,
        motivo,
      });
      resultados.push({ pageId: pagina.id, nome: pagina.name, resultado: "avisos_nao_ligados", motivo, rede: "messenger" });
      // Sem os avisos da página, o direct do Instagram dela também não chega.
      continue;
    }

    const conta = await deps.contaDoInstagram(pagina.id, pagina.accessToken);
    if (!conta) continue;
    webhookDoInstagram ??= deps.assinarWebhookDoInstagram().then(
      (r) => {
        if (r === "outro_endereco") {
          logger.warn(
            "[messenger] o webhook do Instagram deste app aponta para outro endereço — o direct da conta não chega aqui até alguém apontá-lo para o webhook do Messenger",
            { organization_id: input.organizationId },
          );
        }
      },
      (err) =>
        logger.warn("[messenger] webhook do Instagram não pôde ser ligado por aqui", {
          erro: err instanceof Error ? err.message.slice(0, 300) : String(err),
        }),
    );
    const doInstagram = await gravarContaDoInstagram(db, { organizationId: input.organizationId, userId: input.userId, pagina, conta });
    if (doInstagram.resultado === "conectada" || doInstagram.resultado === "reconectada") {
      await marcarEstadoDaPagina(db, { organizationId: input.organizationId, channelSessionId: doInstagram.channelSessionId, ok: true });
      try {
        await deps.salvarConexaoDeComentarios({ organizationId: input.organizationId, userId: input.userId, pagina, conta });
      } catch (err) {
        // A conta presa a outra organização nas regras de comentário não impede o
        // direct dela aqui; fica registrado.
        logger.warn("[messenger] a conta do Instagram não entrou nas regras de comentário", {
          organization_id: input.organizationId,
          erro: err instanceof Error ? err.message.slice(0, 300) : String(err),
        });
      }
    }
    resultados.push({ ...doInstagram, rede: "instagram" });
  }
  await webhookDoInstagram;
  return resultados;
}
