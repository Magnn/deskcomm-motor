/**
 * O QUE UM PAGAMENTO DA ÁREA LIBERA — chamado pelo aviso de pagamento da Stripe
 * depois de registrar a receita. O Círculo tem o seu próprio passo
 * (`ativarCirculo`); aqui ficam o presente, o Ano Pessoal, a leitura da Mesa,
 * o pacote de créditos, os créditos mensais do Círculo, o pedido de simpatia
 * ("o templo faz por mim") e a contribuição voluntária.
 *
 * Idempotente: o aviso reentregue não libera duas vezes (o presente só marca o
 * que ainda não foi pago; o Ano Pessoal é um por pessoa por ano; os créditos
 * têm referência única por pagamento).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { EXTRA_DO_ANO_PESSOAL } from "./ano-pessoal";
import { EXTRA_DO_CIRCULO } from "./circulo";
import { EXTRA_DOS_CREDITOS } from "./creditos";
import { creditarCirculo, moverCreditos } from "./creditos-servidor";
import { EXTRA_DA_LEITURA } from "./leituras";
import { registrarEvento } from "./eventos";
import { EXTRA_DO_PRESENTE } from "./presente";
import { tipoDoExtra } from "./quizzes";
import { EXTRA_DA_SINASTRIA } from "./sinastria";
import { EXTRA_DA_CONTRIBUICAO, EXTRA_DA_SIMPATIA } from "./simpatias";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function liberarCompraDaArea(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  pagamentoId: string,
  extra: string,
  meta: Record<string, string>,
  metodo: string,
): Promise<void> {
  if (extra === EXTRA_DO_PRESENTE) {
    const presenteId = meta.presente_id;
    if (!presenteId || !UUID.test(presenteId)) return;
    const { data, error } = await admin
      .from("area_presentes")
      .update({ pago_at: new Date().toISOString(), pagamento: pagamentoId })
      .eq("id", presenteId)
      .eq("organization_id", organizationId)
      .eq("de_contact_id", contactId)
      .is("pago_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (data && data.length > 0) {
      await registrarEvento(admin, { organizationId, contactId, tipo: "presente_pago", props: { metodo } });
    }
    return;
  }
  if (extra === EXTRA_DA_LEITURA) {
    const leituraId = meta.leitura_id;
    if (!leituraId || !UUID.test(leituraId)) return;
    const { data, error } = await admin
      .from("area_leituras")
      .update({ pago_at: new Date().toISOString(), pagamento: pagamentoId })
      .eq("id", leituraId)
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .is("pago_at", null)
      .select("modalidade");
    if (error) throw new Error(error.message);
    const paga = (data ?? [])[0] as { modalidade: string } | undefined;
    if (paga) {
      await registrarEvento(admin, { organizationId, contactId, tipo: "leitura_paga", props: { modalidade: paga.modalidade, metodo } });
    }
    return;
  }
  if (extra === EXTRA_DOS_CREDITOS) {
    const creditos = Number(meta.creditos);
    if (!Number.isInteger(creditos) || creditos < 1 || creditos > 10_000) return;
    const movido = await moverCreditos(admin, {
      organizationId,
      contactId,
      delta: creditos,
      motivo: "pacote",
      referencia: `pagamento-${pagamentoId}`,
    });
    if (movido.resultado === "aplicado") {
      await registrarEvento(admin, { organizationId, contactId, tipo: "creditos_pagos", props: { creditos, saldo: movido.saldo, metodo } });
    }
    return;
  }
  if (extra === EXTRA_DA_SIMPATIA) {
    const pedidoId = meta.pedido_id;
    if (!pedidoId || !UUID.test(pedidoId)) return;
    const { data, error } = await admin
      .from("area_simpatias_pedidos")
      .update({ pago_at: new Date().toISOString(), pagamento: pagamentoId })
      .eq("id", pedidoId)
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .is("pago_at", null)
      .select("titulo");
    if (error) throw new Error(error.message);
    const pago = (data ?? [])[0] as { titulo: string } | undefined;
    if (pago) {
      await registrarEvento(admin, { organizationId, contactId, tipo: "simpatia_paga", props: { titulo: pago.titulo, metodo } });
    }
    return;
  }
  if (extra === EXTRA_DA_SINASTRIA) {
    // O texto é escrito depois, pela página (`/sinastria/[id]/gerar`): o aviso da Stripe não espera a IA.
    const sinastriaId = meta.sinastria_id;
    if (!sinastriaId || !UUID.test(sinastriaId)) return;
    const { data, error } = await admin
      .from("area_sinastrias")
      .update({ pago_at: new Date().toISOString(), pagamento: pagamentoId })
      .eq("id", sinastriaId)
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .is("pago_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (data && data.length > 0) {
      await registrarEvento(admin, { organizationId, contactId, tipo: "sinastria_paga", props: { metodo } });
    }
    return;
  }
  if (tipoDoExtra(extra) !== null) {
    // Os quizzes de uma pessoa (0943): como a sinastria, o texto é escrito depois, pela página.
    const pedidoId = meta.quiz_id;
    if (!pedidoId || !UUID.test(pedidoId)) return;
    const { data, error } = await admin
      .from("area_quiz_pedidos")
      .update({ pago_at: new Date().toISOString(), pagamento: pagamentoId })
      .eq("id", pedidoId)
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .is("pago_at", null)
      .select("tipo");
    if (error) throw new Error(error.message);
    const pago = (data ?? [])[0] as { tipo: string } | undefined;
    if (pago) await registrarEvento(admin, { organizationId, contactId, tipo: "quiz_pago", props: { quiz: pago.tipo, metodo } });
    return;
  }
  if (extra === EXTRA_DA_CONTRIBUICAO) {
    // Não libera nada: a receita já está no ledger. O evento é o rastro no painel (idempotente pelo ledger, que
    // recusa o mesmo pagamento duas vezes antes de chegar aqui).
    await registrarEvento(admin, { organizationId, contactId, tipo: "contribuicao_paga", props: { metodo } });
    return;
  }
  if (extra === EXTRA_DO_CIRCULO) {
    // O acesso do mês é do `ativarCirculo` (no aviso); aqui só os créditos mensais, se a empresa os ligou.
    await creditarCirculo(admin, organizationId, contactId, pagamentoId);
    return;
  }
  if (extra === EXTRA_DO_ANO_PESSOAL) {
    const ano = Number(meta.ano);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2200) return;
    const { data, error } = await admin
      .from("area_ano_pessoal")
      .upsert({ organization_id: organizationId, contact_id: contactId, ano, pagamento: pagamentoId }, {
        onConflict: "organization_id,contact_id,ano",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) throw new Error(error.message);
    if (data && data.length > 0) {
      await registrarEvento(admin, { organizationId, contactId, tipo: "ano_pessoal_pago", props: { ano, metodo } });
    }
  }
}
