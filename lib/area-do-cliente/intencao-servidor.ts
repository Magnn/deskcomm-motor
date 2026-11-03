/**
 * A VELA no servidor (`area_velas`, 0957): ler a aberta, acender uma nova e marcar a graça.
 *
 * Quem pode acender: o Plano da Semana ou o Círculo em dia (`temAManha`); quem chama confere. Ler a vela aberta e
 * marcar a graça não exigem o plano: a vela acesa é dela até o fim, mesmo que o plano acabe no meio.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { env } from "@/lib/env";
import { idiomaDaAreaOuPortugues } from "@/lib/i18n/area-servidor";
import { logger } from "@/lib/logger";

import { diaDaVela, type PedidoDaVela, type VelaNaArea } from "./intencao";
import { escreverOracao } from "./intencao-ia";

interface Linha {
  id: string;
  por_quem: string;
  pedido: string;
  oracao: string;
  intencao: string;
  dia_acesa: string;
}

const CAMPOS = "id, por_quem, pedido, oracao, intencao, dia_acesa";

const naTela = (l: Linha, hoje: string): VelaNaArea => ({
  id: l.id,
  porQuem: l.por_quem,
  pedido: l.pedido,
  oracao: l.oracao,
  intencao: l.intencao,
  dia: diaDaVela(l.dia_acesa, hoje),
});

/** A vela aberta dela (acesa, ou apagada esperando a graça); `null` = nenhuma. Antes da 0957, `null` sem quebrar. */
export async function velaAberta(admin: SupabaseClient, orgId: string, contactId: string, hoje: string): Promise<VelaNaArea | null> {
  const { data, error } = await admin
    .from("area_velas")
    .select(CAMPOS)
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .is("graca", null)
    .maybeSingle();
  if (error || !data) return null;
  return naTela(data as Linha, hoje);
}

/** Quantas graças ela já marcou como recebidas: o fio dela. */
export async function gracasRecebidas(admin: SupabaseClient, orgId: string, contactId: string): Promise<number> {
  const { count, error } = await admin
    .from("area_velas")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .eq("graca", "veio");
  return error ? 0 : (count ?? 0);
}

export type ResultadoDaVela =
  | { ok: true; vela: VelaNaArea }
  | { ok: false; motivo: "ja_tem_vela" | "nao_e_pedido" | "indisponivel" };

/** Escreve a oração e acende. Com uma vela aberta, recusa antes de chamar a IA. */
export async function acenderVela(
  admin: SupabaseClient,
  org: { id: string; nome: string; titulo: string },
  d: { contactId: string; primeiroNome: string; pedido: PedidoDaVela; hoje: string },
): Promise<ResultadoDaVela> {
  if (await velaAberta(admin, org.id, d.contactId, d.hoje)) return { ok: false, motivo: "ja_tem_vela" };
  let r: Awaited<ReturnType<typeof escreverOracao>>;
  try {
    r = await escreverOracao(getRequestPool(), llmEdgeConfigFromEnv(env), {
      organizationId: org.id,
      contactId: d.contactId,
      empresa: org.titulo || org.nome,
      primeiroNome: d.primeiroNome,
      pedido: d.pedido,
      idioma: await idiomaDaAreaOuPortugues(),
    });
  } catch (err) {
    logger.error("[area.vela] oração não escrita", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return { ok: false, motivo: "indisponivel" };
  }
  if (!r.ok) {
    if (r.motivo !== "nao_e_pedido") logger.warn("[area.vela] resposta inválida", { organization_id: org.id });
    return { ok: false, motivo: r.motivo === "nao_e_pedido" ? "nao_e_pedido" : "indisponivel" };
  }
  const { data, error } = await admin
    .from("area_velas")
    .insert({
      organization_id: org.id,
      contact_id: d.contactId,
      por_quem: d.pedido.porQuem,
      pedido: d.pedido.pedido,
      oracao: r.oracao.oracao,
      intencao: r.oracao.intencao,
      dia_acesa: d.hoje,
      modelo: r.modelo,
    })
    .select(CAMPOS)
    .single();
  // 23505 = o índice de "uma aberta": outro toque acendeu primeiro.
  if (error?.code === "23505") return { ok: false, motivo: "ja_tem_vela" };
  if (error || !data) {
    logger.error("[area.vela] não gravada", { organization_id: org.id, motivo: error?.message?.slice(0, 200) });
    return { ok: false, motivo: "indisponivel" };
  }
  return { ok: true, vela: naTela(data as Linha, d.hoje) };
}

/**
 * Marca a graça da vela dela e a fecha. «veio» a qualquer hora (a graça pode chegar no terceiro dia); «ainda não»
 * só depois que a vela apagou.
 */
export async function marcarGraca(
  admin: SupabaseClient,
  orgId: string,
  contactId: string,
  velaId: string,
  veio: boolean,
  hoje: string,
): Promise<"ok" | "nao_encontrada" | "ainda_acesa"> {
  const vela = await velaAberta(admin, orgId, contactId, hoje);
  if (!vela || vela.id !== velaId) return "nao_encontrada";
  if (!veio && vela.dia !== null) return "ainda_acesa";
  const { error } = await admin
    .from("area_velas")
    .update({ graca: veio ? "veio" : "ainda_nao", graca_at: new Date().toISOString() })
    .eq("id", velaId)
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .is("graca", null);
  if (error) throw new Error(error.message);
  return "ok";
}
