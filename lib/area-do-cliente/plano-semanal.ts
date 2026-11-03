/**
 * O PLANO DA SEMANA — a assinatura de entrada da área do cliente (migration 0953).
 *
 * Pedido do dono em 03/11/2026: R$ 5 / US$ 1 / € 1 por semana, ao lado do Círculo (o plano completo, por mês).
 * Acesso por PERÍODO PAGO, como o Círculo: cada pagamento estende o acesso em 7 dias a partir do maior entre agora e
 * o vencimento atual. No Brasil, Pix ou cartão; fora, cartão em dólar ou euro (`moeda-do-visitante.ts`).
 *
 * O que o plano dá, toda semana (de segunda a domingo, no fuso da empresa):
 *  - a PERGUNTA DA SEMANA na Mesa: uma leitura de Tarot ou Baralho Cigano sem pagar (`gratisDaSemanaLivre`);
 *  - UM SONHO interpretado inteiro (`sonho-servidor.ts`).
 * Os dois custam uma chamada de IA cada: cabem no preço mesmo em US$ 1 depois da tarifa do cartão.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PrecoInternacional } from "@/lib/preco/tipos";

export const DIAS_DO_PLANO = 7;
/** O marcador que vai e volta nos metadados do pagamento (`metadata.extra`). */
export const EXTRA_DO_PLANO_SEMANAL = "plano-semanal";
/** Como fica gravado o que o plano liberou (a leitura da Mesa, o sonho). */
export const PAGAMENTO_DO_PLANO = "plano_semanal";

export interface ConfigDoPlanoSemanal {
  ativo: boolean;
  nome: string;
  preco_cents: number;
  precos_internacionais: PrecoInternacional[];
}

export const PRECOS_INTERNACIONAIS_DO_PLANO: PrecoInternacional[] = [
  { currency: "USD", price_cents: 100 },
  { currency: "EUR", price_cents: 100 },
];

/** Desligado por padrão; R$ 5, US$ 1 e € 1 quando a empresa não muda. */
export function configDoPlanoSemanal(
  c: { ativo?: boolean; nome?: string; preco_cents?: number; precos_internacionais?: PrecoInternacional[] } | undefined,
): ConfigDoPlanoSemanal {
  return {
    ativo: c?.ativo ?? false,
    nome: c?.nome?.trim() || "Plano da Semana",
    preco_cents: c?.preco_cents ?? 500,
    precos_internacionais: c?.precos_internacionais ?? PRECOS_INTERNACIONAIS_DO_PLANO,
  };
}

/** Pura: o novo vencimento depois de um pagamento. */
export function estenderPlano(atual: Date | null, agora: Date): Date {
  const base = atual && atual.getTime() > agora.getTime() ? atual : agora;
  return new Date(base.getTime() + DIAS_DO_PLANO * 86_400_000);
}

export function planoAtivo(validoAte: string | null, agora: Date): boolean {
  return validoAte !== null && new Date(validoAte).getTime() > agora.getTime();
}

export interface PlanoDaPessoa {
  validoAte: string;
  moeda: "BRL" | "USD" | "EUR";
}

export async function lerPlanoSemanal(admin: SupabaseClient, orgId: string, contactId: string): Promise<PlanoDaPessoa | null> {
  const { data, error } = await admin
    .from("area_planos")
    .select("valido_ate, moeda")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .eq("plano", "semanal")
    .maybeSingle();
  // Antes da 0953 a tabela não existe: sem plano, sem quebrar a página.
  if (error || !data) return null;
  const d = data as { valido_ate: string; moeda: PlanoDaPessoa["moeda"] };
  return { validoAte: d.valido_ate, moeda: d.moeda };
}

/** A pessoa está com o plano em dia agora? */
export async function temPlanoSemanal(admin: SupabaseClient, orgId: string, contactId: string, agora = new Date()): Promise<boolean> {
  const p = await lerPlanoSemanal(admin, orgId, contactId);
  return p !== null && planoAtivo(p.validoAte, agora);
}

/**
 * Aplica um pagamento do plano. Idempotente pelo id do pagamento: o mesmo aviso reentregue pela Stripe não estende
 * o acesso duas vezes.
 */
export async function ativarPlanoSemanal(
  admin: SupabaseClient,
  orgId: string,
  contactId: string,
  pagamentoId: string,
  moeda: string,
  agora = new Date(),
): Promise<{ validoAte: string; jaAplicado: boolean }> {
  const { data, error: erroDeLeitura } = await admin
    .from("area_planos")
    .select("id, valido_ate, ultimo_pagamento")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .eq("plano", "semanal")
    .maybeSingle();
  if (erroDeLeitura) throw new Error(erroDeLeitura.message);
  const atual = data as { id: string; valido_ate: string; ultimo_pagamento: string | null } | null;
  if (atual?.ultimo_pagamento === pagamentoId) return { validoAte: atual.valido_ate, jaAplicado: true };

  const validoAte = estenderPlano(atual ? new Date(atual.valido_ate) : null, agora).toISOString();
  const moedaGravada = moeda === "USD" || moeda === "EUR" ? moeda : "BRL";
  if (atual) {
    const { error } = await admin
      .from("area_planos")
      .update({ valido_ate: validoAte, ultimo_pagamento: pagamentoId, moeda: moedaGravada, updated_at: agora.toISOString() })
      .eq("id", atual.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("area_planos").insert({
      organization_id: orgId,
      contact_id: contactId,
      plano: "semanal",
      valido_ate: validoAte,
      ultimo_pagamento: pagamentoId,
      moeda: moedaGravada,
    });
    if (error) throw new Error(error.message);
  }
  return { validoAte, jaAplicado: false };
}
