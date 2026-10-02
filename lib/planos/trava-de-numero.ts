/**
 * A TRAVA DE QUEM CRIA NÚMERO — a mesma resposta em toda porta.
 *
 * Cada rota que conecta um número novo chama `travaDeNovoNumero` antes de
 * gravar. `null` = pode seguir. A recusa é 402 (`plano_necessario`), com a frase
 * que diz onde resolver e o `motivo` em `details` para a tela oferecer os planos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { fail } from "@/lib/api/wrappers";

import { mensagemDaRecusa, recusaParaNovoNumero } from "./assinatura-da-organizacao";

export const CODIGO_DE_PLANO_NECESSARIO = "plano_necessario";

export async function travaDeNovoNumero(
  admin: SupabaseClient,
  organizationId: string,
  t: (texto: string) => string,
  requestId: string,
): Promise<ReturnType<typeof fail> | null> {
  const recusa = await recusaParaNovoNumero(admin, organizationId);
  if (recusa === null) return null;
  return fail(CODIGO_DE_PLANO_NECESSARIO, t(mensagemDaRecusa(recusa)), 402, {
    requestId,
    details: { ...recusa },
  });
}
