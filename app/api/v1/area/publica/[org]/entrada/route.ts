/**
 * POST /api/v1/area/publica/[org]/entrada — a entrada pelo plano de 7 dias, comprada na página por quem ainda não tem
 * área (migration 0955, `lib/area-do-cliente/entrada.ts`).
 *
 * Mesmo desenho dos quizzes (`../quiz/[tipo]/route.ts`): o e-mail acha ou cria o contato, o pedido nasce antes do
 * pagamento, a cobrança leva o id dele, e a área abre pelo segredo deste pedido. O VALOR sai do Plano da Semana da
 * empresa, nunca do navegador. Uma entrada por pessoa: quem já teve plano ou entrada recebe 409 e vai para a área.
 * A entrada não guarda o cartão: nada é cobrado depois sem ela escolher.
 */
import { NextResponse, type NextRequest } from "next/server";

import { SemPagamento, criarCobrancaDaArea } from "@/lib/area-do-cliente/cobranca";
import { nascimentoAceito, pedidoDeEntradaSchema, podeComprarAEntrada } from "@/lib/area-do-cliente/entrada";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea, dentroDoLimite } from "@/lib/area-do-cliente/http";
import { precoDaOferta } from "@/lib/area-do-cliente/moeda-do-visitante";
import { DIAS_DO_PLANO, EXTRA_DO_PLANO_SEMANAL, configDoPlanoSemanal } from "@/lib/area-do-cliente/plano-semanal";
import { gerarToken, hashDoToken } from "@/lib/area-do-cliente/token";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ org: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  if (!(await dentroDoLimite(req, "entrada", 8, 600))) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org } = ctx;
  const plano = configDoPlanoSemanal(org.config.plano_semanal);
  if (!plano.ativo) return ERRO(404, "not_found", "O plano não está disponível.");

  const lido = pedidoDeEntradaSchema.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Confira o nome, o e-mail e a data.");
  const p = lido.data;
  if (p.nascimento && !nascimentoAceito(p.nascimento)) return ERRO(422, "validation_failed", "Confira a data de nascimento.");
  const valor = precoDaOferta(plano, p.moeda);
  if (valor === null) return ERRO(422, "validation_failed", "O plano não é vendido nesta moeda.");
  if (p.moeda !== "BRL" && p.forma === "pix") return ERRO(422, "validation_failed", "Fora do Brasil o pagamento é no cartão.");

  const { data: existente } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", org.id)
    .eq("email_normalized", p.email)
    .is("is_merged_into", null)
    .maybeSingle();
  let contactId = (existente as { id: string } | null)?.id ?? null;

  if (contactId) {
    const [planos, entradas] = await Promise.all([
      admin.from("area_planos").select("id").eq("organization_id", org.id).eq("contact_id", contactId).limit(1),
      admin.from("area_entradas").select("id").eq("organization_id", org.id).eq("contact_id", contactId).not("pago_at", "is", null).limit(1),
    ]);
    if (planos.error || entradas.error) {
      logger.error("[area.entrada] histórico não lido", { organization_id: org.id, motivo: (planos.error ?? entradas.error)?.message });
      return ERRO(500, "internal_error", "Não foi possível continuar agora. Tente de novo.");
    }
    const historico = { jaTevePlano: (planos.data ?? []).length > 0, jaPagouEntrada: (entradas.data ?? []).length > 0 };
    if (!podeComprarAEntrada(historico)) {
      return ERRO(409, "ja_tem_area", "Você já tem a sua área. Entre com o seu e-mail para continuar o plano por lá.");
    }
  } else {
    const { data: novo, error } = await admin
      .from("contacts")
      .insert({
        organization_id: org.id,
        name: p.nome,
        email: p.email,
        ...(p.nascimento ? { birthdate: p.nascimento } : {}),
        source: "site",
        source_metadata: { origem: "entrada", foco: p.foco },
      })
      .select("id")
      .single();
    if (error || !novo) {
      logger.error("[area.entrada] contato não criado", { organization_id: org.id, motivo: error?.message });
      return ERRO(500, "internal_error", "Não foi possível continuar agora. Tente de novo.");
    }
    contactId = (novo as { id: string }).id;
  }

  const segredo = gerarToken();
  const { data: pedido, error: erroDoPedido } = await admin
    .from("area_entradas")
    .insert({
      organization_id: org.id,
      contact_id: contactId,
      nome: p.nome,
      nascimento: p.nascimento ?? null,
      foco: p.foco,
      moeda: p.moeda,
      segredo_hash: hashDoToken(segredo),
    })
    .select("id")
    .single();
  if (erroDoPedido || !pedido) {
    logger.error("[area.entrada] pedido não gravado", { organization_id: org.id, motivo: erroDoPedido?.message });
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
      descricao: `${plano.nome} — ${DIAS_DO_PLANO} dias`,
      produto: plano.nome,
      extra: EXTRA_DO_PLANO_SEMANAL,
      referencia: `entrada-${pedidoId}`,
      metadados: { entrada_id: pedidoId, moeda: p.moeda },
      mensagemDepoisDePagar: "Pagamento confirmado! Volte para a página: a sua área já está abrindo.",
      // Sem cartão guardado: nada renova sozinho depois dos 7 dias.
      guardarCartao: false,
    });
    await registrarEvento(admin, {
      organizationId: org.id,
      contactId,
      tipo: "plano_checkout",
      props: { origem: "entrada", forma: p.forma, moeda: p.moeda, preco_cents: valor, foco: p.foco },
    });
    return NextResponse.json({ data: { id: pedidoId, segredo, cobranca } }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SemPagamento) return ERRO(503, "sem_pagamento", "O pagamento não está disponível agora.");
    logger.error("[area.entrada] cobrança não criada", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return ERRO(502, "cobranca_indisponivel", "Não foi possível gerar o pagamento agora. Tente de novo.");
  }
}
