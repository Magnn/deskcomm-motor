/**
 * POST /api/v1/area/publica/[org]/plano-semanal — entrar (ou renovar) no Plano da Semana (migration 0953).
 *
 * Corpo `{ forma, moeda }`. A moeda é a que a tela propôs pelo fuso do aparelho (`moeda-do-visitante.ts`); o VALOR
 * sai da configuração da empresa, nunca do navegador, e moeda sem preço é recusada. Pix só em reais. Quem libera os
 * 7 dias é o aviso de pagamento da Stripe (`ativarPlanoSemanal`), não esta rota.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { SemPagamento, criarCobrancaDaArea } from "@/lib/area-do-cliente/cobranca";
import { diaNoFuso } from "@/lib/area-do-cliente/dados";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { precoDaOferta } from "@/lib/area-do-cliente/moeda-do-visitante";
import { EXTRA_DO_PLANO_SEMANAL, configDoPlanoSemanal } from "@/lib/area-do-cliente/plano-semanal";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({ forma: z.enum(["pix", "cartao"]), moeda: z.enum(["BRL", "USD", "EUR"]).default("BRL") });
type Ctx = { params: Promise<{ org: string }> };

const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const plano = configDoPlanoSemanal(org.config.plano_semanal);
  if (!plano.ativo) return ERRO(404, "not_found", "O plano não está disponível.");

  const limite = await checkRateLimit(`area:plano:${sessao.contactId}`, 10, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Forma de pagamento inválida.");
  const { forma, moeda } = lido.data;
  const valor = precoDaOferta(plano, moeda);
  if (valor === null) return ERRO(422, "validation_failed", "O plano não é vendido nesta moeda.");
  if (moeda !== "BRL" && forma === "pix") return ERRO(422, "validation_failed", "Fora do Brasil o pagamento é no cartão.");

  // A referência repete dentro da mesma hora: tocar duas vezes devolve a MESMA cobrança, não duas.
  const hora = `${diaNoFuso(new Date().toISOString(), org.fuso)}-${new Date().getUTCHours()}`;
  try {
    const cobranca = await criarCobrancaDaArea(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      forma,
      valorCentavos: valor,
      moeda,
      descricao: `${plano.nome} — 7 dias`,
      produto: plano.nome,
      extra: EXTRA_DO_PLANO_SEMANAL,
      referencia: `plano-semanal-${sessao.contactId}-${moeda}-${hora}`,
      metadados: { moeda },
      mensagemDepoisDePagar: "Pagamento confirmado! Volte para a sua área: o seu plano da semana já está liberado.",
    });
    await registrarEvento(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      tipo: "plano_checkout",
      sessaoId: sessao.sessaoId,
      props: { forma, moeda, preco_cents: valor },
    });
    return NextResponse.json({ data: cobranca }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SemPagamento) return ERRO(503, "pagamento_indisponivel", "O pagamento não está disponível agora. Fale com a gente.");
    logger.error("[area.plano] cobrança não criada", {
      organization_id: org.id,
      forma,
      moeda,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return ERRO(502, "pagamento_indisponivel", "Não foi possível gerar o pagamento agora. Tente de novo em instantes.");
  }
}
