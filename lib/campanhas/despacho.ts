/**
 * O DESPACHO do conteúdo de uma campanha para UMA pessoa — texto, modelo
 * aprovado ou fluxo. Um caminho só, usado pela rodada e pelo envio de teste: a
 * campanha que testa de um jeito e dispara de outro é a que passa no teste e
 * falha no disparo.
 *
 *   text     → `sendMessageHandler` com o texto já renderizado;
 *   template → `sendMessageHandler` com `type: "template"`: quem escolhe o
 *              transporte e monta os componentes é o canal, como no envio de
 *              modelo pelo inbox. O `body` é o texto que a CONVERSA mostra (a
 *              prévia guardada na campanha, ou o nome do modelo) — o schema do
 *              envio o exige, e sem ele o pedido morre antes do transporte;
 *   flow     → `enrollFollowupFlow`, com a fronteira de atendimento do NÚMERO
 *              que o rodízio escolheu: o fluxo sai por esse número. A campanha
 *              não manda mensagem — quem manda, com ritmo e janela próprios, é
 *              o fluxo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import type { ServiceBoundary } from "@/lib/atendimento/fronteira";
import { enrollFollowupFlow } from "@/lib/followup/enroll";

import type { ConteudoDaCampanha } from "./conteudo";

export type DesfechoDoDespacho =
  /** Uma mensagem saiu (ou falhou) — o estado vem da linha da mensagem. */
  | { via: "mensagem"; falhou: boolean; status: string; messageId: string | null }
  /** A pessoa entrou no fluxo (ou o fluxo recusou, com o motivo). */
  | { via: "fluxo"; falhou: boolean; motivo: string | null };

export interface PedidoDeDespacho {
  organizationId: string;
  contactId: string;
  boundary: ServiceBoundary;
  conteudo: ConteudoDaCampanha;
  /** Renderiza as variáveis da campanha (`{nome}`, saudação) para ESTA pessoa, AGORA. */
  renderizar: (texto: string) => string;
  /** O texto que a conversa mostra quando o conteúdo é um modelo. */
  previaDoModelo: string | null;
  ator: string;
  requestId: string;
  /** Id da mensagem escolhido por quem chama (idempotência da rodada). */
  internalMessageId?: string;
  metadata: Record<string, unknown>;
}

export interface DepsDoDespacho {
  enviar: typeof sendMessageHandler;
  inscrever: typeof enrollFollowupFlow;
}

export const DEPS_REAIS_DO_DESPACHO: DepsDoDespacho = { enviar: sendMessageHandler, inscrever: enrollFollowupFlow };

export async function despacharConteudo(
  admin: SupabaseClient,
  p: PedidoDeDespacho,
  deps: DepsDoDespacho = DEPS_REAIS_DO_DESPACHO,
): Promise<DesfechoDoDespacho> {
  if (p.conteudo.kind === "flow") {
    const r = await deps.inscrever(admin, {
      organizationId: p.organizationId,
      pointerId: p.conteudo.fluxoId,
      contactId: p.contactId,
      actorUserId: null,
      requestId: p.requestId,
      resolveServiceBoundary: async () => p.boundary,
    });
    return r.ok ? { via: "fluxo", falhou: false, motivo: null } : { via: "fluxo", falhou: true, motivo: `${r.code}: ${r.message}`.slice(0, 300) };
  }

  const contexto = {
    organization_id: p.organizationId,
    serviceBoundary: p.boundary,
    proactiveContext: { organizationId: p.organizationId, contactId: p.contactId },
    actor: { type: "webhook_source", id: p.ator },
    requestId: p.requestId,
    ...(p.internalMessageId ? { internalMessageId: p.internalMessageId } : {}),
  } as Parameters<typeof sendMessageHandler>[1];

  const corpo =
    p.conteudo.kind === "text"
      ? { type: "text" as const, body: p.renderizar(p.conteudo.corpo) }
      : {
          type: "template" as const,
          template_name: p.conteudo.nome,
          template_language: p.conteudo.idioma,
          template_values: Object.fromEntries(Object.entries(p.conteudo.valores).map(([k, v]) => [k, p.renderizar(v)])),
          body: p.renderizar((p.previaDoModelo ?? "").trim() || p.conteudo.nome),
        };

  const mensagem = await deps.enviar(admin, contexto, {
    conversation_id: p.boundary.conversation_id,
    ...corpo,
    metadata: p.metadata,
  } as Parameters<typeof sendMessageHandler>[2]);

  const status = (mensagem as { status?: string }).status ?? "desconhecido";
  return { via: "mensagem", falhou: status === "failed", status, messageId: (mensagem as { id?: string }).id ?? null };
}
