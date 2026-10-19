/**
 * POST /api/v1/area/publica/[org]/simpatias — "quero que o templo faça por mim". Cria o pedido (ainda não pago)
 * e devolve o Pix ou o link de cartão; o aviso de pagamento da Stripe o marca como pago e ele entra na fila da
 * equipe (painel da área › Simpatias). O preço é o da configuração, nunca o do corpo.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { SemPagamento, criarCobrancaDaArea } from "@/lib/area-do-cliente/cobranca";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { EXTRA_DA_SIMPATIA } from "@/lib/area-do-cliente/simpatias";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({
  simpatia_id: z.string().uuid(),
  forma: z.enum(["pix", "cartao"]),
  para_quem: z.string().trim().max(200).optional(),
});
type Ctx = { params: Promise<{ org: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const oferta = org.config.simpatias;
  if (!oferta?.ativo) return ERRO(404, "not_found", "As simpatias não estão disponíveis.");

  const limite = await checkRateLimit(`area:simpatia:${sessao.contactId}`, 10, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Confira o pedido da simpatia.");

  // ⚠️ Filtro de organização: o client é service-role.
  const { data: simpatia } = await admin
    .from("area_simpatias")
    .select("id, titulo")
    .eq("id", lido.data.simpatia_id)
    .eq("organization_id", org.id)
    .eq("publicada", true)
    .maybeSingle();
  if (!simpatia) return ERRO(404, "not_found", "Esta simpatia não está disponível.");
  const { titulo } = simpatia as { id: string; titulo: string };

  const { data: criado, error } = await admin
    .from("area_simpatias_pedidos")
    .insert({
      organization_id: org.id,
      contact_id: sessao.contactId,
      simpatia_id: lido.data.simpatia_id,
      titulo,
      para_quem: lido.data.para_quem || null,
      valor_cents: oferta.preco_feita_cents,
    })
    .select("id")
    .single();
  if (error || !criado) return ERRO(500, "internal_error", "Não foi possível registrar o pedido agora.");
  const pedidoId = (criado as { id: string }).id;

  try {
    const cobranca = await criarCobrancaDaArea(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      forma: lido.data.forma,
      valorCentavos: oferta.preco_feita_cents,
      descricao: `Simpatia feita pelo templo: ${titulo}`.slice(0, 120),
      produto: "Simpatia feita pelo templo",
      extra: EXTRA_DA_SIMPATIA,
      referencia: `simpatia-${pedidoId}`,
      metadados: { pedido_id: pedidoId },
      mensagemDepoisDePagar: "Pagamento confirmado! O templo vai fazer a sua simpatia e avisar na sua área quando for feita.",
    });
    await registrarEvento(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      tipo: "simpatia_checkout",
      sessaoId: sessao.sessaoId,
      props: { forma: lido.data.forma, titulo },
    });
    return NextResponse.json({ data: cobranca }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SemPagamento) return ERRO(503, "pagamento_indisponivel", "O pagamento não está disponível agora. Fale com a gente.");
    logger.error("[area.simpatia] cobrança não criada", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return ERRO(502, "pagamento_indisponivel", "Não foi possível gerar o pagamento agora. Tente de novo em instantes.");
  }
}
