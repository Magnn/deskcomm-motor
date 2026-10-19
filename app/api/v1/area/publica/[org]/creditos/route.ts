/**
 * /api/v1/area/publica/[org]/creditos — a carteira de quem está na área.
 *
 * GET: o saldo e o extrato (a tela consulta enquanto espera o Pix cair).
 * POST `{ pacote, forma }`: a cobrança de um dos pacotes da configuração (Pix para mostrar na área, ou o link
 * da Stripe para cartão). Quem credita é o aviso de pagamento (`liberarCompraDaArea`), nunca esta rota.
 */
import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { SemPagamento, criarCobrancaDaArea } from "@/lib/area-do-cliente/cobranca";
import { EXTRA_DOS_CREDITOS } from "@/lib/area-do-cliente/creditos";
import { carregarCarteira, configDosCreditos } from "@/lib/area-do-cliente/creditos-servidor";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({
  pacote: z.number().int().min(0).max(3),
  forma: z.enum(["pix", "cartao"]),
});
type Ctx = { params: Promise<{ org: string }> };

const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  if (!configDosCreditos(org.config.creditos).ativo) return ERRO(404, "not_found", "Os créditos não estão disponíveis.");
  const carteira = await carregarCarteira(admin, org.id, sessao.contactId);
  return NextResponse.json({ data: carteira }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const cfg = configDosCreditos(org.config.creditos);
  if (!cfg.ativo) return ERRO(404, "not_found", "Os créditos não estão disponíveis.");

  const limite = await checkRateLimit(`area:creditos:${sessao.contactId}`, 8, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Escolha um pacote.");
  const pacote = cfg.pacotes[lido.data.pacote];
  if (!pacote) return ERRO(422, "validation_failed", "Escolha um pacote.");

  try {
    const cobranca = await criarCobrancaDaArea(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      forma: lido.data.forma,
      valorCentavos: pacote.preco_cents,
      descricao: `${pacote.creditos} créditos`,
      produto: `${pacote.creditos} créditos`,
      extra: EXTRA_DOS_CREDITOS,
      // Cada compra é uma cobrança nova: a mesma pessoa pode comprar o mesmo pacote duas vezes.
      referencia: `creditos-${randomUUID()}`,
      metadados: { creditos: String(pacote.creditos) },
      mensagemDepoisDePagar: "Pagamento confirmado! Volte para a sua área: os seus créditos já estão lá.",
    });
    await registrarEvento(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      tipo: "creditos_checkout",
      sessaoId: sessao.sessaoId,
      props: { creditos: pacote.creditos, preco_cents: pacote.preco_cents, forma: lido.data.forma },
    });
    return NextResponse.json({ data: { cobranca } }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SemPagamento) return ERRO(503, "pagamento_indisponivel", "O pagamento não está disponível agora. Fale com a gente.");
    logger.error("[area.creditos] cobrança não criada", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return ERRO(502, "pagamento_indisponivel", "Não foi possível gerar o pagamento agora. Tente de novo em instantes.");
  }
}
