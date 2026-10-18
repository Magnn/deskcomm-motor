/**
 * POST /api/v1/area/publica/[org]/circulo — entrar (ou renovar) no Círculo.
 *
 * `{ forma: "pix" }` devolve o código copia e cola e o QR; `{ forma: "cartao" }`
 * devolve o link de pagamento da Stripe. Os dois levam nos metadados quem é a
 * pessoa e `extra: "circulo"`, e é o aviso de pagamento da Stripe que libera o
 * acesso (`ativarCirculo`), não esta rota.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { EXTRA_DO_CIRCULO } from "@/lib/area-do-cliente/circulo";
import { diaNoFuso } from "@/lib/area-do-cliente/dados";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { logger } from "@/lib/logger";
import { lerConexaoStripe } from "@/lib/pagamentos/conexao-stripe";
import { criarClienteStripe } from "@/lib/pagamentos/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({ forma: z.enum(["pix", "cartao"]) });
type Ctx = { params: Promise<{ org: string }> };

const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const circulo = org.config.circulo;
  if (!circulo?.ativo) return ERRO(404, "not_found", "O Círculo não está disponível.");

  const limite = await checkRateLimit(`area:circulo:${sessao.contactId}`, 10, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Forma de pagamento inválida.");

  const conexao = await lerConexaoStripe(admin, org.id);
  if (!conexao) return ERRO(503, "pagamento_indisponivel", "O pagamento não está disponível agora. Fale com a gente.");

  const stripe = criarClienteStripe(conexao);
  const metadados = { organization_id: org.id, contact_id: sessao.contactId, produto: circulo.nome, extra: EXTRA_DO_CIRCULO };
  const descricao = `${circulo.nome} — 30 dias`;
  // A referência repete dentro da mesma hora: tocar duas vezes devolve a MESMA cobrança, não duas.
  const hora = `${diaNoFuso(new Date().toISOString(), org.fuso)}-${new Date().getUTCHours()}`;
  try {
    if (lido.data.forma === "pix") {
      const pix = await stripe.criarPix({
        valorCentavos: circulo.preco_cents,
        descricao,
        referencia: `circulo-pix-${sessao.contactId}-${hora}`,
        metadados,
        expiraEmSegundos: 3600,
      });
      await registrarEvento(admin, { organizationId: org.id, contactId: sessao.contactId, tipo: "circulo_checkout", sessaoId: sessao.sessaoId, props: { forma: "pix" } });
      return NextResponse.json({ data: { forma: "pix", copiaECola: pix.copiaECola, qrPng: pix.qrPng } }, { headers: { "Cache-Control": "no-store" } });
    }
    const link = await stripe.criarLinkDePagamento({
      valorCentavos: circulo.preco_cents,
      moeda: "BRL",
      descricao,
      referencia: `circulo-link-${sessao.contactId}-${hora}`,
      metadados,
      mensagemDepoisDePagar: "Pagamento confirmado! Volte para a sua área: o Círculo já está liberado.",
    });
    await registrarEvento(admin, { organizationId: org.id, contactId: sessao.contactId, tipo: "circulo_checkout", sessaoId: sessao.sessaoId, props: { forma: "cartao" } });
    return NextResponse.json({ data: { forma: "cartao", url: link.url } }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error("[area.circulo] cobrança não criada", {
      organization_id: org.id,
      forma: lido.data.forma,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return ERRO(502, "pagamento_indisponivel", "Não foi possível gerar o pagamento agora. Tente de novo em instantes.");
  }
}
