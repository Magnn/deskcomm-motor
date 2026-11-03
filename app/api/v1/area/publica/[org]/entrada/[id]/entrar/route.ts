/**
 * POST /api/v1/area/publica/[org]/entrada/[id]/entrar — quem pagou a entrada do plano cai dentro da área, já logada,
 * pelo segredo do pedido (`entrada-pela-compra.ts`). 402 enquanto o pagamento não confirma.
 */
import type { NextRequest } from "next/server";

import { responderEntradaPelaCompra } from "@/lib/area-do-cliente/entrada-pela-compra-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ org: string; id: string }> };

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org, id } = await params;
  return responderEntradaPelaCompra(req, org, id, { tabela: "area_entradas" });
}
