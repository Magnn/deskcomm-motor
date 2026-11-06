/**
 * A LEITURA DO MAPA no servidor (migration 0959): escrever a leitura do mapa calculado, guardar, mostrar a parte
 * que cabe e dizer se já está paga. As rotas ficam em `app/api/v1/area/publica/[org]/mapa/leitura`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { env } from "@/lib/env";
import { idiomaDaAreaOuPortugues } from "@/lib/i18n/area-servidor";
import { logger } from "@/lib/logger";
import type { MapaNatal } from "@/lib/relatorio/mapa-natal";

import { diaNoFuso } from "./dados";
import { registrarEvento } from "./eventos";
import { PARTES_DO_MAPA, leituraDoMapaNaTela, posicoesDoMapa, type LeituraDoMapa, type LeituraDoMapaNaTela } from "./leitura-do-mapa";
import { lerOMapa } from "./leitura-do-mapa-ia";

export interface Nascimento {
  data: string;
  hora: string | null;
  cidade_id: number;
}

export interface LeituraDoMapaGuardada extends LeituraDoMapaNaTela {
  id: string;
  quando: string;
  paga: boolean;
  nascimento: Nascimento;
}

type Linha = { id: string; nascimento: unknown; leitura: unknown; pago_at: string | null; created_at: string };
const COLUNAS = "id, nascimento, leitura, pago_at, created_at";

/** A leitura gravada, conferida: um jsonb sem partes válidas não vai à tela. */
function lerGravada(v: unknown): LeituraDoMapa | null {
  if (!v || typeof v !== "object") return null;
  const l = v as Partial<LeituraDoMapa>;
  if (!Array.isArray(l.partes) || typeof l.sintese !== "string" || typeof l.passo !== "string") return null;
  const partes = l.partes.filter((p) => p && (PARTES_DO_MAPA as readonly string[]).includes(p.parte) && typeof p.leitura === "string");
  return partes.length > 0 ? { partes, sintese: l.sintese, passo: l.passo } : null;
}

function naTela(l: Linha): LeituraDoMapaGuardada | null {
  const leitura = lerGravada(l.leitura);
  if (!leitura) return null;
  const paga = l.pago_at !== null;
  return { id: l.id, quando: l.created_at, paga, nascimento: l.nascimento as Nascimento, ...leituraDoMapaNaTela(leitura, paga) };
}

/** A leitura mais nova da pessoa (a tela mostra uma). */
export async function ultimaLeituraDoMapa(admin: SupabaseClient, orgId: string, contactId: string): Promise<LeituraDoMapaGuardada | null> {
  const { data } = await admin
    .from("area_mapas")
    .select(COLUNAS)
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(1);
  const l = ((data ?? []) as Linha[])[0];
  return l ? naTela(l) : null;
}

export async function umaLeituraDoMapa(admin: SupabaseClient, orgId: string, contactId: string, id: string): Promise<LeituraDoMapaGuardada | null> {
  const { data } = await admin
    .from("area_mapas")
    .select(COLUNAS)
    .eq("id", id)
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .maybeSingle();
  return data ? naTela(data as Linha) : null;
}

/** Quantas leituras do mapa ela pediu hoje (no fuso da empresa). */
export async function leiturasDoMapaHoje(admin: SupabaseClient, org: { id: string; fuso: string }, contactId: string): Promise<number> {
  const { data } = await admin
    .from("area_mapas")
    .select("created_at")
    .eq("organization_id", org.id)
    .eq("contact_id", contactId)
    .gte("created_at", new Date(Date.now() - 36 * 3_600_000).toISOString())
    .limit(50);
  const hoje = diaNoFuso(new Date().toISOString(), org.fuso);
  return ((data ?? []) as Array<{ created_at: string }>).filter((l) => diaNoFuso(l.created_at, org.fuso) === hoje).length;
}

export type ResultadoDaLeituraDoMapa = { ok: true; leitura: LeituraDoMapaGuardada } | { ok: false };

/** Escreve e grava a leitura (ainda não paga) do mapa já calculado. */
export async function escreverLeituraDoMapa(
  admin: SupabaseClient,
  org: { id: string; nome: string; titulo: string },
  d: { contactId: string; sessaoId: string; primeiroNome: string; mapa: MapaNatal; nascimento: Nascimento; precoCents: number },
): Promise<ResultadoDaLeituraDoMapa> {
  let lida: Awaited<ReturnType<typeof lerOMapa>>;
  try {
    lida = await lerOMapa(getRequestPool(), llmEdgeConfigFromEnv(env), {
      organizationId: org.id,
      contactId: d.contactId,
      empresa: org.titulo || org.nome,
      primeiroNome: d.primeiroNome,
      posicoes: posicoesDoMapa(d.mapa),
      idioma: await idiomaDaAreaOuPortugues(),
    });
  } catch (err) {
    logger.error("[area.mapa] leitura não feita", { organization_id: org.id, motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200) });
    return { ok: false };
  }
  if (!lida.ok) {
    logger.warn("[area.mapa] leitura recusada", { organization_id: org.id, motivo: lida.motivo });
    return { ok: false };
  }
  const { data, error } = await admin
    .from("area_mapas")
    .insert({
      organization_id: org.id,
      contact_id: d.contactId,
      nascimento: d.nascimento,
      leitura: lida.leitura,
      modelo: lida.modelo,
      preco_cents: d.precoCents,
    })
    .select(COLUNAS)
    .single();
  const leitura = !error && data ? naTela(data as Linha) : null;
  if (!leitura) {
    logger.error("[area.mapa] leitura não gravada", { organization_id: org.id, motivo: error?.message?.slice(0, 200) });
    return { ok: false };
  }
  await registrarEvento(admin, { organizationId: org.id, contactId: d.contactId, tipo: "mapa_lido", sessaoId: d.sessaoId });
  return { ok: true, leitura };
}
