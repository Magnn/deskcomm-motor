/**
 * O QUE UM PAGAMENTO DA ÁREA LIBERA — chamado pelo aviso de pagamento da Stripe
 * depois de registrar a receita. O Círculo tem o seu próprio passo
 * (`ativarCirculo`); aqui ficam o presente e o Ano Pessoal.
 *
 * Idempotente: o aviso reentregue não libera duas vezes (o presente só marca o
 * que ainda não foi pago; o Ano Pessoal é um por pessoa por ano).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { EXTRA_DO_ANO_PESSOAL } from "./ano-pessoal";
import { EXTRA_DA_LEITURA } from "./leituras";
import { registrarEvento } from "./eventos";
import { EXTRA_DO_PRESENTE } from "./presente";

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
