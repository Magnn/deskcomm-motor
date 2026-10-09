/**
 * GET /api/v1/ai/usage — observability dashboard for AI invocations.
 *
 * Chamadas de IA (custo, tokens, tempo de resposta) por dia e por finalidade, e a taxa de
 * passagem para uma pessoa por dia. Quem soma é o banco — `fn_uso_de_ia` e
 * `fn_recebidas_e_passagens_por_dia` (migration 0920).
 *
 * Auth: cookie session, role manager+. organization_id resolved from JWT.
 *
 * `lib/ai/usage/aggregate.ts` só monta o payload a partir do que o banco somou. O client é o
 * do usuário, então a RLS isola a organização (as funções são SECURITY INVOKER); o
 * `p_org` explícito é a defesa em profundidade que a convenção do repo pede.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { montarUso, type DiaDeConversa, type LinhaDeUso } from "@/lib/ai/usage/aggregate";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 90;

const querySchema = z.object({
  agent_id: z.string().uuid().optional(),
  invocation_kind: z.string().min(1).max(64).optional(),
  from: z.string().regex(DAY_RE).optional(),
  to: z.string().regex(DAY_RE).optional(),
});

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function parseDayUtc(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function resolveRange(qs: { from?: string; to?: string }): { from: Date; to: Date } {
  const now = new Date();
  const to = qs.to ? parseDayUtc(qs.to) : startOfUtcDay(now);
  let from = qs.from ? parseDayUtc(qs.from) : startOfUtcDay(new Date(now.getTime() - 29 * 86_400_000));

  // Hard-cap range to MAX_RANGE_DAYS.
  const diffDays = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (diffDays > MAX_RANGE_DAYS - 1) {
    from = new Date(to.getTime() - (MAX_RANGE_DAYS - 1) * 86_400_000);
  }
  if (from.getTime() > to.getTime()) {
    from = to;
  }
  return { from: startOfUtcDay(from), to: startOfUtcDay(to) };
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("manager", { requestId, resource: "ai_usage" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org: activeOrg } = authz;

  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return fail("validation_failed", t("Filtros inválidos."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const range = resolveRange(parsed.data);
  const fromIso = range.from.toISOString();
  const toIso = endOfUtcDay(range.to).toISOString();

  const supabase = await createClient();

  // ---- 1. as chamadas de IA, SOMADAS NO BANCO (migration 0920) -------------
  //
  // A fonte é `llm_calls`, a ÚNICA tabela de telemetria desde a 0130 (`ai_invocations` é
  // histórico e ninguém escreve nela; somar as duas contaria a mesma chamada em dobro —
  // `tests/unit/usage-nao-conta-em-dobro.test.ts`).
  //
  // ⚠️ Esta rota já leu a tabela linha por linha, com `.limit(50_000)`. A REST entrega no
  // máximo 1.000 linhas por pedido, qualquer que seja o limite pedido: a tela mostrava as 1.000
  // chamadas MAIS ANTIGAS do período como se fossem todas (1.000 de 177.579, medido em
  // 09/10/2026). Quem soma é `fn_uso_de_ia`, e ela devolve um valor só.
  const { data: usoRaw, error: usoErr } = await supabase.rpc("fn_uso_de_ia", {
    p_org: activeOrg.orgId,
    p_de: fromIso,
    p_ate: toIso,
    ...(parsed.data.agent_id ? { p_agente: parsed.data.agent_id } : {}),
    ...(parsed.data.invocation_kind ? { p_finalidade: parsed.data.invocation_kind } : {}),
  });
  if (usoErr) {
    console.warn("[ai-usage] fn_uso_de_ia failed", { error: usoErr.message });
    return fail("internal_error", "Erro ao agregar o uso de IA.", 500, { requestId });
  }

  // ---- 2. mensagens recebidas e passagens para uma pessoa, por dia --------
  // Mesmo corte de 1.000 linhas, mesma saída. Se falhar, a taxa sai zerada e o resto da tela
  // continua de pé — como já era.
  const { data: conversaRaw, error: conversaErr } = await supabase.rpc("fn_recebidas_e_passagens_por_dia", {
    p_org: activeOrg.orgId,
    p_de: fromIso,
    p_ate: toIso,
  });
  if (conversaErr) {
    console.warn("[ai-usage] fn_recebidas_e_passagens_por_dia failed", { error: conversaErr.message });
  }

  const payload = montarUso(
    (usoRaw ?? []) as unknown as LinhaDeUso[],
    (conversaErr ? [] : (conversaRaw ?? [])) as unknown as DiaDeConversa[],
    range,
  );

  return ok(payload, { requestId });
}
