/**
 * GET /api/v1/area/publica/[org]/leituras/[id] — a leitura já foi paga? A tela pergunta enquanto a pessoa
 * paga o Pix, para abrir a mesa assim que o aviso da Stripe chegar.
 */
import { NextResponse, type NextRequest } from "next/server";

import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";

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
  const { data } = await admin
    .from("area_leituras")
    .select("pago_at, cartas")
    .eq("id", id)
    .eq("organization_id", org.id)
    .eq("contact_id", sessao.contactId)
    .maybeSingle();
  const l = data as { pago_at: string | null; cartas: unknown } | null;
  if (!l) return NAO_ENCONTRADA();
  return NextResponse.json(
    { data: { paga: l.pago_at !== null, revelada: Array.isArray(l.cartas) && l.cartas.length > 0 } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
