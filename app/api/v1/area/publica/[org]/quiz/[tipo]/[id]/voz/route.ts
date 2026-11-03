/** POST /api/v1/area/publica/[org]/quiz/[tipo]/[id]/voz — ouvir a leitura paga do quiz (`lib/area-do-cliente/narracao.ts`). */
import type { NextRequest } from "next/server";

import { NAO_ENCONTRADA } from "@/lib/area-do-cliente/http";
import { responderNarracaoDoPedido } from "@/lib/area-do-cliente/narracao-http";
import { TIPOS_DE_QUIZ } from "@/lib/area-do-cliente/quizzes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

type Ctx = { params: Promise<{ org: string; tipo: string; id: string }> };

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org, tipo, id } = await params;
  if (!(TIPOS_DE_QUIZ as readonly string[]).includes(tipo)) return NAO_ENCONTRADA();
  return responderNarracaoDoPedido(req, org, id, { tabela: "area_quiz_pedidos", tipo });
}
