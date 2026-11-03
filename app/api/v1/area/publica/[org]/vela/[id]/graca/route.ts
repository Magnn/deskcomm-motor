/**
 * POST /api/v1/area/publica/[org]/vela/[id]/graca — marcar se a graça veio e fechar a vela (migration 0957).
 *
 * Corpo `{ veio: boolean }`. «veio» a qualquer hora; «ainda não» só depois do sétimo dia. Não exige o plano: a vela
 * acesa é dela até o fim.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { diaNoFuso } from "@/lib/area-do-cliente/dados";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { marcarGraca } from "@/lib/area-do-cliente/intencao-servidor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ org: string; id: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });
const corpoSchema = z.strictObject({ veio: z.boolean() });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug, id } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  if (!z.string().uuid().safeParse(id).success) return ERRO(404, "not_found", "Vela não encontrada.");
  const corpo = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!corpo.success) return ERRO(422, "validation_failed", "Diga se a graça veio.");

  const r = await marcarGraca(admin, org.id, sessao.contactId, id, corpo.data.veio, diaNoFuso(new Date().toISOString(), org.fuso));
  if (r === "nao_encontrada") return ERRO(404, "not_found", "Vela não encontrada.");
  if (r === "ainda_acesa") return ERRO(409, "ainda_acesa", "A sua vela ainda está acesa.");
  return NextResponse.json({ data: { ok: true } }, { headers: { "Cache-Control": "no-store" } });
}
