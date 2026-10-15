/**
 * POST /api/v1/area/publica/[org]/aniversario — a pessoa conta quando faz
 * aniversário. Vai para `contacts.birthdate`, o mesmo campo que o CRM já usa.
 *
 * Só preenche o vazio: quem já tem a data no cadastro não a troca por um
 * cookie. Data no futuro ou de mais de 110 anos atrás é recusada.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { dataDeNascimentoValida } from "@/lib/area-do-cliente/aniversario";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({ data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
type Ctx = { params: Promise<{ org: string }> };

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return NextResponse.json({ error: { code: "unauthenticated", message: "Entre na sua área." } }, { status: 401 });

  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success || !dataDeNascimentoValida(lido.data.data)) {
    return NextResponse.json({ error: { code: "validation_failed", message: "Confira a data." } }, { status: 422 });
  }
  const { data, error } = await admin
    .from("contacts")
    .update({ birthdate: lido.data.data })
    .eq("id", sessao.contactId)
    .eq("organization_id", org.id)
    .is("birthdate", null)
    .select("id");
  if (error) return NextResponse.json({ error: { code: "internal_error", message: "Não foi possível salvar agora." } }, { status: 500 });
  if (data && data.length > 0) {
    await registrarEvento(admin, { organizationId: org.id, contactId: sessao.contactId, tipo: "aniversario_salvo", sessaoId: sessao.sessaoId });
  }
  return NextResponse.json({ data: { salvo: true } }, { headers: { "Cache-Control": "no-store" } });
}
