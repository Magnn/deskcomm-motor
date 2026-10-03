/**
 * Como uma campanha acha as pessoas por ESTE canal — pelo telefone, ou pela
 * conversa que cada uma começou.
 *
 * Mora em `lib/channels/` porque lê as colunas do provedor da sessão; quem monta
 * a campanha recebe a resposta pronta e não pergunta qual canal é.
 *
 * No canal por conversa a pessoa é a IDENTIDADE dela dentro da conta conectada
 * (`<rede>:<conta>:<pessoa>`, o que a entrada do canal grava em
 * `contacts.social_identity`). O prefixo `<rede>:<conta>:` é o que separa quem
 * falou com ESTA conta de quem falou com outra da mesma rede.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { capabilitiesOf, transportaMensagem } from "./capabilities";
import { CHANNEL_SESSION_REF_COLUMNS, resolveSessionRef, type ChannelSessionRef } from "./session-ref";
import type { ChannelProvider } from "./types";

export type EnderecoDoCanal =
  | { tipo: "telefone" }
  | {
      tipo: "conversa";
      /** `<rede>:<conta>:` — o começo da identidade de quem falou com esta conta. */
      prefixo: string;
      /** O canal deixa falar a qualquer hora? `false` = só dentro da janela de 24h da plataforma. */
      semJanela: boolean;
    };

export async function enderecoDoCanal(
  db: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
): Promise<EnderecoDoCanal | null> {
  const { data, error } = await db
    .from("channel_sessions")
    .select(`${CHANNEL_SESSION_REF_COLUMNS}, metadata`)
    .eq("organization_id", organizationId)
    .eq("id", channelSessionId)
    .maybeSingle();
  if (error) throw new Error(`canal: leitura do endereço falhou: ${error.message}`);
  const sessao = data as (ChannelSessionRef & { metadata: Record<string, unknown> | null }) | null;
  if (!sessao || !transportaMensagem(sessao.provider)) return null;

  const caps = capabilitiesOf(sessao.provider as ChannelProvider);
  if (caps.enderecamento === "telefone") return { tipo: "telefone" };

  const rede = typeof sessao.metadata?.social_platform === "string" ? sessao.metadata.social_platform : null;
  const conta = resolveSessionRef(sessao);
  if (!rede || !conta) return null;
  return { tipo: "conversa", prefixo: `${rede}:${conta}:`, semJanela: caps.freeformOutsideWindow };
}
