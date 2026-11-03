/**
 * GET /api/v1/area/publica/[org]/sonho/[id] — a interpretação do sonho, na parte que cabe: inteira se paga, só
 * o primeiro símbolo se não. A tela pergunta enquanto a pessoa paga o Pix, para abrir o resto assim que o aviso
 * da Stripe chegar.
 */
import { NextResponse, type NextRequest } from "next/server";

import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { umSonho } from "@/lib/area-do-cliente/sonho-servidor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ org: string; id: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug, id } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return NextResponse.json({ error: { code: "unauthenticated", message: "Entre na sua área." } }, { status: 401 });
  if (!UUID.test(id)) return NAO_ENCONTRADA();
  const sonho = await umSonho(admin, org.id, sessao.contactId, id);
  if (!sonho) return NAO_ENCONTRADA();
  return NextResponse.json({ data: sonho }, { headers: { "Cache-Control": "no-store" } });
}
