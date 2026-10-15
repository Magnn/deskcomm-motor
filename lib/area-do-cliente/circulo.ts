/**
 * O CÍRCULO — a assinatura mensal da área do cliente.
 *
 * Acesso por PERÍODO PAGO, não assinatura recorrente: cada pagamento (Pix ou
 * cartão, pela Stripe) estende o acesso em 30 dias a partir do maior entre
 * agora e o vencimento atual. A Stripe só cobra recorrência automática no
 * cartão, e 11 de 12 vendas medidas em 15/10/2026 foram Pix — renovar pela área
 * é o que serve a todos. Quem paga antes de vencer não perde dia nenhum.
 *
 * O que o Círculo dá: o conteúdo do mês (gerado pela IA, um por organização por
 * mês) e uma pergunta por mês respondida (IA, com uma carta tirada pelo código).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const DIAS_DO_CICLO = 30;
/** A área avisa "renove" quando faltam isto ou menos. */
export const DIAS_DO_AVISO_DE_RENOVACAO = 5;
/** O marcador que vai e volta nos metadados do pagamento (`metadata.extra`). */
export const EXTRA_DO_CIRCULO = "circulo";

/** Pura: o novo vencimento depois de um pagamento. */
export function estenderValidade(atual: Date | null, agora: Date): Date {
  const base = atual && atual.getTime() > agora.getTime() ? atual : agora;
  return new Date(base.getTime() + DIAS_DO_CICLO * 86_400_000);
}

export function assinaturaAtiva(validoAte: string | null, agora: Date): boolean {
  return validoAte !== null && new Date(validoAte).getTime() > agora.getTime();
}

export function diasRestantes(validoAte: string, agora: Date): number {
  return Math.max(0, Math.ceil((new Date(validoAte).getTime() - agora.getTime()) / 86_400_000));
}

/** `AAAA-MM-01` do mês de um dia `AAAA-MM-DD`. */
export function mesDoDia(dia: string): string {
  return `${dia.slice(0, 7)}-01`;
}

export async function lerAssinatura(admin: SupabaseClient, orgId: string, contactId: string): Promise<string | null> {
  const { data } = await admin
    .from("area_assinaturas")
    .select("valido_ate")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .maybeSingle();
  return (data as { valido_ate: string } | null)?.valido_ate ?? null;
}

/**
 * Aplica um pagamento do Círculo. Idempotente pelo id do pagamento: o mesmo
 * aviso reentregue pela Stripe não estende o acesso duas vezes.
 */
export async function ativarCirculo(
  admin: SupabaseClient,
  orgId: string,
  contactId: string,
  pagamentoId: string,
  agora = new Date(),
): Promise<{ validoAte: string; jaAplicado: boolean }> {
  const { data } = await admin
    .from("area_assinaturas")
    .select("id, valido_ate, ultimo_pagamento")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .maybeSingle();
  const atual = data as { id: string; valido_ate: string; ultimo_pagamento: string | null } | null;
  if (atual?.ultimo_pagamento === pagamentoId) return { validoAte: atual.valido_ate, jaAplicado: true };

  const validoAte = estenderValidade(atual ? new Date(atual.valido_ate) : null, agora).toISOString();
  if (atual) {
    const { error } = await admin
      .from("area_assinaturas")
      .update({ valido_ate: validoAte, ultimo_pagamento: pagamentoId, updated_at: agora.toISOString() })
      .eq("id", atual.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("area_assinaturas").insert({
      organization_id: orgId,
      contact_id: contactId,
      valido_ate: validoAte,
      ultimo_pagamento: pagamentoId,
    });
    if (error) throw new Error(error.message);
  }
  return { validoAte, jaAplicado: false };
}
