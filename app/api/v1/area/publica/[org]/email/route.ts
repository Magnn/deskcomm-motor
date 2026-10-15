/**
 * POST /api/v1/area/publica/[org]/email — a pessoa, já dentro da área, informa
 * o e-mail dela. É ele que permite entrar de novo pelo código, em outro
 * aparelho, sem precisar de um link novo.
 *
 * Só grava se o contato ainda não tem e-mail: trocar o e-mail de um cadastro é
 * trocar a chave de entrada dele, e isso não pode ser feito por quem só tem um
 * cookie. E-mail que já é de outro contato da mesma empresa é recusado.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({ email: z.string().trim().toLowerCase().email().max(200) });
type Ctx = { params: Promise<{ org: string }> };

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return NextResponse.json({ error: { code: "unauthenticated", message: "Entre na sua área." } }, { status: 401 });

  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return NextResponse.json({ error: { code: "validation_failed", message: "Digite um e-mail válido." } }, { status: 422 });

  const { data, error } = await admin
    .from("contacts")
    .update({ email: lido.data.email })
    .eq("id", sessao.contactId)
    .eq("organization_id", org.id)
    .is("email", null)
    .select("id");
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: { code: "conflict", message: "Este e-mail já está em outro cadastro. Fale com a gente pelo botão abaixo." } },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: { code: "internal_error", message: "Não foi possível salvar agora." } }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: { code: "conflict", message: "Seu cadastro já tem um e-mail." } }, { status: 409 });
  }
  await registrarEvento(admin, { organizationId: org.id, contactId: sessao.contactId, tipo: "email_salvo", sessaoId: sessao.sessaoId });
  return NextResponse.json({ data: { salvo: true } }, { headers: { "Cache-Control": "no-store" } });
}
