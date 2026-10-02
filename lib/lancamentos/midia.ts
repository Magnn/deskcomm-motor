/**
 * Onde mora a mídia de um disparo, e como ela vira uma URL que o WhatsApp baixa.
 *
 * O caminho é `{org}/launch-content/{lançamento}/…` no mesmo bucket das mensagens.
 * O prefixo é a cerca: um disparo só aceita arquivo que esteja debaixo do prefixo
 * do PRÓPRIO lançamento, na PRÓPRIA organização.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET_DA_MIDIA = "whatsapp-media";
/** Tempo de vida da URL assinada: o bastante para o WhatsApp baixar e converter um vídeo. */
const VALIDADE_DA_URL_S = 900;

export function prefixoDaMidiaDoLancamento(organizationId: string, launchId: string): string {
  return `${organizationId}/launch-content/${launchId}/`;
}

/** `null` quando o arquivo não existe ou o Storage recusou — quem chama falha a entrega com motivo. */
export async function urlAssinadaDaMidia(admin: SupabaseClient, storagePath: string): Promise<string | null> {
  const { data, error } = await admin.storage.from(BUCKET_DA_MIDIA).createSignedUrl(storagePath, VALIDADE_DA_URL_S);
  return error || !data?.signedUrl ? null : data.signedUrl;
}
