/**
 * GET /api/v1/area/publica/[org]/sinastria/[id] — o estado do pedido do quiz e, depois de pago e escrito, o texto.
 * POST — escreve (pela IA) a leitura que já foi paga e ainda não tem texto; chamar de novo devolve o mesmo texto.
 *
 * As duas pedem o segredo do pedido (`x-segredo`), devolvido só a quem fez o pedido (`../route.ts`).
 */
import { NextResponse, type NextRequest } from "next/server";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { gerarSinastria } from "@/lib/area-do-cliente/circulo-ia";
import { NAO_ENCONTRADA, contextoDaArea, dentroDoLimite } from "@/lib/area-do-cliente/http";
import { previaDaSinastria } from "@/lib/area-do-cliente/sinastria";
import { FORMA_DO_TOKEN, hashDoToken } from "@/lib/area-do-cliente/token";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ org: string; id: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Pedido {
  id: string;
  contact_id: string;
  nome_dela: string;
  nascimento_dela: string;
  nome_dele: string;
  nascimento_dele: string;
  respostas: Record<string, string> | null;
  pago_at: string | null;
  texto: string | null;
}

async function lerPedido(req: NextRequest, ctx: Ctx): Promise<{ org: { id: string; nome: string; titulo: string }; pedido: Pedido } | Response> {
  const { org: slug, id } = await ctx.params;
  if (!UUID.test(id)) return NAO_ENCONTRADA();
  const segredo = req.headers.get("x-segredo") ?? "";
  if (!FORMA_DO_TOKEN.test(segredo)) return ERRO(404, "not_found", "Leitura não encontrada.");
  const area = await contextoDaArea(req, slug);
  if (!area) return NAO_ENCONTRADA();
  const { data } = await area.admin
    .from("area_sinastrias")
    .select("id, contact_id, nome_dela, nascimento_dela, nome_dele, nascimento_dele, respostas, pago_at, texto")
    .eq("id", id)
    .eq("organization_id", area.org.id)
    .eq("segredo_hash", hashDoToken(segredo))
    .maybeSingle();
  if (!data) return ERRO(404, "not_found", "Leitura não encontrada.");
  return { org: { id: area.org.id, nome: area.org.nome, titulo: area.org.config.titulo || area.org.nome }, pedido: data as Pedido };
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  if (!(await dentroDoLimite(req, "sinastria-ver", 120))) return ERRO(429, "rate_limited", "Espere um instante.");
  const lido = await lerPedido(req, ctx);
  if (lido instanceof Response) return lido;
  const { pedido } = lido;
  return NextResponse.json(
    {
      data: {
        pago: pedido.pago_at !== null,
        texto: pedido.texto,
        previa: previaDaSinastria(pedido.nascimento_dela, pedido.nascimento_dele),
        nome_dela: pedido.nome_dela,
        nome_dele: pedido.nome_dele,
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

  const limite = await checkRateLimit(`area:sinastria-gerar:${pedido.id}`, 4, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "A leitura está sendo preparada. Volte em alguns minutos.");
  const previa = previaDaSinastria(pedido.nascimento_dela, pedido.nascimento_dele);
  if (!previa) return ERRO(422, "validation_failed", "Datas inválidas.");
  try {
    const gerado = await gerarSinastria(getRequestPool(), llmEdgeConfigFromEnv(env), {
      organizationId: org.id,
      contactId: pedido.contact_id,
      empresa: org.titulo,
      nomeDela: pedido.nome_dela,
      nomeDele: pedido.nome_dele,
      signoDela: previa.signoDela,
      signoDele: previa.signoDele,
      elementoDela: previa.elementoDela,
      elementoDele: previa.elementoDele,
      respostas: pedido.respostas ?? {},
    });
    if (gerado) {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      await createAdminClient()
        .from("area_sinastrias")
        .update({ texto: gerado.texto, modelo: gerado.modelo })
        .eq("id", pedido.id)
        .eq("organization_id", org.id)
        .is("texto", null);
      return NextResponse.json({ data: { texto: gerado.texto } }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (err) {
    logger.error("[area.sinastria] leitura não gerada", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
  }
  return ERRO(502, "ia_sem_resposta", "A leitura está sendo preparada. Volte em alguns minutos.");
}
