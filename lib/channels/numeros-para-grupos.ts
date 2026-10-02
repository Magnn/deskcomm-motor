/**
 * QUAIS NÚMEROS FAZEM GRUPO — e com qual sessão o servidor fala com eles.
 *
 * Grupo de WhatsApp só existe no número conectado por QR code: a API oficial da
 * Meta não cria grupo nem manda mensagem para um. O módulo de lançamentos
 * (`lib/lancamentos/`) pergunta AQUI quais números servem e qual é a sessão de
 * cada um — o nome do provedor e o da coluna de sessão não saem de `lib/channels/`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { CHANNEL_PROVIDER_WAHA } from "./capabilities";

export interface NumeroParaGrupos {
  id: string;
  nome: string;
  telefone: string | null;
  /** O número está conectado agora? Só conectado ele cria grupo e dispara. */
  conectado: boolean;
}

/** O que o lançamento precisa para falar com o WhatsApp deste número. */
export interface SessaoDeGrupos {
  channelSessionId: string;
  sessionName: string;
  conectado: boolean;
}

type Linha = {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  status: string | null;
  waha_session_name: string | null;
};

const COLUNAS = "id, display_name, phone_number, status, waha_session_name";

/** Os números da empresa que podem ter grupos (conectados por QR code, não excluídos). */
export async function listarNumerosParaGrupos(db: SupabaseClient, organizationId: string): Promise<NumeroParaGrupos[]> {
  const { data, error } = await db
    .from("channel_sessions")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .eq("provider", CHANNEL_PROVIDER_WAHA)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`lançamentos: leitura dos números falhou: ${error.message}`);
  return ((data ?? []) as Linha[])
    .filter((l) => l.waha_session_name)
    .map((l) => ({
      id: l.id,
      nome: l.display_name?.trim() || l.phone_number || "Número sem nome",
      telefone: l.phone_number,
      conectado: l.status === "WORKING",
    }));
}

/** A sessão de UM número da empresa — `null` quando ele não existe, não é da empresa ou não faz grupo. */
export async function lerSessaoDeGrupos(
  db: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
): Promise<SessaoDeGrupos | null> {
  const { data, error } = await db
    .from("channel_sessions")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .eq("id", channelSessionId)
    .eq("provider", CHANNEL_PROVIDER_WAHA)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(`lançamentos: leitura da sessão falhou: ${error.message}`);
  const l = data as Linha | null;
  if (!l?.waha_session_name) return null;
  return { channelSessionId: l.id, sessionName: l.waha_session_name, conectado: l.status === "WORKING" };
}
