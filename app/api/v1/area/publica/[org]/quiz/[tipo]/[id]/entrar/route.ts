/**
 * POST /api/v1/area/publica/[org]/quiz/[tipo]/[id]/entrar — quem pagou o quiz entra na área já logada
 * (`lib/area-do-cliente/entrada-pela-compra.ts`). O direito é o segredo do pedido (`x-segredo`).
 */
import type { NextRequest } from "next/server";

import { responderEntradaPelaCompra } from "@/lib/area-do-cliente/entrada-pela-compra-http";
import { NAO_ENCONTRADA } from "@/lib/area-do-cliente/http";
import { TIPOS_DE_QUIZ } from "@/lib/area-do-cliente/quizzes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ org: string; tipo: string; id: string }> };

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org, tipo, id } = await params;
  if (!(TIPOS_DE_QUIZ as readonly string[]).includes(tipo)) return NAO_ENCONTRADA();
  return responderEntradaPelaCompra(req, org, id, { tabela: "area_quiz_pedidos", tipo });
}
