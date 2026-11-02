/**
 * POST /api/v1/area/publica/[org]/sinastria/[id]/entrar — quem pagou a sinastria entra na área já logada
 * (`lib/area-do-cliente/entrada-pela-compra.ts`). O direito é o segredo do pedido (`x-segredo`).
 */
import type { NextRequest } from "next/server";

import { responderEntradaPelaCompra } from "@/lib/area-do-cliente/entrada-pela-compra-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ org: string; id: string }> };

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org, id } = await params;
  return responderEntradaPelaCompra(req, org, id, { tabela: "area_sinastrias" });
}
