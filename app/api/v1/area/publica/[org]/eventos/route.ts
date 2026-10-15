/**
 * POST /api/v1/area/publica/[org]/eventos — o que o NAVEGADOR conta ao painel:
 * qual serviço a pessoa viu na tela e o que ela disse que gostaria de receber.
 *
 * Só esses dois tipos entram por aqui; entrar, abrir material e clicar em
 * comprar são registrados pelo próprio servidor, onde a ação acontece. Exige a
 * sessão da área, e o serviço tem de ser desta organização.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { MAX_TEXTO_DO_EVENTO, registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("servico_visto"), servico_id: z.string().uuid() }),
  z.strictObject({
    tipo: z.literal("desejo"),
    opcao: z.string().trim().min(1).max(60).optional(),
    texto: z.string().trim().min(1).max(MAX_TEXTO_DO_EVENTO).optional(),
  }),
]);
type Ctx = { params: Promise<{ org: string }> };

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return NextResponse.json({ error: { code: "unauthenticated", message: "Entre na sua área." } }, { status: 401 });

  const limite = await checkRateLimit(`area:eventos:${sessao.sessaoId}`, 60, 60);
  if (!limite.allowed) return NextResponse.json({ error: { code: "rate_limited", message: "Calma." } }, { status: 429 });

  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return NextResponse.json({ error: { code: "validation_failed", message: "Evento inválido." } }, { status: 422 });
  const e = lido.data;

  if (e.tipo === "servico_visto") {
    const { data } = await admin
      .from("area_servicos")
      .select("id")
      .eq("id", e.servico_id)
      .eq("organization_id", org.id)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: { code: "not_found", message: "Serviço não encontrado." } }, { status: 404 });
    // Uma vista por serviço por sessão: rolar a página de novo não infla o painel.
    const { count } = await admin
      .from("area_eventos")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("sessao_id", sessao.sessaoId)
      .eq("tipo", "servico_visto")
      .eq("servico_id", e.servico_id);
    if (!count) {
      await registrarEvento(admin, {
        organizationId: org.id,
        contactId: sessao.contactId,
        tipo: "servico_visto",
        sessaoId: sessao.sessaoId,
        servicoId: e.servico_id,
      });
    }
  } else {
    if (!e.opcao && !e.texto) {
      return NextResponse.json({ error: { code: "validation_failed", message: "Escolha uma opção ou escreva." } }, { status: 422 });
    }
    await registrarEvento(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      tipo: "desejo",
      sessaoId: sessao.sessaoId,
      props: { ...(e.opcao ? { opcao: e.opcao } : {}), ...(e.texto ? { texto: e.texto } : {}) },
    });
  }
  return NextResponse.json({ data: { ok: true } }, { headers: { "Cache-Control": "no-store" } });
}
