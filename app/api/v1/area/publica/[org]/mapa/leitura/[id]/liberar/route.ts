/**
 * POST /api/v1/area/publica/[org]/mapa/leitura/[id]/liberar — abrir a leitura inteira do mapa (as partes
 * fechadas, a síntese e o passo).
 *
 * `forma: "creditos"` (com os créditos ligados): paga ali mesmo com o saldo, 1 crédito por real do preço; o
 * débito é da função do banco, que recusa saldo insuficiente, e a referência é única por leitura — tocar duas
 * vezes não cobra duas. Pix e cartão: a cobrança sai com o id da leitura nos metadados e é o aviso da Stripe
 * que marca o pago (`liberarCompraDaArea`).
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { SemPagamento, criarCobrancaDaArea } from "@/lib/area-do-cliente/cobranca";
import { creditosDoPreco } from "@/lib/area-do-cliente/creditos";
import { configDosCreditos, moverCreditos } from "@/lib/area-do-cliente/creditos-servidor";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { EXTRA_DA_LEITURA_DO_MAPA } from "@/lib/area-do-cliente/leitura-do-mapa";
import { umaLeituraDoMapa } from "@/lib/area-do-cliente/leitura-do-mapa-servidor";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const corpo = z.strictObject({ forma: z.enum(["pix", "cartao", "creditos"]) });
type Ctx = { params: Promise<{ org: string; id: string }> };

const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug, id } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  if (!UUID.test(id)) return NAO_ENCONTRADA();
  const limite = await checkRateLimit(`area:mapa-liberar:${sessao.contactId}`, 10, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Escolha como pagar.");
  const { forma } = lido.data;

  const { data } = await admin
    .from("area_mapas")
    .select("id, preco_cents, pago_at")
    .eq("id", id)
    .eq("organization_id", org.id)
    .eq("contact_id", sessao.contactId)
    .maybeSingle();
  const linha = data as { id: string; preco_cents: number; pago_at: string | null } | null;
  if (!linha) return NAO_ENCONTRADA();
  const jaPaga = async () =>
    NextResponse.json({ data: { paga: true, leitura: await umaLeituraDoMapa(admin, org.id, sessao.contactId, id) } }, { headers: { "Cache-Control": "no-store" } });
  if (linha.pago_at) return jaPaga();
  // O preço é o gravado quando a leitura foi escrita: o que a tela mostrou é o que se cobra.
  const preco = linha.preco_cents;

  if (forma === "creditos") {
    if (!configDosCreditos(org.config.creditos).ativo) return ERRO(422, "validation_failed", "Escolha Pix ou cartão.");
    const custo = creditosDoPreco(preco);
    const movido = await moverCreditos(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      delta: -custo,
      motivo: "leitura",
      referencia: `mapa-${id}`,
    }).catch((err: unknown) => {
      logger.error("[area.mapa] débito de créditos falhou", {
        organization_id: org.id,
        motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      });
      return null;
    });
    if (!movido) return ERRO(500, "internal_error", "Não foi possível usar os créditos agora. Tente de novo.");
    if (movido.resultado === "sem_saldo") {
      return NextResponse.json(
        { error: { code: "sem_saldo", message: "Os seus créditos não bastam para esta leitura.", details: { saldo: movido.saldo, custo } } },
        { status: 402 },
      );
    }
    await admin
      .from("area_mapas")
      .update({ pago_at: new Date().toISOString(), pagamento: "creditos" })
      .eq("id", id)
      .eq("organization_id", org.id)
      .is("pago_at", null);
    if (movido.resultado === "aplicado") {
      await registrarEvento(admin, {
        organizationId: org.id,
        contactId: sessao.contactId,
        tipo: "mapa_pago",
        sessaoId: sessao.sessaoId,
        props: { metodo: "creditos", creditos: custo },
      });
    }
    return NextResponse.json(
      { data: { paga: true, saldo: movido.saldo, leitura: await umaLeituraDoMapa(admin, org.id, sessao.contactId, id) } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const cobranca = await criarCobrancaDaArea(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      forma,
      valorCentavos: preco,
      descricao: "Leitura do mapa astral",
      produto: "Leitura do mapa astral",
      extra: EXTRA_DA_LEITURA_DO_MAPA,
      referencia: `mapa-${id}`,
      metadados: { mapa_id: id },
      mensagemDepoisDePagar: "Pagamento confirmado! Volte para a sua área: a leitura inteira do seu mapa já está aberta.",
    });
    await registrarEvento(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      tipo: "mapa_checkout",
      sessaoId: sessao.sessaoId,
      props: { forma, preco_cents: preco },
    });
    return NextResponse.json({ data: { paga: false, cobranca } }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SemPagamento) return ERRO(503, "pagamento_indisponivel", "O pagamento não está disponível agora. Fale com a gente.");
    logger.error("[area.mapa] cobrança não criada", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return ERRO(502, "pagamento_indisponivel", "Não foi possível gerar o pagamento agora. Tente de novo em instantes.");
  }
}
