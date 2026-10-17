/**
 * POST /api/v1/area/publica/[org]/etapas — a pessoa marca (ou desmarca) uma
 * etapa do trabalho dela como feita.
 *
 * Quem marca é a própria pessoa, pela sessão da área (cookie); a etapa tem de
 * existir na lista que a empresa escreveu no serviço. A equipe vê o progresso
 * pela RLS de `area_etapas_feitas` e o painel conta pelo evento `etapa_feita`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { lerEtapas } from "@/lib/area-do-cliente/etapas";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({
  servico_id: z.string().uuid(),
  indice: z.number().int().min(0).max(19),
  feita: z.boolean(),
});
type Ctx = { params: Promise<{ org: string }> };

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return NextResponse.json({ error: { code: "unauthenticated", message: "Entre na sua área." } }, { status: 401 });

  const limite = await checkRateLimit(`area:etapas:${sessao.contactId}`, 60, 3600);
  if (!limite.allowed) return NextResponse.json({ error: { code: "rate_limited", message: "Muitas marcações seguidas. Tente mais tarde." } }, { status: 429 });

  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return NextResponse.json({ error: { code: "validation_failed", message: "Etapa inválida." } }, { status: 422 });
  const { servico_id, indice, feita } = lido.data;

  const { data: servico } = await admin
    .from("area_servicos")
    .select("id, etapas")
    .eq("id", servico_id)
    .eq("organization_id", org.id)
    .maybeSingle();
  const etapas = lerEtapas((servico as { etapas: unknown } | null)?.etapas);
  if (!servico || indice >= etapas.length) {
    return NextResponse.json({ error: { code: "not_found", message: "Esta etapa não existe mais." } }, { status: 404 });
  }

  if (feita) {
    const { data, error } = await admin
      .from("area_etapas_feitas")
      .upsert(
        { organization_id: org.id, contact_id: sessao.contactId, servico_id, indice },
        { onConflict: "organization_id,contact_id,servico_id,indice", ignoreDuplicates: true },
      )
      .select("feita_em");
    if (error) return NextResponse.json({ error: { code: "internal_error", message: "Não foi possível salvar agora." } }, { status: 500 });
    // Só a marcação NOVA conta no painel; repetir o toque não infla a contagem.
    if ((data ?? []).length > 0) {
      await registrarEvento(admin, {
        organizationId: org.id,
        contactId: sessao.contactId,
        tipo: "etapa_feita",
        sessaoId: sessao.sessaoId,
        servicoId: servico_id,
        ref: String(indice),
      });
    }
    const feitaEm = (data ?? []).at(0)?.feita_em ?? new Date().toISOString();
    return NextResponse.json({ data: { indice, feita: true, feita_em: feitaEm } }, { headers: { "Cache-Control": "no-store" } });
  }

  const { error } = await admin
    .from("area_etapas_feitas")
    .delete()
    .eq("organization_id", org.id)
    .eq("contact_id", sessao.contactId)
    .eq("servico_id", servico_id)
    .eq("indice", indice);
  if (error) return NextResponse.json({ error: { code: "internal_error", message: "Não foi possível salvar agora." } }, { status: 500 });
  return NextResponse.json({ data: { indice, feita: false, feita_em: null } }, { headers: { "Cache-Control": "no-store" } });
}
