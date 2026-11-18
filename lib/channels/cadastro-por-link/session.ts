/**
 * Persistência das sessões do link de cadastro — do lado de dentro do seam.
 * Toda consulta leva `organization_id` À MÃO (client de service role).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { metadataInicialDoCanal } from "@/lib/ai/elegibilidade/pre-go-live";

import { CHANNEL_PROVIDER_KAPSO } from "../capabilities";
import { reactivateChannelSession } from "../reactivate";

export interface SessaoKapso {
  id: string;
  phoneNumberId: string;
  wabaId: string | null;
  customerId: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  status: string | null;
  archivedAt: string | null;
  webhookId: string | null;
  webhookPathToken: string | null;
}

const COLUNAS =
  "id, kapso_phone_number_id, kapso_waba_id, kapso_customer_id, kapso_webhook_id, webhook_path_token, phone_number, display_name, status, archived_at";

function paraSessao(row: Record<string, unknown>): SessaoKapso {
  return {
    id: row.id as string,
    phoneNumberId: row.kapso_phone_number_id as string,
    wabaId: (row.kapso_waba_id as string) ?? null,
    customerId: (row.kapso_customer_id as string) ?? null,
    phoneNumber: (row.phone_number as string) ?? null,
    displayName: (row.display_name as string) ?? null,
    status: (row.status as string) ?? null,
    archivedAt: (row.archived_at as string) ?? null,
    webhookId: (row.kapso_webhook_id as string) ?? null,
    webhookPathToken: (row.webhook_path_token as string) ?? null,
  };
}

/** As sessões deste canal na organização, ativas primeiro. LANÇA se a consulta falhar. */
export async function sessoesKapso(admin: SupabaseClient, organizationId: string): Promise<SessaoKapso[]> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .eq("provider", CHANNEL_PROVIDER_KAPSO)
    .order("archived_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`kapso_session_lookup_failed: ${error.message}`);
  return ((data as Record<string, unknown>[] | null) ?? []).map(paraSessao);
}

/** Grava (ou ressuscita, se o número já foi desta organização) a sessão. */
export async function salvarSessaoKapso(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    existente: SessaoKapso | null;
    phoneNumberId: string;
    wabaId: string | null;
    customerId: string;
    /** `null` = reconexão do mesmo número: o webhook registrado continua valendo. */
    webhook: { id: string; pathToken: string; segredoCifrado: string } | null;
    phoneNumber: string | null;
    displayName: string;
    userId: string;
    requestId: string;
  },
): Promise<{ error: string | null; channelSessionId: string | null }> {
  const linha = {
    organization_id: input.organizationId,
    provider: CHANNEL_PROVIDER_KAPSO,
    kapso_phone_number_id: input.phoneNumberId,
    kapso_waba_id: input.wabaId,
    kapso_customer_id: input.customerId,
    ...(input.webhook
      ? {
          kapso_webhook_id: input.webhook.id,
          webhook_path_token: input.webhook.pathToken,
          webhook_secret_encrypted: input.webhook.segredoCifrado,
        }
      : {}),
    phone_number: input.phoneNumber,
    display_name: input.displayName,
    status: "WORKING",
  };

  if (input.existente) {
    const r = await reactivateChannelSession(
      admin,
      {
        organizationId: input.organizationId,
        channelSessionId: input.existente.id,
        archivedAt: input.existente.archivedAt,
      },
      linha,
      {
        userId: input.userId,
        requestId: input.requestId,
        metadata: { provider: CHANNEL_PROVIDER_KAPSO, phone_number: input.phoneNumber },
      },
    );
    return { error: r.error?.message ?? null, channelSessionId: input.existente.id };
  }

  const { data, error } = await admin
    .from("channel_sessions")
    .insert({ ...linha, metadata: metadataInicialDoCanal() })
    .select("id")
    .maybeSingle();
  return {
    error: error?.message ?? null,
    channelSessionId: (data as { id: string } | null)?.id ?? null,
  };
}

/** Número e conta que ESTA sessão atende — a entrada confere o evento contra eles. */
export async function refsDaSessaoKapso(
  admin: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
): Promise<{ phoneNumberId: string | null; wabaId: string | null }> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select("kapso_phone_number_id, kapso_waba_id")
    .eq("organization_id", organizationId)
    .eq("id", channelSessionId)
    .maybeSingle();
  if (error) throw new Error(`kapso_refs_lookup_failed: ${error.message}`);
  const row = data as { kapso_phone_number_id?: string | null; kapso_waba_id?: string | null } | null;
  return { phoneNumberId: row?.kapso_phone_number_id ?? null, wabaId: row?.kapso_waba_id ?? null };
}

