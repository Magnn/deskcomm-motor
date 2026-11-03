/** POST /api/v1/area/publica/[org]/sinastria/[id]/voz — ouvir a sinastria paga (`lib/area-do-cliente/narracao.ts`). */
import type { NextRequest } from "next/server";

import { responderNarracaoDoPedido } from "@/lib/area-do-cliente/narracao-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

type Ctx = { params: Promise<{ org: string; id: string }> };

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org, id } = await params;
  return responderNarracaoDoPedido(req, org, id, { tabela: "area_sinastrias" });
}
