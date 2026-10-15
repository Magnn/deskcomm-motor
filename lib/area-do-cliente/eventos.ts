/**
 * O RASTRO da área do cliente — uma linha em `area_eventos` por coisa que a
 * pessoa fez. É daqui que sai o painel: onde ela para, o que abre, o que
 * deseja e o que compra.
 *
 * Fire-and-forget: falhar ao registrar nunca derruba a página que a pessoa
 * está vendo. A falha vai para o log, não para a tela.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import type { TipoDeEventoDaArea } from "./vocabulario";

export interface EventoDaArea {
  organizationId: string;
  contactId: string;
  tipo: TipoDeEventoDaArea;
  sessaoId?: string | null;
  servicoId?: string | null;
  /** Qual página, qual material — curto, nunca texto do cliente. */
  ref?: string | null;
  props?: Record<string, string | number | boolean | null>;
}

/** Texto livre que a pessoa digitou (o "desejo") nunca passa disto. */
export const MAX_TEXTO_DO_EVENTO = 280;

export async function registrarEvento(admin: SupabaseClient, e: EventoDaArea): Promise<void> {
  try {
    const { error } = await admin.from("area_eventos").insert({
      organization_id: e.organizationId,
      contact_id: e.contactId,
      tipo: e.tipo,
      sessao_id: e.sessaoId ?? null,
      servico_id: e.servicoId ?? null,
      ref: e.ref ? e.ref.slice(0, 120) : null,
      props: e.props ?? {},
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    logger.warn("[area] evento não registrado", {
      organization_id: e.organizationId,
      tipo: e.tipo,
      motivo: err instanceof Error ? err.message.slice(0, 160) : String(err),
    });
  }
}
