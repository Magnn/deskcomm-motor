/**
 * GET/POST /api/v1/cron/excedente-de-conversas — mede a franquia de conversas e cobra o excedente.
 *
 * Para cada empresa com assinatura pela Stripe em dia e plano com franquia (`Plano.conversasMensais`):
 * conta as conversas atendidas pela IA no ciclo da assinatura, grava a contagem (a tela de planos mostra
 * "312 de 300") e, com `STRIPE_PLANS_EXCEDENTE_CENTAVOS` ligado, informa ao medidor da Stripe só as conversas
 * além da franquia que ainda não foram informadas neste ciclo (`lib/planos/excedente.ts`). A Stripe soma o
 * medidor e cobra na próxima fatura.
 *
 * De hora em hora: o que passou da franquia na última hora de um ciclo e não foi medido antes da virada fica
 * sem cobrança — o erro é sempre a favor de quem paga, nunca contra.
 *
 * Ordem do informe: primeiro a Stripe, depois o banco. Se a gravação falhar, a rodada seguinte manda o mesmo
 * total com a mesma chave (`chaveDoInforme`) e a Stripe descarta o repetido. Audita só quando informou.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { marcaDaSaida } from "@/lib/branding/saida";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { planosDaInstalacao } from "@/lib/planos/assinatura-da-organizacao";
import { planoPorId } from "@/lib/planos/catalogo";
import { aInformar, chaveDoInforme, conversasNoCiclo, excedenteDoCiclo } from "@/lib/planos/excedente";
import { configuracaoDaStripeDosPlanos, criarStripeDosPlanos } from "@/lib/planos/stripe-dos-planos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const EMPRESAS_POR_RODADA = 200;

type Linha = {
  organization_id: string;
  plan_id: string;
  reference: string | null;
  excedente_ciclo_inicio: string | null;
  excedente_informado: number;
};

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  const cfg = configuracaoDaStripeDosPlanos();
  if (!cfg) return ok({ medidas: 0, informadas: 0, falhas: 0, motivo: "stripe_dos_planos_desligada" }, { requestId });
  const planos = planosDaInstalacao();
  if (!planos.some((p) => p.conversasMensais > 0)) {
    return ok({ medidas: 0, informadas: 0, falhas: 0, motivo: "nenhum_plano_com_franquia" }, { requestId });
  }
  const centavos = env.STRIPE_PLANS_EXCEDENTE_CENTAVOS;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_subscriptions")
    .select("organization_id, plan_id, reference, excedente_ciclo_inicio, excedente_informado")
    .eq("source", "stripe")
    .eq("status", "ativa")
    .like("reference", "sub_%")
    .limit(EMPRESAS_POR_RODADA);
  if (error) {
    logger.error("[cron.excedente] leitura falhou", { requestId, erro: error.message });
    return fail("internal_error", "leitura das assinaturas falhou", 500, { requestId });
  }

  const stripe = criarStripeDosPlanos({ chave: cfg.chave, marca: (await marcaDaSaida(null)).nome });
  const pool = getRequestPool();
  let medidas = 0;
  let informadas = 0;
  let falhas = 0;

  for (const l of (data ?? []) as Linha[]) {
    const plano = planoPorId(planos, l.plan_id);
    if (!plano || plano.conversasMensais <= 0 || !l.reference) continue;
    try {
      const assinatura = await stripe.lerAssinatura(l.reference);
      if (!assinatura?.cicloInicio || !assinatura.clienteId) continue;
      const ciclo = assinatura.cicloInicio.toISOString();
      const usadas = await conversasNoCiclo(pool, l.organization_id, assinatura.cicloInicio, new Date());
      const excedente = excedenteDoCiclo(usadas, plano.conversasMensais);
      const cicloInformado = l.excedente_ciclo_inicio ? new Date(l.excedente_ciclo_inicio).toISOString() : null;
      const jaInformado = cicloInformado === ciclo ? l.excedente_informado : 0;
      const novas = centavos > 0 ? aInformar({ excedente, ciclo, cicloInformado, jaInformado }) : 0;

      if (novas > 0) {
        await stripe.garantirExcedenteNaAssinatura(assinatura, centavos);
        await stripe.informarExcedente({
          clienteId: assinatura.clienteId,
          quantidade: novas,
          chave: chaveDoInforme(l.organization_id, ciclo, excedente),
        });
      }

      const { error: erroDaGravacao } = await admin
        .from("organization_subscriptions")
        .update({
          conversas_no_ciclo: usadas,
          excedente_ciclo_inicio: ciclo,
          excedente_ciclo_fim: assinatura.cicloFim?.toISOString() ?? null,
          excedente_informado: jaInformado + novas,
          excedente_medido_em: new Date().toISOString(),
        })
        .eq("organization_id", l.organization_id);
      if (erroDaGravacao) throw new Error(erroDaGravacao.message);
      medidas++;
      if (novas > 0) {
        informadas++;
        void audit({
          action: "plano.excedente_informado",
          organizationId: l.organization_id,
          requestId,
          bypassedRls: true,
          metadata: { plano: plano.id, ciclo, usadas, franquia: plano.conversasMensais, informadas_agora: novas, centavos_por_conversa: centavos },
        });
      }
    } catch (err) {
      falhas++;
      logger.warn("[cron.excedente] empresa não foi medida", {
        requestId,
        organizationId: l.organization_id,
        erro: err instanceof Error ? err.message.slice(0, 300) : String(err),
      });
    }
  }

  if (informadas > 0 || falhas > 0) {
    void audit({ action: "cron.excedente_de_conversas", requestId, bypassedRls: true, metadata: { medidas, informadas, falhas } });
  }
  return ok({ medidas, informadas, falhas }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
