/**
 * GET /api/v1/area/publica/[org]/compras-recentes?produto=… — as últimas compras aprovadas de um produto,
 * para o aviso "Fulana acabou de adquirir" da página de vendas (que é estática e mora em outro domínio).
 *
 * Público e anônimo: devolve SÓ o primeiro nome e a hora, e só das fontes de página de vendas
 * (`cakto_somente_registro`, migration 0948). Regras em `lib/pagamentos/compras-recentes.ts`.
 */
import { NextResponse, type NextRequest } from "next/server";

import { NAO_ENCONTRADA, contextoDaArea, dentroDoLimite } from "@/lib/area-do-cliente/http";
import { logger } from "@/lib/logger";
import { comprasRecentesDaPagina } from "@/lib/pagamentos/compras-recentes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ org: string }> };

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

export function OPTIONS(): Response {
  return new NextResponse(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });
}

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  if (!(await dentroDoLimite(req, "compras-recentes", 60))) return new NextResponse(null, { status: 429, headers: CORS });
  const produto = req.nextUrl.searchParams.get("produto") ?? "";
  if (produto.length < 3 || produto.length > 80) {
    return NextResponse.json({ error: { code: "validation_failed", message: "Produto inválido." } }, { status: 422, headers: CORS });
  }
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();

  try {
    const compras = await comprasRecentesDaPagina(ctx.admin, ctx.org.id, produto);
    // Um minuto de cache no navegador: a página pede uma vez ao abrir, não a cada aviso.
    return NextResponse.json({ data: { compras } }, { headers: { ...CORS, "Cache-Control": "public, max-age=60" } });
  } catch (err) {
    logger.error("[area.compras-recentes] leitura falhou", {
      organizationId: ctx.org.id,
      error: err instanceof Error ? err.message : String(err),
    });
    // A página trata a lista vazia como "não mostra o aviso" — nunca um erro na tela de quem está comprando.
    return NextResponse.json({ data: { compras: [] } }, { headers: { ...CORS, "Cache-Control": "no-store" } });
  }
}
