/**
 * A INTERPRETAÇÃO DE SONHOS no servidor (migration 0952): interpretar o relato, guardar, mostrar a parte que
 * cabe e dizer se já está paga. As rotas ficam em `app/api/v1/area/publica/[org]/sonho`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { diaNoFuso } from "./dados";
import { registrarEvento } from "./eventos";
import { sonhoNaTela, type LeituraDoSonho } from "./sonho";
import { interpretarSonho } from "./sonho-ia";
import { semanaDaMeditacao } from "./meditacao";
import { PAGAMENTO_DO_PLANO, temPlanoSemanal } from "./plano-semanal";

export interface SonhoNaTela {
  id: string;
  quando: string;
  relato: string;
  paga: boolean;
  simbolos: Array<{ simbolo: string; leitura: string | null }>;
  mensagem: string | null;
  passo: string | null;
}

type Linha = { id: string; relato: string; leitura: unknown; pago_at: string | null; created_at: string };
const COLUNAS = "id, relato, leitura, pago_at, created_at";

/** A leitura gravada, conferida (um jsonb sem símbolos não vai à tela). */
function lerGravada(v: unknown): LeituraDoSonho | null {
  if (!v || typeof v !== "object") return null;
  const l = v as Partial<LeituraDoSonho>;
  if (!Array.isArray(l.simbolos) || typeof l.mensagem !== "string" || typeof l.passo !== "string") return null;
  const simbolos = l.simbolos.filter((s) => typeof s?.simbolo === "string" && typeof s?.leitura === "string");
  return simbolos.length > 0 ? { simbolos, mensagem: l.mensagem, passo: l.passo } : null;
}

function naTela(l: Linha): SonhoNaTela | null {
  const leitura = lerGravada(l.leitura);
  if (!leitura) return null;
  const paga = l.pago_at !== null;
  return { id: l.id, quando: l.created_at, relato: l.relato, paga, ...sonhoNaTela(leitura, paga) };
}

/** Os sonhos da pessoa, do mais novo para o mais antigo (até 6). */
export async function sonhosDoContato(admin: SupabaseClient, orgId: string, contactId: string): Promise<SonhoNaTela[]> {
  const { data } = await admin
    .from("area_sonhos")
    .select(COLUNAS)
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(6);
  return ((data ?? []) as Linha[]).map(naTela).filter((s): s is SonhoNaTela => s !== null);
}

export async function umSonho(admin: SupabaseClient, orgId: string, contactId: string, id: string): Promise<SonhoNaTela | null> {
  const { data } = await admin
    .from("area_sonhos")
    .select(COLUNAS)
    .eq("id", id)
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .maybeSingle();
  return data ? naTela(data as Linha) : null;
}

/** Quantos sonhos ela contou hoje (no fuso da empresa). */
export async function sonhosHoje(admin: SupabaseClient, org: { id: string; fuso: string }, contactId: string): Promise<number> {
  const desde = new Date(Date.now() - 36 * 3_600_000).toISOString();
  const { data } = await admin
    .from("area_sonhos")
    .select("created_at")
    .eq("organization_id", org.id)
    .eq("contact_id", contactId)
    .gte("created_at", desde)
    .limit(50);
  const hoje = diaNoFuso(new Date().toISOString(), org.fuso);
  return ((data ?? []) as Array<{ created_at: string }>).filter((l) => diaNoFuso(l.created_at, org.fuso) === hoje).length;
}

export type ResultadoDoRelato = { ok: true; sonho: SonhoNaTela } | { ok: false; motivo: "nao_e_sonho" | "indisponivel" };

/**
 * O sonho da semana do Plano da Semana está livre? Um por semana (de segunda a domingo, no fuso da empresa) sai
 * inteiro para quem está com o plano em dia.
 */
export async function sonhoDoPlanoLivre(admin: SupabaseClient, org: { id: string; fuso: string }, contactId: string): Promise<boolean> {
  if (!(await temPlanoSemanal(admin, org.id, contactId))) return false;
  const { data } = await admin
    .from("area_sonhos")
    .select("pago_at")
    .eq("organization_id", org.id)
    .eq("contact_id", contactId)
    .eq("pagamento", PAGAMENTO_DO_PLANO)
    .gte("pago_at", new Date(Date.now() - 8 * 86_400_000).toISOString())
    .limit(5);
  const estaSemana = semanaDaMeditacao(diaNoFuso(new Date().toISOString(), org.fuso));
  return !((data ?? []) as Array<{ pago_at: string }>).some((l) => semanaDaMeditacao(diaNoFuso(l.pago_at, org.fuso)) === estaSemana);
}

/** Interpreta o relato e grava — já pago quando é o sonho da semana do plano; senão, só o primeiro símbolo abre. */
export async function contarSonho(
  admin: SupabaseClient,
  org: { id: string; nome: string; titulo: string; fuso: string },
  d: { contactId: string; sessaoId: string; primeiroNome: string; relato: string; precoCents: number },
): Promise<ResultadoDoRelato> {
  let lida: Awaited<ReturnType<typeof interpretarSonho>>;
  try {
    lida = await interpretarSonho(getRequestPool(), llmEdgeConfigFromEnv(env), {
      organizationId: org.id,
      contactId: d.contactId,
      empresa: org.titulo || org.nome,
      primeiroNome: d.primeiroNome,
      relato: d.relato,
    });
  } catch (err) {
    logger.error("[area.sonho] interpretação não feita", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return { ok: false, motivo: "indisponivel" };
  }
  if (!lida.ok) {
    if (lida.motivo !== "nao_e_sonho") logger.warn("[area.sonho] interpretação recusada", { organization_id: org.id, motivo: lida.motivo });
    return { ok: false, motivo: lida.motivo === "nao_e_sonho" ? "nao_e_sonho" : "indisponivel" };
  }
  const { data, error } = await admin
    .from("area_sonhos")
    .insert({
      organization_id: org.id,
      contact_id: d.contactId,
      relato: d.relato,
      leitura: lida.leitura,
      modelo: lida.modelo,
      preco_cents: d.precoCents,
      ...((await sonhoDoPlanoLivre(admin, org, d.contactId)) ? { pago_at: new Date().toISOString(), pagamento: PAGAMENTO_DO_PLANO } : {}),
    })
    .select(COLUNAS)
    .single();
  const sonho = !error && data ? naTela(data as Linha) : null;
  if (!sonho) {
    logger.error("[area.sonho] interpretação não gravada", { organization_id: org.id, motivo: error?.message?.slice(0, 200) });
    return { ok: false, motivo: "indisponivel" };
  }
  await registrarEvento(admin, { organizationId: org.id, contactId: d.contactId, tipo: "sonho_lido", sessaoId: d.sessaoId });
  return { ok: true, sonho };
}
