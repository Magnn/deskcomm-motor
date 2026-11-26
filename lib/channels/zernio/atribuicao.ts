/**
 * O clique de anúncio de uma conversa nova, buscado na API quando o webhook não o traz.
 *
 * Medido em 26/11/2026: das 8 conversas novas de um dia num número deste canal, 7 abriram com a
 * mensagem pronta do anúncio e nenhuma ganhou origem de anúncio. O provider guarda o clique na
 * CONVERSA (`GET /v1/inbox/conversations/{id}` → `metadata.ctwa_clid`, `ctwa_source_id`…), não na
 * mensagem. Sem a origem, a venda dessa pessoa saía como `sem_atribuicao` e não chegava à Meta, e a
 * campanha de "compra por mensagem" do número otimizava sem nenhuma compra.
 *
 * Uma chamada só, e só no NASCIMENTO da conversa (a origem é de primeiro toque: depois disso não
 * muda nada). Nunca derruba a ingestão: sem a origem a mensagem entra como entrava.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { extrairAtribuicaoMeta } from "@/lib/channels/atribuicao-de-anuncio-oficial";
import { logger } from "@/lib/logger";

import { resolveZernioCreds } from "./credentials";
import { referralDaConversa, type ZernioInboundMessage } from "./webhook";

const TEMPO_LIMITE_MS = 4_000;

export async function completarAtribuicaoDaConversa(
  admin: SupabaseClient,
  organizationId: string,
  msg: ZernioInboundMessage,
  buscar: typeof fetch = fetch,
): Promise<ZernioInboundMessage> {
  if (msg.kind !== "message" || msg.direction !== "inbound" || !msg.accountId) return msg;
  if (extrairAtribuicaoMeta(msg.referral)) return msg;
  try {
    const creds = await resolveZernioCreds(admin, { organizationId, accountId: msg.accountId });
    if (!creds) return msg;
    const url =
      `${creds.baseUrl}/v1/inbox/conversations/${encodeURIComponent(msg.conversationId)}` +
      `?accountId=${encodeURIComponent(creds.accountId)}`;
    const res = await buscar(url, {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!res.ok) throw new Error(`zernio_${res.status}`);
    const json = (await res.json().catch(() => null)) as { data?: unknown } | null;
    const conversa = json?.data && typeof json.data === "object" ? (json.data as Record<string, unknown>) : null;
    const referral = referralDaConversa(conversa);
    return referral ? { ...msg, referral } : msg;
  } catch (err) {
    logger.warn("zernio: origem de anúncio da conversa não lida — mensagem entra sem ela", {
      organization_id: organizationId,
      detail: err instanceof Error ? err.message : String(err),
    });
    return msg;
  }
}
