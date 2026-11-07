/**
 * GET /api/v1/area/publica/[org]/quiz/[tipo]/[id] — o estado do pedido e, depois de pago e escrito, o texto.
 * POST — escreve (pela IA) a leitura paga que ainda não tem texto; chamar de novo devolve o mesmo texto.
 * As duas pedem o segredo do pedido (`x-segredo`), devolvido só a quem fez o pedido (`../route.ts`).
 */
import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { NAO_ENCONTRADA, contextoDaArea, dentroDoLimite } from "@/lib/area-do-cliente/http";
import { CAMPOS_DO_PEDIDO, escreverLeituraDoQuiz, type PedidoDoQuiz } from "@/lib/area-do-cliente/leitura-do-quiz";
import { TIPOS_DE_QUIZ, previaDoQuiz } from "@/lib/area-do-cliente/quizzes";
import { FORMA_DO_TOKEN, hashDoToken } from "@/lib/area-do-cliente/token";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ org: string; tipo: string; id: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


async function lerPedido(req: NextRequest, ctx: Ctx): Promise<{ org: { id: string; titulo: string }; pedido: PedidoDoQuiz } | Response> {
  const { org: slug, tipo, id } = await ctx.params;
  if (!(TIPOS_DE_QUIZ as readonly string[]).includes(tipo) || !UUID.test(id)) return NAO_ENCONTRADA();
  const segredo = req.headers.get("x-segredo") ?? "";
  if (!FORMA_DO_TOKEN.test(segredo)) return ERRO(404, "not_found", "Leitura não encontrada.");
  const area = await contextoDaArea(req, slug);
  if (!area) return NAO_ENCONTRADA();
  const { data } = await area.admin
    .from("area_quiz_pedidos")
    .select(CAMPOS_DO_PEDIDO)
    .eq("id", id)
    .eq("organization_id", area.org.id)
    .eq("tipo", tipo)
    .eq("segredo_hash", hashDoToken(segredo))
    .maybeSingle();
  if (!data) return ERRO(404, "not_found", "Leitura não encontrada.");
  return { org: { id: area.org.id, titulo: area.org.config.titulo || area.org.nome }, pedido: data as PedidoDoQuiz };
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
  const texto = await escreverLeituraDoQuiz(createAdminClient(), org, pedido);
  if (texto) return NextResponse.json({ data: { texto } }, { headers: { "Cache-Control": "no-store" } });
  return ERRO(502, "ia_sem_resposta", "A leitura está sendo preparada. Volte em alguns minutos.");
}
