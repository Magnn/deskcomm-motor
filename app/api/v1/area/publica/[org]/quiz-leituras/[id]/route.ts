/**
 * POST /api/v1/area/publica/[org]/quiz-leituras/[id] — a leitura paga do quiz vista DENTRO da área ("Suas leituras"):
 * devolve o texto e, se ainda não foi escrito, escreve agora (`lib/area-do-cliente/leitura-do-quiz.ts`). O direito é a
 * sessão da área de quem pagou — o pedido tem de ser dela, nesta organização.
 */
import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { CAMPOS_DO_PEDIDO, escreverLeituraDoQuiz, type PedidoDoQuiz } from "@/lib/area-do-cliente/leitura-do-quiz";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ org: string; id: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug, id } = await params;
  if (!UUID.test(id)) return NAO_ENCONTRADA();
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  if (!ctx.sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const { admin, org, sessao } = ctx;
  const { data, error } = await admin
    .from("area_quiz_pedidos")
    .select(CAMPOS_DO_PEDIDO)
    .eq("id", id)
    .eq("organization_id", org.id)
    .eq("contact_id", sessao.contactId)
    .maybeSingle();
  if (error) return ERRO(500, "internal", "Tente de novo em instantes.");
  const pedido = data as PedidoDoQuiz | null;
  if (!pedido) return ERRO(404, "not_found", "Leitura não encontrada.");
  if (!pedido.pago_at) return ERRO(402, "nao_pago", "O pagamento ainda não foi confirmado.");
  if (pedido.texto) return NextResponse.json({ data: { texto: pedido.texto } }, { headers: { "Cache-Control": "no-store" } });

  // A mesma chave da página do quiz: as duas abas juntas não pedem mais leituras à IA do que uma.
  const limite = await checkRateLimit(`area:quiz-gerar:${pedido.id}`, 4, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "A leitura está sendo preparada. Volte em alguns minutos.");
  const texto = await escreverLeituraDoQuiz(admin, { id: org.id, titulo: org.config.titulo || org.nome }, pedido);
  if (texto) return NextResponse.json({ data: { texto } }, { headers: { "Cache-Control": "no-store" } });
  return ERRO(502, "ia_sem_resposta", "A leitura está sendo preparada. Volte em alguns minutos.");
}
