/**
 * A chave do provedor de voz desta ORGANIZAÇÃO.
 *
 * Mesma tabela e mesma decifragem do resto do produto (`ai_provider_credentials`,
 * ver `lib/ai/agents.ts › resolverChaveOpenAiDaVoz`, que faz o mesmo para a
 * ligação). Ordem: credencial ATIVA e VALIDADA da organização — a mais antiga,
 * de propósito: com duas chaves e nenhuma escolha explícita, "a mais recente"
 * variaria sozinha no dia em que alguém cadastra uma segunda — e depois a chave
 * do `.env` do servidor. Sem nenhuma das duas: `null`.
 *
 * NUNCA lança por causa da chave: falha de leitura/decifragem vira `null`, e o
 * turno segue em texto. Também não ecoa detalhe da credencial em log.
 */
import { byteaToBuffer, decryptKey } from "@/lib/crypto/aes_gcm";
import { createAdminClient } from "@/lib/supabase/admin";

import type { IdDeProvedorDeVoz } from "./tipos";

const VARIAVEL_DE_AMBIENTE: Record<IdDeProvedorDeVoz, string> = {
  openai: "OPENAI_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
};

/** A credencial ATIVA e VALIDADA mais antiga da organização para o provedor, ou `null`. Nunca lança. */
async function chaveDaOrganizacao(organizationId: string, provedor: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient()
      .from("ai_provider_credentials")
      .select("api_key_encrypted, api_key_iv, api_key_tag")
      .eq("organization_id", organizationId)
      .eq("provider", provedor)
      .eq("is_active", true)
      .not("validated_at", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) {
      return decryptKey({
        ciphertext: byteaToBuffer(data.api_key_encrypted),
        iv: byteaToBuffer(data.api_key_iv),
        tag: byteaToBuffer(data.api_key_tag),
      });
    }
  } catch {
    // quem chama cai para o ambiente, ou para `null`
  }
  return null;
}

export async function resolverChaveDeVoz(
  organizationId: string,
  provedor: IdDeProvedorDeVoz,
): Promise<string | null> {
  const daOrganizacao = await chaveDaOrganizacao(organizationId, provedor);
  if (daOrganizacao) return daOrganizacao;
  const doAmbiente = process.env[VARIAVEL_DE_AMBIENTE[provedor]];
  return doAmbiente && doAmbiente.trim() !== "" ? doAmbiente : null;
}

/**
 * A chave do Google DESTA organização, para a segunda reserva da transcrição
 * (`googleTranscriptionProvider`). Só a da organização: o áudio do cliente dela não sai para uma
 * conta do Google que ela não cadastrou.
 */
export async function resolverChaveDoGoogleParaOuvir(organizationId: string): Promise<string | null> {
  return chaveDaOrganizacao(organizationId, "google");
}
