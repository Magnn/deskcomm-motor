/**
 * POST /api/v1/area/publica/[org]/sinastria — o pedido do quiz "Vocês combinam?" (migration 0942).
 *
 * Público: quem chega pelo anúncio ainda não tem área. O e-mail acha o contato (ou cria um novo, com origem
 * `quiz`), o pedido nasce antes do pagamento e a cobrança sai com o id dele nos metadados — é o aviso da Stripe
 * que marca o pago (`liberarCompraDaArea`).
 *
 * O ACESSO AO RESULTADO NÃO É A ÁREA DO CONTATO: quem digita o e-mail de outra pessoa não pode entrar na área
 * dela. A resposta devolve um segredo só deste pedido (o banco guarda o hash), e é ele que abre o resultado. A
 * área inteira continua com o caminho de sempre: o código por e-mail.
 */
import { NextResponse, type NextRequest } from "next/server";

import { SemPagamento, criarCobrancaDaArea } from "@/lib/area-do-cliente/cobranca";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea, dentroDoLimite } from "@/lib/area-do-cliente/http";
import { EXTRA_DA_SINASTRIA, pedidoDoQuizSchema, previaDaSinastria } from "@/lib/area-do-cliente/sinastria";
import { gerarToken, hashDoToken } from "@/lib/area-do-cliente/token";
import { precoDaOferta } from "@/lib/area-do-cliente/moeda-do-visitante";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ org: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  if (!(await dentroDoLimite(req, "sinastria", 8, 600))) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org } = ctx;
  const oferta = org.config.sinastria_quiz;
  if (!oferta?.ativo) return ERRO(404, "not_found", "Esta leitura não está disponível.");

  const lido = pedidoDoQuizSchema.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Confira os nomes, as datas e o e-mail.");
  const p = lido.data;
  // O valor sai da oferta, nunca do navegador; moeda sem preço configurado é recusada, e Pix é só em reais.
  const valor = precoDaOferta(oferta, p.moeda);
  if (valor === null) return ERRO(422, "validation_failed", "Esta leitura não é vendida nesta moeda.");
  if (p.moeda !== "BRL" && p.forma === "pix") return ERRO(422, "validation_failed", "Fora do Brasil o pagamento é no cartão.");
  const previa = previaDaSinastria(p.nascimento_dela, p.nascimento_dele);
  if (!previa) return ERRO(422, "validation_failed", "Confira as datas de nascimento.");

  // O contato: o do e-mail, ou um novo. Sem sessão para ninguém — o resultado abre pelo segredo do pedido.
  const { data: existente } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", org.id)
    .eq("email_normalized", p.email)
    .is("is_merged_into", null)
    .maybeSingle();
  let contactId = (existente as { id: string } | null)?.id ?? null;
  if (!contactId) {
    const { data: novo, error } = await admin
      .from("contacts")
      .insert({
        organization_id: org.id,
        name: p.nome_dela,
        email: p.email,
        birthdate: p.nascimento_dela,
        source: "site",
        source_metadata: { origem: "quiz", quiz: "sinastria" },
      })
      .select("id")
      .single();
    if (error || !novo) {
      logger.error("[area.sinastria] contato não criado", { organization_id: org.id, motivo: error?.message });
      return ERRO(500, "internal_error", "Não foi possível continuar agora. Tente de novo.");
    }
    contactId = (novo as { id: string }).id;
  }

  const segredo = gerarToken();
  const { data: pedido, error: erroDoPedido } = await admin
    .from("area_sinastrias")
    .insert({
      organization_id: org.id,
      contact_id: contactId,
      nome_dela: p.nome_dela,
      nascimento_dela: p.nascimento_dela,
      nome_dele: p.nome_dele,
      nascimento_dele: p.nascimento_dele,
      respostas: p.respostas,
      segredo_hash: hashDoToken(segredo),
      // Preço de tabela em reais. A cobrança em euro ou dólar leva a moeda nos metadados, e a receita entra
      // em reais pelo valor que a Stripe converteu (aviso da Stripe).
      preco_cents: oferta.preco_cents,
    })
    .select("id")
    .single();
  if (erroDoPedido || !pedido) {
    logger.error("[area.sinastria] pedido não gravado", { organization_id: org.id, motivo: erroDoPedido?.message });
    return ERRO(500, "internal_error", "Não foi possível continuar agora. Tente de novo.");
  }
  const sinastriaId = (pedido as { id: string }).id;

  try {
    const cobranca = await criarCobrancaDaArea(admin, {
      organizationId: org.id,
      contactId,
      forma: p.forma,
      valorCentavos: valor,
      moeda: p.moeda,
      descricao: "O Código da Conexão (sinastria)",
      produto: "O Código da Conexão",
      extra: EXTRA_DA_SINASTRIA,
      referencia: `sinastria-${sinastriaId}`,
      metadados: { sinastria_id: sinastriaId, moeda: p.moeda },
      mensagemDepoisDePagar: "Pagamento confirmado. Volte para a página: a sua leitura já está sendo escrita.",
    });
    await registrarEvento(admin, { organizationId: org.id, contactId, tipo: "sinastria_checkout", props: { forma: p.forma, moeda: p.moeda } });
    return NextResponse.json(
      { data: { id: sinastriaId, segredo, cobranca, preco_cents: valor, moeda: p.moeda, previa } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof SemPagamento) return ERRO(503, "sem_pagamento", "O pagamento não está disponível agora.");
    logger.error("[area.sinastria] cobrança não criada", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return ERRO(502, "cobranca_indisponivel", "Não foi possível gerar o pagamento agora. Tente de novo.");
  }
}
