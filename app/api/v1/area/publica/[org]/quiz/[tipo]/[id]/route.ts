/**
 * GET /api/v1/area/publica/[org]/quiz/[tipo]/[id] — o estado do pedido e, depois de pago e escrito, o texto.
 * POST — escreve (pela IA) a leitura paga que ainda não tem texto; chamar de novo devolve o mesmo texto.
 * As duas pedem o segredo do pedido (`x-segredo`), devolvido só a quem fez o pedido (`../route.ts`).
 */
import { NextResponse, type NextRequest } from "next/server";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { gerarQuiz } from "@/lib/area-do-cliente/circulo-ia";
import { NAO_ENCONTRADA, contextoDaArea, dentroDoLimite } from "@/lib/area-do-cliente/http";
import { TIPOS_DE_QUIZ, previaDoQuiz, type TipoDeQuiz } from "@/lib/area-do-cliente/quizzes";
import { FORMA_DO_TOKEN, hashDoToken } from "@/lib/area-do-cliente/token";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ org: string; tipo: string; id: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Pedido {
  id: string;
  contact_id: string;
  tipo: TipoDeQuiz;
  nome: string;
  nascimento: string | null;
  respostas: Record<string, string> | null;
  pago_at: string | null;
  texto: string | null;
}

async function lerPedido(req: NextRequest, ctx: Ctx): Promise<{ org: { id: string; titulo: string }; pedido: Pedido } | Response> {
  const { org: slug, tipo, id } = await ctx.params;
  if (!(TIPOS_DE_QUIZ as readonly string[]).includes(tipo) || !UUID.test(id)) return NAO_ENCONTRADA();
  const segredo = req.headers.get("x-segredo") ?? "";
  if (!FORMA_DO_TOKEN.test(segredo)) return ERRO(404, "not_found", "Leitura não encontrada.");
  const area = await contextoDaArea(req, slug);
  if (!area) return NAO_ENCONTRADA();
  const { data } = await area.admin
    .from("area_quiz_pedidos")
    .select("id, contact_id, tipo, nome, nascimento, respostas, pago_at, texto")
    .eq("id", id)
    .eq("organization_id", area.org.id)
    .eq("tipo", tipo)
    .eq("segredo_hash", hashDoToken(segredo))
    .maybeSingle();
  if (!data) return ERRO(404, "not_found", "Leitura não encontrada.");
  return { org: { id: area.org.id, titulo: area.org.config.titulo || area.org.nome }, pedido: data as Pedido };
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  if (!(await dentroDoLimite(req, "quiz-ver", 120))) return ERRO(429, "rate_limited", "Espere um instante.");
  const lido = await lerPedido(req, ctx);
  if (lido instanceof Response) return lido;
  const { pedido } = lido;
  return NextResponse.json(
    {
      data: {
        pago: pedido.pago_at !== null,
        texto: pedido.texto,
        previa: previaDoQuiz(pedido.tipo, { nascimento: pedido.nascimento, respostas: pedido.respostas ?? {}, nome: pedido.nome }),
        nome: pedido.nome,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const lido = await lerPedido(req, ctx);
  if (lido instanceof Response) return lido;
  const { org, pedido } = lido;
  if (!pedido.pago_at) return ERRO(402, "nao_pago", "O pagamento ainda não foi confirmado.");
  if (pedido.texto) return NextResponse.json({ data: { texto: pedido.texto } }, { headers: { "Cache-Control": "no-store" } });

  const limite = await checkRateLimit(`area:quiz-gerar:${pedido.id}`, 4, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "A leitura está sendo preparada. Volte em alguns minutos.");
  const previa = previaDoQuiz(pedido.tipo, { nascimento: pedido.nascimento, respostas: pedido.respostas ?? {}, nome: pedido.nome });
  if (!previa) return ERRO(422, "validation_failed", "Dados inválidos.");
  try {
    const gerado = await gerarQuiz(getRequestPool(), llmEdgeConfigFromEnv(env), {
      organizationId: org.id,
      contactId: pedido.contact_id,
      empresa: org.titulo,
      tipo: pedido.tipo,
      nome: pedido.nome,
      titulo: previa.titulo,
      detalhe: previa.detalhe,
      fato: previa.fato,
      respostas: pedido.respostas ?? {},
    });
    if (gerado) {
      await createAdminClient()
        .from("area_quiz_pedidos")
        .update({ texto: gerado.texto, modelo: gerado.modelo })
        .eq("id", pedido.id)
        .eq("organization_id", org.id)
        .is("texto", null);
      return NextResponse.json({ data: { texto: gerado.texto } }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (err) {
    logger.error("[area.quiz] leitura não gerada", {
      organization_id: org.id,
      quiz: pedido.tipo,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
  }
  return ERRO(502, "ia_sem_resposta", "A leitura está sendo preparada. Volte em alguns minutos.");
}
