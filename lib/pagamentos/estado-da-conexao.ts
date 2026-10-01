import type { SupabaseClient } from "@supabase/supabase-js";

export interface EstadoDaCobranca {
  conectada: boolean;
  /** Booleano derivado: a chave nunca chega à tela. */
  temChave: boolean;
  habilitada: boolean;
  ambiente: "production" | "sandbox";
}

export async function lerEstadoDaCobranca(admin: SupabaseClient, organizationId: string): Promise<EstadoDaCobranca> {
  const { data } = await admin
    .from("payment_gateway_connections")
    // A chave cifrada NÃO entra no select: o que não é lido não vaza por descuido de quem serializar depois.
    .select("enabled, environment, api_key_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", "asaas")
    .maybeSingle();
  const linha = data as { enabled: boolean; environment: string; api_key_encrypted: string | null } | null;
  return {
    conectada: Boolean(linha),
    temChave: Boolean(linha?.api_key_encrypted),
    habilitada: linha?.enabled ?? false,
    ambiente: linha?.environment === "sandbox" ? "sandbox" : "production",
  };
}
