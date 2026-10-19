/**
 * POST /api/v1/area/publica/[org]/perfil — a entrada com 3 perguntas da área do cliente.
 *
 * Corpo `{ foco?, o_que_pesa?, nascimento? }`, tudo opcional: pular também grava (a linha em `area_perfis` existir
 * é o que faz a entrada não aparecer de novo). A data de nascimento vai para `contacts.birthdate`, só se ainda
 * não houver — a mesma regra de `aniversario/route.ts`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { dataDeNascimentoValida } from "@/lib/area-do-cliente/aniversario";
import { ceuDoNascimento } from "@/lib/area-do-cliente/ceu";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { FOCOS } from "@/lib/area-do-cliente/perfil";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({
  foco: z.enum(FOCOS).nullable().optional(),
  o_que_pesa: z.string().trim().max(300).nullable().optional(),
  nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
type Ctx = { params: Promise<{ org: string }> };

const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const limite = await checkRateLimit(`area:perfil:${sessao.contactId}`, 10, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Confira as respostas.");
  const { foco, o_que_pesa, nascimento } = lido.data;
  if (nascimento && !dataDeNascimentoValida(nascimento)) return ERRO(422, "validation_failed", "Confira a data.");

  const { error } = await admin.from("area_perfis").upsert(
    {
      organization_id: org.id,
      contact_id: sessao.contactId,
      foco: foco ?? null,
      o_que_pesa: o_que_pesa ? o_que_pesa : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,contact_id" },
  );
  if (error) return ERRO(500, "internal_error", "Não foi possível salvar agora.");

  if (nascimento) {
    const { data } = await admin
      .from("contacts")
      .update({ birthdate: nascimento })
      .eq("id", sessao.contactId)
      .eq("organization_id", org.id)
      .is("birthdate", null)
      .select("id");
    if (data && data.length > 0) {
      await registrarEvento(admin, { organizationId: org.id, contactId: sessao.contactId, tipo: "aniversario_salvo", sessaoId: sessao.sessaoId });
    }
  }
  await registrarEvento(admin, {
    organizationId: org.id,
    contactId: sessao.contactId,
    tipo: "perfil_salvo",
    sessaoId: sessao.sessaoId,
    props: { foco: foco ?? null, pulou: !foco && !o_que_pesa && !nascimento },
  });
  // O céu do nascimento volta já calculado: a tela revela "Sol em … · Lua em …" sem carregar a astronomia no celular.
  const { data: contato } = await admin.from("contacts").select("birthdate").eq("id", sessao.contactId).eq("organization_id", org.id).maybeSingle();
  const ceu = ceuDoNascimento((contato as { birthdate: string | null } | null)?.birthdate ?? null);
  return NextResponse.json({ data: { salvo: true, ceu } }, { headers: { "Cache-Control": "no-store" } });
}
