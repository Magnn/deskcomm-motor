/**
 * POST /api/v1/area/publica/[org]/quiz/[tipo] — o pedido de um quiz de uma pessoa (migration 0943): prosperidade
 * ou caminhos. Mesmo desenho da sinastria (`../../sinastria/route.ts`): o e-mail acha ou cria o contato, o pedido
 * nasce antes do pagamento, a cobrança leva o id dele, e o resultado abre por um segredo só deste pedido — nunca
 * pela área do dono do e-mail.
 */
import { NextResponse, type NextRequest } from "next/server";

import { SemPagamento, criarCobrancaDaArea } from "@/lib/area-do-cliente/cobranca";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea, dentroDoLimite } from "@/lib/area-do-cliente/http";
import { EXTRA_DO_QUIZ, TIPOS_DE_QUIZ, pedidoDeQuizSchema, previaDoQuiz, type TipoDeQuiz } from "@/lib/area-do-cliente/quizzes";
import { gerarToken, hashDoToken } from "@/lib/area-do-cliente/token";
import { ligarVisitaAoContato } from "@/lib/area-do-cliente/funil-dos-quizzes";
import { precoDaOferta } from "@/lib/area-do-cliente/moeda-do-visitante";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ org: string; tipo: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

const PRODUTO: Record<TipoDeQuiz, string> = {
  prosperidade: "Seu Mapa da Prosperidade",
  caminhos: "Seu Ritual de Abertura de Caminhos",
  par: "O Retrato do Par",
};

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug, tipo: bruto } = await params;
  if (!(TIPOS_DE_QUIZ as readonly string[]).includes(bruto)) return NAO_ENCONTRADA();
  const tipo = bruto as TipoDeQuiz;
  if (!(await dentroDoLimite(req, `quiz-${tipo}`, 8, 600))) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org } = ctx;
  const oferta = { prosperidade: org.config.quiz_prosperidade, caminhos: org.config.quiz_caminhos, par: org.config.quiz_par }[tipo];
  if (!oferta?.ativo) return ERRO(404, "not_found", "Esta leitura não está disponível.");

  const lido = pedidoDeQuizSchema.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Confira o nome, a data e o e-mail.");
  const p = lido.data;
  if ((tipo === "prosperidade" || tipo === "par") && !p.nascimento) return ERRO(422, "validation_failed", "Confira a data de nascimento.");
  // O valor sai da oferta, nunca do navegador; moeda sem preço configurado é recusada, e Pix é só em reais.
  const valor = precoDaOferta(oferta, p.moeda);
  if (valor === null) return ERRO(422, "validation_failed", "Esta leitura não é vendida nesta moeda.");
  if (p.moeda !== "BRL" && p.forma === "pix") return ERRO(422, "validation_failed", "Fora do Brasil o pagamento é no cartão.");
  const previa = previaDoQuiz(tipo, { nascimento: p.nascimento ?? null, respostas: p.respostas, nome: p.nome });
  if (!previa) return ERRO(422, "validation_failed", "Confira as respostas.");

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
        name: p.nome,
        email: p.email,
        ...(p.nascimento ? { birthdate: p.nascimento } : {}),
        source: "site",
        source_metadata: { origem: "quiz", quiz: tipo },
      })
      .select("id")
      .single();
    if (error || !novo) {
      logger.error("[area.quiz] contato não criado", { organization_id: org.id, quiz: tipo, motivo: error?.message });
      return ERRO(500, "internal_error", "Não foi possível continuar agora. Tente de novo.");
    }
    contactId = (novo as { id: string }).id;
  }

  await ligarVisitaAoContato(admin, { organizationId: org.id, visita: p.visita, quiz: tipo, contactId });

  const segredo = gerarToken();
  const { data: pedido, error: erroDoPedido } = await admin
    .from("area_quiz_pedidos")
    .insert({
      organization_id: org.id,
      contact_id: contactId,
      tipo,
      nome: p.nome,
      nascimento: p.nascimento ?? null,
      respostas: p.respostas,
      segredo_hash: hashDoToken(segredo),
      // Preço de tabela em reais. A cobrança em euro ou dólar leva a moeda nos metadados, e a receita entra
      // em reais pelo valor que a Stripe converteu (aviso da Stripe).
      preco_cents: oferta.preco_cents,
    })
    .select("id")
    .single();
  if (erroDoPedido || !pedido) {
    logger.error("[area.quiz] pedido não gravado", { organization_id: org.id, quiz: tipo, motivo: erroDoPedido?.message });
    return ERRO(500, "internal_error", "Não foi possível continuar agora. Tente de novo.");
  }
  const pedidoId = (pedido as { id: string }).id;

  try {
    const cobranca = await criarCobrancaDaArea(admin, {
      organizationId: org.id,
      contactId,
      forma: p.forma,
      valorCentavos: valor,
      moeda: p.moeda,
      descricao: PRODUTO[tipo],
      produto: PRODUTO[tipo],
      extra: EXTRA_DO_QUIZ(tipo),
      referencia: `quiz-${pedidoId}`,
      metadados: { quiz_id: pedidoId, moeda: p.moeda },
      mensagemDepoisDePagar: "Pagamento confirmado. Volte para a página: a sua leitura já está sendo escrita.",
    });
    await registrarEvento(admin, { organizationId: org.id, contactId, tipo: "quiz_checkout", props: { quiz: tipo, forma: p.forma, moeda: p.moeda } });
    return NextResponse.json({ data: { id: pedidoId, segredo, cobranca, previa } }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SemPagamento) return ERRO(503, "sem_pagamento", "O pagamento não está disponível agora.");
    logger.error("[area.quiz] cobrança não criada", {
      organization_id: org.id,
      quiz: tipo,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return ERRO(502, "cobranca_indisponivel", "Não foi possível gerar o pagamento agora. Tente de novo.");
  }
}
