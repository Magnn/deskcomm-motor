/**
 * POST /c/[org]/sair — sai da área neste aparelho.
 *
 * POST, não GET: um navegador que pré-carrega links não pode tirar ninguém da
 * área. A sessão é revogada no banco (não só o cookie apagado).
 */
import { NextResponse, type NextRequest } from "next/server";

import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { nomeDoCookieDaArea } from "@/lib/area-do-cliente/sessao";
import { caminhoDaArea } from "@/lib/area-do-cliente/vocabulario";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ org: string }> };

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (sessao) {
    await admin.from("area_sessoes").update({ revoked_at: new Date().toISOString() }).eq("id", sessao.sessaoId);
    await registrarEvento(admin, { organizationId: org.id, contactId: sessao.contactId, tipo: "saiu", sessaoId: sessao.sessaoId });
  }
  const resposta = NextResponse.redirect(new URL(caminhoDaArea(org.slug), req.url), 303);
  resposta.cookies.delete(nomeDoCookieDaArea(org.slug));
  return resposta;
}
