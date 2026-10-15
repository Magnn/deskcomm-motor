/**
 * POST /api/v1/area/publica/[org]/presente — comprar uma pergunta de tarô de
 * presente. Cria o presente (ainda não pago) e devolve o Pix ou o link de
 * cartão; o aviso de pagamento da Stripe o marca como pago e o link aparece
 * na área de quem comprou.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { SemPagamento, criarCobrancaDaArea } from "@/lib/area-do-cliente/cobranca";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { EXTRA_DO_PRESENTE, gerarCodigoDoPresente } from "@/lib/area-do-cliente/presente";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({
  forma: z.enum(["pix", "cartao"]),
  para_nome: z.string().trim().max(60).optional(),
});
type Ctx = { params: Promise<{ org: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const presente = org.config.presente;
  if (!presente?.ativo) return ERRO(404, "not_found", "O presente não está disponível.");

  const limite = await checkRateLimit(`area:presente:${sessao.contactId}`, 10, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Confira os dados do presente.");

  const { data: criado, error } = await admin
    .from("area_presentes")
    .insert({
      organization_id: org.id,
      de_contact_id: sessao.contactId,
      codigo: gerarCodigoDoPresente(),
      para_nome: lido.data.para_nome || null,
    })
    .select("id")
    .single();
  if (error || !criado) return ERRO(500, "internal_error", "Não foi possível criar o presente agora.");
  const presenteId = (criado as { id: string }).id;

  try {
    const cobranca = await criarCobrancaDaArea(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      forma: lido.data.forma,
      valorCentavos: presente.preco_cents,
      descricao: "Pergunta de tarô de presente",
      produto: "Presente: pergunta de tarô",
      extra: EXTRA_DO_PRESENTE,
      referencia: `presente-${presenteId}`,
      metadados: { presente_id: presenteId },
      mensagemDepoisDePagar: "Pagamento confirmado! Volte para a sua área: o link do presente já está lá para você enviar.",
    });
    await registrarEvento(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      tipo: "presente_checkout",
      sessaoId: sessao.sessaoId,
      props: { forma: lido.data.forma },
    });
    return NextResponse.json({ data: cobranca }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SemPagamento) return ERRO(503, "pagamento_indisponivel", "O pagamento não está disponível agora. Fale com a gente.");
    logger.error("[area.presente] cobrança não criada", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return ERRO(502, "pagamento_indisponivel", "Não foi possível gerar o pagamento agora. Tente de novo em instantes.");
  }
}
