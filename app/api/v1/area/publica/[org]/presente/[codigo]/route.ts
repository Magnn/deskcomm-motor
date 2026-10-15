/**
 * POST /api/v1/area/publica/[org]/presente/[codigo] — quem GANHOU o presente
 * faz a pergunta. Sem cadastro: o código do link é o direito à pergunta.
 *
 * Uma pergunta por presente. Feita a pergunta, ela fica guardada e a resposta
 * é pedida à IA (com uma carta tirada pelo código); se a IA falhar, chamar de
 * novo sem corpo tenta responder outra vez — a pergunta não se perde.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { cartaDaPergunta, responderPergunta } from "@/lib/area-do-cliente/circulo-ia";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, dentroDoLimite } from "@/lib/area-do-cliente/http";
import { FORMA_DO_CODIGO_DO_PRESENTE } from "@/lib/area-do-cliente/presente";
import { orgDaArea } from "@/lib/area-do-cliente/sessao";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({ pergunta: z.string().trim().min(3).max(600) }).partial();
type Ctx = { params: Promise<{ org: string; codigo: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug, codigo } = await params;
  if (!(await dentroDoLimite(req, "presente-pergunta", 10))) return ERRO(429, "rate_limited", "Muitas tentativas. Espere um minuto.");
  const admin = createAdminClient();
  const org = await orgDaArea(admin, slug);
  if (!org || !FORMA_DO_CODIGO_DO_PRESENTE.test(codigo)) return NAO_ENCONTRADA();

  const { data } = await admin
    .from("area_presentes")
    .select("id, de_contact_id, pago_at, pergunta, resposta")
    .eq("organization_id", org.id)
    .eq("codigo", codigo)
    .maybeSingle();
  const p = data as { id: string; de_contact_id: string; pago_at: string | null; pergunta: string | null; resposta: string | null } | null;
  if (!p || !p.pago_at) return ERRO(404, "not_found", "Este presente não existe ou ainda não foi pago.");
  if (p.resposta) return NextResponse.json({ data: { pergunta: p.pergunta, resposta: p.resposta } });

  const lido = corpo.safeParse(await req.json().catch(() => ({})));
  if (!lido.success) return ERRO(422, "validation_failed", "Escreva a sua pergunta (até 600 caracteres).");
  let pergunta = p.pergunta;
  if (!pergunta) {
    if (!lido.data.pergunta) return ERRO(422, "validation_failed", "Escreva a sua pergunta.");
    const { data: gravada } = await admin
      .from("area_presentes")
      .update({ pergunta: lido.data.pergunta })
      .eq("id", p.id)
      .is("pergunta", null)
      .select("pergunta");
    if (!gravada || gravada.length === 0) return ERRO(409, "conflict", "A pergunta deste presente já foi feita.");
    pergunta = lido.data.pergunta;
    await registrarEvento(admin, { organizationId: org.id, contactId: p.de_contact_id, tipo: "presente_usado" });
  }

  try {
    const resposta = await responderPergunta(getRequestPool(), llmEdgeConfigFromEnv(env), {
      organizationId: org.id,
      contactId: p.de_contact_id,
      empresa: org.config.titulo || org.nome,
      pergunta,
      carta: cartaDaPergunta(),
      origem: "presente",
    });
    if (resposta) {
      await admin.from("area_presentes").update({ resposta, respondida_at: new Date().toISOString() }).eq("id", p.id).is("resposta", null);
      return NextResponse.json({ data: { pergunta, resposta } }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (err) {
    logger.error("[area.presente] pergunta não respondida", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
  }
  return NextResponse.json({ data: { pergunta, resposta: null } }, { headers: { "Cache-Control": "no-store" } });
}
