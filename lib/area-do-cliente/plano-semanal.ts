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
 *
 * Renovação sozinha no cartão (migration 0954): o primeiro pagamento no cartão guarda o cartão na conta da empresa e
 * liga `renova`; a rodada `plano-semanal-renovacao.ts` cobra a semana seguinte antes de vencer. Pix não renova.
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
  /** O cartão guardado renova sozinho (0954). */
  renova: boolean;
}

/** O cartão guardado no primeiro pagamento, como a Stripe o devolve no aviso. */
export interface CartaoGuardado {
  cliente: string;
  cartao: string;
}

export async function lerPlanoSemanal(admin: SupabaseClient, orgId: string, contactId: string): Promise<PlanoDaPessoa | null> {
  const { data, error } = await admin
    .from("area_planos")
    .select("*")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .eq("plano", "semanal")
    .maybeSingle();
  // Antes da 0953 a tabela não existe: sem plano, sem quebrar a página. Antes da 0954, sem `renova` (o `*` não quebra).
  if (error || !data) return null;
  const d = data as { valido_ate: string; moeda: PlanoDaPessoa["moeda"]; renova?: boolean | null };
  return { validoAte: d.valido_ate, moeda: d.moeda, renova: d.renova === true };
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
  /** Só no primeiro pagamento no cartão (`setup_future_usage=off_session`): guarda o cartão e liga a renovação. */
  cartao: CartaoGuardado | null = null,
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
  // Pagou: as recusas e a espera da rodada zeram. O cartão novo liga a renovação (e desfaz um cancelamento antigo).
  const renovacao = {
    falhas: 0,
    proxima_tentativa: null,
    ...(cartao ? { stripe_cliente: cartao.cliente, stripe_cartao: cartao.cartao, renova: true, cancelada_em: null } : {}),
  };
  if (atual) {
    const { error } = await admin
      .from("area_planos")
      .update({ valido_ate: validoAte, ultimo_pagamento: pagamentoId, moeda: moedaGravada, updated_at: agora.toISOString(), ...renovacao })
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
      ...renovacao,
    });
    if (error) throw new Error(error.message);
  }
  return { validoAte, jaAplicado: false };
}

/**
 * "Cancelar renovação": a semana já paga continua valendo até o fim; só a próxima cobrança não acontece. O cartão
 * fica guardado na conta da empresa (pagar de novo no cartão religa). Devolve se havia renovação a cancelar.
 */
export async function cancelarRenovacaoDoPlano(admin: SupabaseClient, orgId: string, contactId: string, agora = new Date()): Promise<boolean> {
  const { data, error } = await admin
    .from("area_planos")
    .update({ renova: false, cancelada_em: agora.toISOString(), updated_at: agora.toISOString() })
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .eq("plano", "semanal")
    .eq("renova", true)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
