/**
 * GET /api/v1/area/publica/[org]/mapa/cidades?q=chape — a busca da cidade de nascimento do mapa natal
 * (`lib/area-do-cliente/cidades.ts`, GeoNames). Devolve até 8 cidades com coordenadas e fuso; quem lê em português
 * vê as do Brasil primeiro.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { buscarCidades } from "@/lib/area-do-cliente/cidades";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { idiomaDaArea } from "@/lib/i18n/area-servidor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const consulta = z.string().trim().min(2).max(60);
type Ctx = { params: Promise<{ org: string }> };

const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  if (!ctx.sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const limite = await checkRateLimit(`area:mapa-cidades:${ctx.sessao.contactId}`, 120, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  const q = consulta.safeParse(req.nextUrl.searchParams.get("q") ?? "");
  if (!q.success) return NextResponse.json({ data: [] });
  const idioma = await idiomaDaArea();
  const cidades = await buscarCidades(q.data, idioma === "pt-BR" ? "BR" : null);
  return NextResponse.json({ data: cidades }, { headers: { "Cache-Control": "no-store" } });
}
