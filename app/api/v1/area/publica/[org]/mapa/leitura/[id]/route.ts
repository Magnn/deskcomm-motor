/**
 * GET /api/v1/area/publica/[org]/mapa/leitura/[id] — a leitura do mapa, na parte que cabe: inteira se paga, só o
 * Sol se não. A tela pergunta enquanto a pessoa paga o Pix, para abrir o resto assim que o aviso da Stripe chegar.
 */
import { NextResponse, type NextRequest } from "next/server";

import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { umaLeituraDoMapa } from "@/lib/area-do-cliente/leitura-do-mapa-servidor";

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
  const leitura = await umaLeituraDoMapa(admin, org.id, sessao.contactId, id);
  if (!leitura) return NAO_ENCONTRADA();
  return NextResponse.json({ data: leitura }, { headers: { "Cache-Control": "no-store" } });
}
