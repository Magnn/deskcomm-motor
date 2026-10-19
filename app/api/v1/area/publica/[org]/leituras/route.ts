/**
 * POST /api/v1/area/publica/[org]/leituras — pedir uma leitura da Mesa: grava a leitura (ainda não paga) e
 * devolve a cobrança (Pix para mostrar na própria área, ou o link da Stripe para cartão).
 *
 * O preço é o de entrada se é a primeira leitura PAGA da pessoa nesta modalidade; senão o normal
 * (`precoDaLeitura`). Respeita o limite de leituras pagas no dia (`cabeHoje`). É o aviso de pagamento da
 * Stripe que marca a leitura como paga (`liberarCompraDaArea`), não esta rota.
 *
 * `forma: "creditos"` (com os créditos ligados): paga ali mesmo com o saldo da carteira, 1 crédito por real do
 * preço (`creditosDoPreco`). O débito é da função do banco, que recusa saldo insuficiente; a leitura já volta
 * paga e a pessoa vai direto para a mesa.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { SemPagamento, criarCobrancaDaArea } from "@/lib/area-do-cliente/cobranca";
import { creditosDoPreco } from "@/lib/area-do-cliente/creditos";
import { configDosCreditos, moverCreditos } from "@/lib/area-do-cliente/creditos-servidor";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { EXTRA_DA_LEITURA, MODALIDADES, NOME_DA_MODALIDADE, cabeHoje, precoDaLeitura } from "@/lib/area-do-cliente/leituras";
import { configDasLeituras, jaPagouNaModalidade, pagasHoje } from "@/lib/area-do-cliente/leituras-servidor";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({
  modalidade: z.enum(MODALIDADES),
  pergunta: z.string().trim().min(3).max(400),
  forma: z.enum(["pix", "cartao", "creditos"]),
});
type Ctx = { params: Promise<{ org: string }> };

const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const cfg = configDasLeituras(org.config.leituras);
  if (!cfg.ativo) return ERRO(404, "not_found", "A mesa de leituras não está disponível.");

  const limite = await checkRateLimit(`area:leitura:${sessao.contactId}`, 10, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Escreva a sua pergunta (de 3 a 400 letras).");
  const { modalidade, pergunta, forma } = lido.data;

  if (!cabeHoje(await pagasHoje(admin, org, sessao.contactId), cfg.limite_por_dia)) {
    return ERRO(429, "limite_do_dia", "Por hoje a mesa já fez as suas leituras. Amanhã ela abre de novo para você.");
  }
  const preco = precoDaLeitura(cfg, await jaPagouNaModalidade(admin, org.id, sessao.contactId, modalidade));
  if (forma === "creditos" && !configDosCreditos(org.config.creditos).ativo) {
    return ERRO(422, "validation_failed", "Escolha Pix ou cartão.");
  }

  const { data: criada, error } = await admin
    .from("area_leituras")
    .insert({ organization_id: org.id, contact_id: sessao.contactId, modalidade, pergunta, preco_cents: preco })
    .select("id")
    .single();
  if (error || !criada) {
    logger.error("[area.leitura] leitura não criada", { organization_id: org.id, motivo: error?.message?.slice(0, 200) });
    return ERRO(500, "internal_error", "Não foi possível abrir a mesa agora. Tente de novo.");
  }
  const leituraId = (criada as { id: string }).id;

  if (forma === "creditos") {
    const custo = creditosDoPreco(preco);
    const movido = await moverCreditos(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      delta: -custo,
      motivo: "leitura",
      referencia: `leitura-${leituraId}`,
    }).catch((err: unknown) => {
      logger.error("[area.leitura] débito de créditos falhou", {
        organization_id: org.id,
        motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      });
      return null;
    });
    if (!movido || movido.resultado === "sem_saldo") {
      // A leitura não paga não fica para trás como pedido abandonado.
      await admin.from("area_leituras").delete().eq("id", leituraId).eq("organization_id", org.id).is("pago_at", null);
      return movido
        ? NextResponse.json(
            { error: { code: "sem_saldo", message: "Os seus créditos não bastam para esta leitura.", details: { saldo: movido.saldo, custo } } },
            { status: 402 },
          )
        : ERRO(500, "internal_error", "Não foi possível usar os créditos agora. Tente de novo.");
    }
    await admin
      .from("area_leituras")
      .update({ pago_at: new Date().toISOString(), pagamento: "creditos" })
      .eq("id", leituraId)
      .eq("organization_id", org.id);
    await registrarEvento(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      tipo: "leitura_paga",
      sessaoId: sessao.sessaoId,
      props: { modalidade, metodo: "creditos", creditos: custo },
    });
    return NextResponse.json(
      { data: { leitura_id: leituraId, preco_cents: preco, paga: true, creditos: custo, saldo: movido.saldo } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const nome = NOME_DA_MODALIDADE[modalidade];
    const cobranca = await criarCobrancaDaArea(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      forma,
      valorCentavos: preco,
      descricao: `Leitura de ${nome}`,
      produto: `Leitura de ${nome}`,
      extra: EXTRA_DA_LEITURA,
      referencia: `leitura-${leituraId}`,
      metadados: { leitura_id: leituraId, modalidade },
      mensagemDepoisDePagar: "Pagamento confirmado! Volte para a sua área: as cartas já estão na mesa esperando por você.",
    });
    await registrarEvento(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      tipo: "leitura_checkout",
      sessaoId: sessao.sessaoId,
      props: { modalidade, forma, preco_cents: preco },
    });
    return NextResponse.json({ data: { leitura_id: leituraId, preco_cents: preco, cobranca } }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SemPagamento) return ERRO(503, "pagamento_indisponivel", "O pagamento não está disponível agora. Fale com a gente.");
    logger.error("[area.leitura] cobrança não criada", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return ERRO(502, "pagamento_indisponivel", "Não foi possível gerar o pagamento agora. Tente de novo em instantes.");
  }
}
