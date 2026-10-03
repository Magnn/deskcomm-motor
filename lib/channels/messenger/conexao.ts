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
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import {
  assinarAvisosDaPagina,
  assinarWebhookDoApp,
  listarPaginas,
  type PaginaAutorizada,
} from "./api";
import { gravarPagina, marcarEstadoDaPagina, type DesfechoDaPagina } from "./paginas";

export type ResultadoDaPagina = DesfechoDaPagina | { pageId: string; nome: string; resultado: "avisos_nao_ligados"; motivo: string };

export interface DepsDaConexao {
  listarPaginas: (token: string) => Promise<PaginaAutorizada[]>;
  assinarWebhookDoApp: () => Promise<void>;
  assinarAvisosDaPagina: (pageId: string, token: string) => Promise<void>;
}

export function depsReaisDaConexao(app: {
  appId: string;
  appSecret: string;
  verifyToken: string;
  callbackUrl: string;
}): DepsDaConexao {
  return {
    listarPaginas: (token) => listarPaginas(token),
    assinarWebhookDoApp: () => assinarWebhookDoApp(app),
    assinarAvisosDaPagina: (pageId, token) => assinarAvisosDaPagina(pageId, token),
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
  for (const pagina of paginas) {
    const gravada = await gravarPagina(db, { organizationId: input.organizationId, userId: input.userId, pagina });
    if (gravada.resultado !== "conectada" && gravada.resultado !== "reconectada") {
      resultados.push(gravada);
      continue;
    }
    try {
      await deps.assinarAvisosDaPagina(pagina.id, pagina.accessToken);
      await marcarEstadoDaPagina(db, { organizationId: input.organizationId, channelSessionId: gravada.channelSessionId, ok: true });
      resultados.push(gravada);
    } catch (err) {
      const motivo = err instanceof Error ? err.message.slice(0, 300) : String(err);
      await marcarEstadoDaPagina(db, {
        organizationId: input.organizationId,
        channelSessionId: gravada.channelSessionId,
        ok: false,
        motivo,
      });
      resultados.push({ pageId: pagina.id, nome: pagina.name, resultado: "avisos_nao_ligados", motivo });
    }
  }
  return resultados;
}
