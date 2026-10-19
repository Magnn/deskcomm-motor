/**
 * POST /api/v1/area/publica/[org]/contribuicao — a contribuição voluntária, de valor livre. Não libera nada nem
 * muda o atendimento: é receita no ledger e um evento no painel. O valor vem do corpo, conferido contra o mínimo
 * da empresa e o teto (`valorDaContribuicaoValido`).
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { SemPagamento, criarCobrancaDaArea } from "@/lib/area-do-cliente/cobranca";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { EXTRA_DA_CONTRIBUICAO, valorDaContribuicaoValido } from "@/lib/area-do-cliente/simpatias";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({ forma: z.enum(["pix", "cartao"]), valor_cents: z.number().int() });
type Ctx = { params: Promise<{ org: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });
/** O mesmo valor no mesmo intervalo devolve a MESMA cobrança (clique duplo não cobra duas vezes). */
const JANELA_DA_REFERENCIA_MS = 10 * 60_000;

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const oferta = org.config.contribuicao;
  if (!oferta?.ativo) return ERRO(404, "not_found", "A contribuição não está disponível.");

  const limite = await checkRateLimit(`area:contribuicao:${sessao.contactId}`, 10, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success || !valorDaContribuicaoValido(lido.data.valor_cents, oferta.minimo_cents)) {
    return ERRO(422, "validation_failed", "Escolha um valor válido.");
  }

  try {
    const cobranca = await criarCobrancaDaArea(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      forma: lido.data.forma,
      valorCentavos: lido.data.valor_cents,
      descricao: "Contribuição voluntária",
      produto: "Contribuição voluntária",
      extra: EXTRA_DA_CONTRIBUICAO,
      referencia: `contribuicao-${sessao.contactId}-${lido.data.valor_cents}-${Math.floor(Date.now() / JANELA_DA_REFERENCIA_MS)}`,
      mensagemDepoisDePagar: "Obrigada pela sua contribuição!",
    });
    await registrarEvento(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      tipo: "contribuicao_checkout",
      sessaoId: sessao.sessaoId,
      props: { forma: lido.data.forma, valor_cents: lido.data.valor_cents },
    });
    return NextResponse.json({ data: cobranca }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SemPagamento) return ERRO(503, "pagamento_indisponivel", "O pagamento não está disponível agora. Fale com a gente.");
    logger.error("[area.contribuicao] cobrança não criada", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return ERRO(502, "pagamento_indisponivel", "Não foi possível gerar o pagamento agora. Tente de novo em instantes.");
  }
}
