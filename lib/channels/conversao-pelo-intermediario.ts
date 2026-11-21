/**
 * A chave para reportar conversão de anúncio pelo intermediário, quando a conversa do contato passou por um
 * número dele. Mora aqui porque só a fronteira de canais nomeia o transporte; quem envia é
 * `lib/channels/zernio/conversoes.ts`, chamado pelo transporte da Meta quando a credencial traz `intermediario`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChaveDoIntermediario } from "@/lib/plataformas-de-anuncio/types";

import { zernioCredsForAccountId } from "./zernio/credentials";

/**
 * O número do intermediário da conversa mais recente do contato, com a chave para falar com ele. `null` = a
 * conversa não passou por um, ou a chave não está gravada (o envio segue para o pixel, como antes).
 * Medido em 21/11/2026: campanhas de "compra por mensagem" nesses números sem nenhuma compra no conjunto
 * de dados da conta, porque a venda caía aqui no pixel do site, sem o clique.
 */
export async function chaveDeConversaoDoIntermediario(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
): Promise<ChaveDoIntermediario | null> {
  const { data } = await admin
    .from("conversations")
    .select("last_message_at, channel_sessions!inner(provider, zernio_account_id)")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("channel_sessions.provider", "zernio")
    .not("channel_sessions.zernio_account_id", "is", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1);
  type Canal = { zernio_account_id: string | null };
  const linha = ((data ?? []) as unknown as Array<{ channel_sessions: Canal | Canal[] }>)[0];
  if (!linha) return null;
  const canal = Array.isArray(linha.channel_sessions) ? linha.channel_sessions[0] : linha.channel_sessions;
  if (!canal?.zernio_account_id) return null;
  const creds = await zernioCredsForAccountId(admin, { organizationId, accountId: canal.zernio_account_id });
  return creds ? { accountId: creds.accountId, apiKey: creds.apiKey, baseUrl: creds.baseUrl } : null;
}

