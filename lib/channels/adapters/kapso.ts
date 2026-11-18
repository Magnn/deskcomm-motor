/**
 * Adapter do segundo parceiro (link de cadastro) — o canal oficial com outro
 * endereço e outra autenticação.
 *
 * Mesmos caminhos e corpos da Cloud API, pelo proxy do provedor
 * (`kapsoMetaBase`), com a chave da INSTALAÇÃO no header `X-API-Key`. O corpo
 * sai das MESMAS funções do adapter oficial — duas cópias garantiriam que a
 * primeira correção de mídia faltasse num lado.
 *
 * Sem modelos aprovados por ora (`canManageTemplates: false`): fora da janela de
 * 24h a cadeia `before_send` segura a mensagem, como em qualquer canal da Meta.
 */
import { ErroDoKapso, chaveDoKapso, kapsoMetaBase, urlDaMidia } from "../cadastro-por-link/api";
import type { ChannelAdapter, ChannelHealth, ChannelTenantScope, OutboundEnvelope, RecipientInput } from "../types";
import { buttonsPayload, contactPayload, mediaPayload, toE164Digits } from "./meta-cloud";

const NAO_CONFIGURADO = "kapso_not_configured";

async function chaveOuLanca(): Promise<string> {
  const chave = await chaveDoKapso();
  if (!chave) throw new Error(`${NAO_CONFIGURADO}: a instalação não tem a chave do provedor.`);
  return chave;
}

async function postarMensagem(chave: string, phoneNumberId: string, corpo: Record<string, unknown>, timeoutMs: number) {
  const res = await fetch(`${kapsoMetaBase()}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { "X-API-Key": chave, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...corpo }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await res.json().catch(() => ({}))) as {
    messages?: { id?: string }[];
    error?: { code?: number; message?: string; error_data?: { details?: string } } | string;
  };
  if (!res.ok || body.error) {
    const e = body.error;
    const detalhe =
      typeof e === "string" ? e : (e?.error_data?.details ?? e?.message ?? `http_${res.status}`);
    const codigo = typeof e === "object" && e?.code ? e.code : res.status;
    throw new Error(`kapso_${codigo}: ${detalhe}`);
  }
  return body;
}

export const kapsoAdapter: ChannelAdapter = {
  provider: "kapso",

  resolveRecipient(input: RecipientInput): string | null {
    if (input.isGroup || !input.phoneNumber) return null;
    const digits = toE164Digits(input.phoneNumber);
    return digits.length > 0 ? digits : null;
  },

  /** `true` sempre, como o canal oficial: quem desiste é o `send`, lançando `kapso_not_configured`. */
  isConfigured(): boolean {
    return true;
  },

  async checkHealth(input: ChannelTenantScope & { sessionRef: string }): Promise<ChannelHealth> {
    const chave = await chaveDoKapso();
    if (!chave) return { reachable: false, status: null, detail: "chave_da_instalacao_ausente" };
    try {
      const res = await fetch(
        `${kapsoMetaBase()}/${encodeURIComponent(input.sessionRef)}?fields=display_phone_number,quality_rating`,
        { headers: { "X-API-Key": chave }, signal: AbortSignal.timeout(15_000) },
      );
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        return { reachable: true, status: "FAILED", detail: `http_${res.status}` };
      }
      if (!res.ok) return { reachable: true, status: "FAILED", detail: `http_${res.status}` };
      return { reachable: true, status: "WORKING", detail: null };
    } catch (err) {
      const detail = err instanceof Error ? err.message : "erro_desconhecido";
      return { reachable: false, status: null, detail: detail.slice(0, 200) };
    }
  },

  codes: {
    notConfigured: NAO_CONFIGURADO,
    sendFailed: "kapso_error",
    unknownError: "kapso_unknown",
  },

  async signalTyping(input): Promise<void> {
    if (!input.inboundExternalId) return;
    const chave = await chaveDoKapso();
    if (!chave) return;
    await postarMensagem(
      chave,
      input.sessionRef,
      { status: "read", message_id: input.inboundExternalId, typing_indicator: { type: "text" } },
      8_000,
    );
  },

  /** O ponteiro `meta-media:<id>` da ingestão, resolvido pelo proxy (URL com token embutido). */
  async fetchInboundMedia(input): Promise<{ buffer: Buffer; mime: string }> {
    const chave = await chaveOuLanca();
    const prefixo = "meta-media:";
    if (!input.url.startsWith(prefixo)) throw new Error("kapso_media_invalid_ref: ponteiro não reconhecido.");
    const mediaId = input.url.slice(prefixo.length);
    if (!/^[A-Za-z0-9._~-]+$/.test(mediaId)) throw new Error("kapso_media_invalid_ref: media_id inválido.");

    const midia = await urlDaMidia(chave, { mediaId, phoneNumberId: input.sessionRef }).catch((e: unknown) => {
      throw new Error(`kapso_media_lookup_failed: ${e instanceof ErroDoKapso ? e.message : String(e)}`);
    });
    // Anti-SSRF: a URL vem da resposta do provedor; só o host dele, só https.
    const alvo = new URL(midia.url);
    if (alvo.protocol !== "https:" || alvo.host !== new URL(kapsoMetaBase()).host) {
      throw new Error(`kapso_media_lookup_failed: host de mídia inesperado (${alvo.protocol}//${alvo.hostname}).`);
    }
    const download = await fetch(alvo.toString(), { signal: AbortSignal.timeout(30_000) });
    if (!download.ok) throw new Error(`kapso_media_download_failed: ${download.status}`);
    const buffer = Buffer.from(await download.arrayBuffer());
    const mime =
      download.headers.get("content-type")?.split(";")[0]?.trim() ||
      midia.mime ||
      input.hintMime ||
      "application/octet-stream";
    return { buffer, mime };
  },

  async send(envelope: OutboundEnvelope): Promise<{ externalId: string | null }> {
    const chave = await chaveOuLanca();
    const corpo =
      contactPayload(envelope) ??
      mediaPayload(envelope) ??
      buttonsPayload(envelope) ?? { type: "text", text: { body: envelope.body ?? "" } };
    await envelope.beforeSend?.();
    const body = await postarMensagem(
      chave,
      envelope.sessionRef,
      { recipient_type: "individual", to: envelope.to, ...corpo },
      30_000,
    );
    return { externalId: body.messages?.[0]?.id ?? null };
  },
};
