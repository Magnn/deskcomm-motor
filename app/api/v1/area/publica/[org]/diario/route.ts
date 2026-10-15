/**
 * POST /api/v1/area/publica/[org]/diario — a pessoa anota no diário dela.
 *
 * O texto é DELA: vai para `area_diario`, que nem a equipe lê pela RLS. O painel
 * só conta quantas pessoas escreveram (evento `diario_escrito`, sem o texto).
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({ texto: z.string().trim().min(1).max(2000) });
type Ctx = { params: Promise<{ org: string }> };

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return NextResponse.json({ error: { code: "unauthenticated", message: "Entre na sua área." } }, { status: 401 });

  const limite = await checkRateLimit(`area:diario:${sessao.contactId}`, 20, 3600);
  if (!limite.allowed) return NextResponse.json({ error: { code: "rate_limited", message: "Muitas anotações seguidas. Tente mais tarde." } }, { status: 429 });

  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return NextResponse.json({ error: { code: "validation_failed", message: "Escreva algo (até 2.000 caracteres)." } }, { status: 422 });

  const { data, error } = await admin
    .from("area_diario")
    .insert({ organization_id: org.id, contact_id: sessao.contactId, texto: lido.data.texto })
    .select("id, texto, created_at")
    .single();
  if (error || !data) return NextResponse.json({ error: { code: "internal_error", message: "Não foi possível salvar agora." } }, { status: 500 });

  await registrarEvento(admin, { organizationId: org.id, contactId: sessao.contactId, tipo: "diario_escrito", sessaoId: sessao.sessaoId });
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}
