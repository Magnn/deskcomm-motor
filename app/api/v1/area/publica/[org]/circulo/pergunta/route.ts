/**
 * POST /api/v1/area/publica/[org]/circulo/pergunta — a pergunta do mês de quem
 * está no Círculo.
 *
 * `{ pergunta }` registra a do mês (uma por pessoa por mês) e pede a resposta à
 * IA, com uma carta tirada pelo código. Sem corpo, tenta de novo responder a
 * pergunta do mês que ficou sem resposta (a IA pode falhar; a pergunta não se
 * perde). A pergunta e a resposta são da pessoa: só o servidor as lê.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { assinaturaAtiva, lerAssinatura, mesDoDia } from "@/lib/area-do-cliente/circulo";
import { cartaDaPergunta, responderPergunta } from "@/lib/area-do-cliente/circulo-ia";
import { diaNoFuso } from "@/lib/area-do-cliente/dados";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({ pergunta: z.string().trim().min(3).max(600) }).partial();
type Ctx = { params: Promise<{ org: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  if (!org.config.circulo?.ativo || !assinaturaAtiva(await lerAssinatura(admin, org.id, sessao.contactId), new Date())) {
    return ERRO(403, "forbidden", "A pergunta do mês é de quem está no Círculo.");
  }
  const limite = await checkRateLimit(`area:circulo-pergunta:${sessao.contactId}`, 6, 3600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas tentativas. Volte daqui a pouco.");

  const lido = corpo.safeParse(await req.json().catch(() => ({})));
  if (!lido.success) return ERRO(422, "validation_failed", "Escreva a sua pergunta (até 600 caracteres).");
  const mes = mesDoDia(diaNoFuso(new Date().toISOString(), org.fuso));

  const { data: existente } = await admin
    .from("area_perguntas")
    .select("id, pergunta, resposta")
    .eq("organization_id", org.id)
    .eq("contact_id", sessao.contactId)
    .eq("mes", mes)
    .maybeSingle();
  let linha = existente as { id: string; pergunta: string; resposta: string | null } | null;
  if (linha?.resposta) return NextResponse.json({ data: { pergunta: linha.pergunta, resposta: linha.resposta } });

  if (!linha) {
    if (!lido.data.pergunta) return ERRO(422, "validation_failed", "Escreva a sua pergunta.");
    const { data, error } = await admin
      .from("area_perguntas")
      .insert({ organization_id: org.id, contact_id: sessao.contactId, mes, pergunta: lido.data.pergunta })
      .select("id, pergunta, resposta")
      .single();
    if (error?.code === "23505") return ERRO(409, "conflict", "Você já fez a pergunta deste mês.");
    if (error || !data) return ERRO(500, "internal_error", "Não foi possível registrar agora.");
    linha = data as { id: string; pergunta: string; resposta: string | null };
    await registrarEvento(admin, { organizationId: org.id, contactId: sessao.contactId, tipo: "pergunta_enviada", sessaoId: sessao.sessaoId });
  }

  try {
    const resposta = await responderPergunta(getRequestPool(), llmEdgeConfigFromEnv(env), {
      organizationId: org.id,
      contactId: sessao.contactId,
      empresa: org.config.titulo || org.nome,
      pergunta: linha.pergunta,
      carta: cartaDaPergunta(),
    });
    if (resposta) {
      await admin
        .from("area_perguntas")
        .update({ resposta, respondida_at: new Date().toISOString() })
        .eq("id", linha.id)
        .is("resposta", null);
      return NextResponse.json({ data: { pergunta: linha.pergunta, resposta } }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (err) {
    logger.error("[area.circulo] pergunta não respondida", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
  }
  return NextResponse.json({ data: { pergunta: linha.pergunta, resposta: null } }, { headers: { "Cache-Control": "no-store" } });
}
