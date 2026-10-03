/**
 * Adapter do Messenger direto — traduz o envelope do CRM para a Send API da
 * página, e nada mais.
 *
 * Janela de 24h, ritmo, opt-out: tudo da cadeia `before_send` (doutrina
 * `restricao-de-canal.md`). Quem quiser saber o que o canal permite pergunta a
 * `capabilitiesOf`.
 *
 * ─── O endereço ─────────────────────────────────────────────────────────────
 * Como no Messenger pelo intermediário, quem endereça é a THREAD, não o contato:
 * aqui ela é o PSID (id da pessoa dentro desta página), que chega pelo webhook e
 * fica em `conversations.provider_conversation_id`. Sem ele não há envio — a
 * página só fala com quem já falou com ela.
 *
 * ─── Legenda ────────────────────────────────────────────────────────────────
 * O Messenger não tem legenda em anexo. Anexo com legenda sai em DUAS mensagens
 * (anexo, depois o texto); o id devolvido é o do anexo, que é a linha gravada.
 * O eco da segunda volta com o `app_id` do nosso app e é descartado pelo parser
 * — sem isso ele pareceria resposta manual e pausaria a IA.
 */
import { MAX_MEDIA_BYTES, MediaTooLargeError } from "@/lib/messaging/media/types";
import { assertDestinoResolvidoSeguro } from "@/lib/automation/outbound-ip";
import { assertSafeOutboundUrl } from "@/lib/automation/outbound-url";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

import { CHANNEL_PROVIDER_MESSENGER } from "../capabilities";
import type { ChannelAdapter, OutboundKind } from "../types";
import { avisosLigados, enviarMensagem, MessengerApiError, sinalizarDigitando, type TipoDeAnexo } from "./api";
import { tokenDaPagina } from "./paginas";
import { externalIdDoMessenger } from "./parser";

const TIPO_DO_ANEXO: Partial<Record<OutboundKind, TipoDeAnexo>> = {
  image: "image",
  video: "video",
  audio: "audio",
  document: "file",
  // Figurinha vira imagem: o Messenger não aceita figurinha enviada por app.
  sticker: "image",
};

async function token(organizationId: string, pageId: string): Promise<string> {
  const t = await tokenDaPagina(createAdminClient(), { organizationId, pageId });
  if (!t) throw new Error("Reconecte esta página em Conexões › Messenger.");
  return t;
}

/** A frase que quem atende lê quando a Meta recusa. */
function motivoDaRecusa(err: unknown): Error {
  if (!(err instanceof MessengerApiError)) return err instanceof Error ? err : new Error(String(err));
  // 10 / 2018278 = fora da janela de 24h; 551 = a pessoa não está disponível.
  if (err.codigo === 10 || /outside of allowed window/i.test(err.detalhe)) {
    return new Error("Passou de 24h desde a última mensagem desta pessoa: o Messenger só deixa responder depois que ela escrever de novo.");
  }
  if (err.codigo === 551) return new Error("Esta pessoa não está disponível no Messenger agora.");
  if (err.codigo === 190) return new Error("O acesso à página expirou ou foi revogado. Reconecte a página em Conexões › Messenger.");
  return new Error(`O Messenger recusou o envio: ${err.detalhe}`);
}

export const messengerAdapter: ChannelAdapter = {
  provider: CHANNEL_PROVIDER_MESSENGER,
  // O endereço é a thread guardada na conversa (o PSID), nunca um telefone.
  resolveRecipient: (input) => (input.isGroup ? null : "provider-thread"),
  // A credencial é da PÁGINA (na linha do canal), não do ambiente: se a linha
  // existe, há o que tentar. A falta do token aparece no envio, com a frase certa.
  isConfigured: () => true,
  codes: {
    notConfigured: "messenger_not_configured",
    sendFailed: "messenger_send_failed",
    unknownError: "messenger_unknown_error",
  },

  async send(envelope) {
    const psid = envelope.providerConversationId;
    if (!psid) throw new Error("Aguarde uma mensagem da pessoa para responder pelo Messenger.");
    const pageId = envelope.sessionRef;
    const tokenDaPaginaAberto = await token(envelope.organizationId, pageId);

    const tipo = envelope.media ? TIPO_DO_ANEXO[envelope.kind] : undefined;
    if (envelope.media && !tipo) throw new Error("Este tipo de mensagem ainda não é suportado no Messenger.");
    if (!envelope.media && envelope.kind !== "text") {
      throw new Error("Este tipo de mensagem ainda não é suportado no Messenger.");
    }

    await envelope.beforeSend?.();
    try {
      if (envelope.media && tipo) {
        const mid = await enviarMensagem({
          pageId,
          tokenDaPagina: tokenDaPaginaAberto,
          psid,
          conteudo: { anexo: { tipo, url: envelope.media.url } },
          respondeA: envelope.replyToExternalId ?? null,
        });
        const legenda = envelope.media.caption?.trim();
        if (legenda) {
          await enviarMensagem({ pageId, tokenDaPagina: tokenDaPaginaAberto, psid, conteudo: { texto: legenda } });
        }
        return { externalId: externalIdDoMessenger(pageId, mid) };
      }
      const mid = await enviarMensagem({
        pageId,
        tokenDaPagina: tokenDaPaginaAberto,
        psid,
        conteudo: { texto: envelope.body ?? "" },
        respondeA: envelope.replyToExternalId ?? null,
      });
      return { externalId: externalIdDoMessenger(pageId, mid) };
    } catch (err) {
      throw motivoDaRecusa(err);
    }
  },

  async sendTemplate() {
    throw new Error("O Messenger não usa modelos de WhatsApp.");
  },

  async signalTyping(input) {
    // O PSID mora na conversa (thread), não no contato: sem ele não há a quem
    // sinalizar, e o indicador é decoração — sai calado.
    const psid = input.providerConversationId;
    if (!psid) return;
    await sinalizarDigitando({
      pageId: input.sessionRef,
      tokenDaPagina: await token(input.organizationId, input.sessionRef),
      psid,
    });
  },

  async checkHealth(input) {
    const t = await tokenDaPagina(createAdminClient(), { organizationId: input.organizationId, pageId: input.sessionRef });
    if (!t) return { reachable: true, status: "FAILED", detail: "credencial_indisponivel" };
    const appId = (env.META_APP_ID ?? "").trim();
    if (!appId) return { reachable: true, status: "FAILED", detail: "app_nao_configurado" };
    try {
      return (await avisosLigados(input.sessionRef, t, appId))
        ? { reachable: true, status: "WORKING", detail: null }
        : { reachable: true, status: "FAILED", detail: "recebimento_nao_configurado" };
    } catch (err) {
      if (err instanceof MessengerApiError && err.status > 0) {
        return { reachable: true, status: "FAILED", detail: err.codigo === 190 ? "acesso_revogado" : "pagina_requer_atencao" };
      }
      return { reachable: false, status: null, detail: "provedor_indisponivel" };
    }
  },

  /**
   * A mídia que a pessoa mandou. A URL do anexo é da CDN da Meta, pública e
   * assinada por tempo — não leva token nenhum (mandar o token da página para
   * uma CDN seria entregá-lo a quem não precisa). Redirect recusado, tamanho
   * com teto, destino conferido contra rede interna.
   */
  async fetchInboundMedia(input) {
    const url = new URL(input.url);
    assertSafeOutboundUrl(url.toString());
    await assertDestinoResolvidoSeguro(url.hostname);
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Falha ao baixar mídia (HTTP ${response.status}).`);
    if (Number(response.headers.get("content-length") ?? 0) > MAX_MEDIA_BYTES) {
      await response.body?.cancel();
      throw new MediaTooLargeError();
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("A mídia retornou um corpo vazio.");
    const pedacos: Uint8Array[] = [];
    let tamanho = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        tamanho += value.byteLength;
        if (tamanho > MAX_MEDIA_BYTES) {
          await reader.cancel();
          throw new MediaTooLargeError();
        }
        pedacos.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return {
      buffer: Buffer.concat(pedacos),
      mime: response.headers.get("content-type")?.split(";")[0] ?? input.hintMime ?? "application/octet-stream",
    };
  },
};
