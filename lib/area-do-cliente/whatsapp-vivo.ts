/**
 * O WhatsApp do botão da área, VIVO. O número fica na configuração da área, e quando ele cai o botão
 * continuava mandando o cliente para um número que não recebe nada (medido em 16/11/2026: a área
 * apontava para um número caído desde o dia anterior). Número configurado fora do ar → um dos números
 * conectados com agente (o mesmo sorteio do rodízio da captura). Sem nenhum vivo, fica o configurado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATUS_SAUDAVEL } from "@/lib/channels/health";
import { numerosDoRodizio, sortearNumero } from "@/lib/plataformas-de-anuncio/rodizio-de-numeros";

/** Pura: o configurado se estiver vivo (ou se não houver alternativa); senão, um dos vivos. */
export function escolherWhatsappDaArea(
  configurado: string | undefined,
  configuradoVivo: boolean,
  vivos: readonly string[],
  aleatorio: () => number = Math.random,
): string | undefined {
  if (!configurado || configuradoVivo || vivos.length === 0) return configurado;
  return sortearNumero(vivos, aleatorio) ?? configurado;
}

export async function whatsappVivoDaArea(admin: SupabaseClient, organizationId: string, configurado: string | undefined): Promise<string | undefined> {
  if (!configurado) return configurado;
  const { data, error } = await admin
    .from("channel_sessions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone_number", configurado)
    .eq("status", STATUS_SAUDAVEL)
    .is("archived_at", null)
    .limit(1);
  // Leitura falhou: não troca às cegas, fica o configurado.
  if (error) return configurado;
  const vivo = (data ?? []).length > 0;
  return escolherWhatsappDaArea(configurado, vivo, vivo ? [] : await numerosDoRodizio(admin, organizationId));
}
