/**
 * A LEITURA DA MÃO no servidor (migration 0951): ler a foto, guardar a leitura, mostrar a parte que cabe e
 * dizer se já está paga. As rotas ficam em `app/api/v1/area/publica/[org]/mao`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { idiomaDaAreaOuPortugues } from "@/lib/i18n/area-servidor";

import { diaNoFuso } from "./dados";
import { registrarEvento } from "./eventos";
import { LINHAS_DA_MAO, leituraNaTela, type LeituraDaMao, type LinhaDaMao } from "./mao";
import { lerMao } from "./mao-ia";

export interface MaoNaTela {
  id: string;
  quando: string;
  paga: boolean;
  linhas: Array<{ linha: LinhaDaMao; visto: string; leitura: string | null }>;
  sintese: string | null;
  passo: string | null;
}

type Linha = { id: string; leitura: unknown; pago_at: string | null; created_at: string };

/** A leitura gravada, conferida (um jsonb que não tem as cinco linhas não vai à tela). */
function lerGravada(v: unknown): LeituraDaMao | null {
  if (!v || typeof v !== "object") return null;
  const l = v as Partial<LeituraDaMao>;
  if (!Array.isArray(l.linhas) || typeof l.sintese !== "string" || typeof l.passo !== "string") return null;
  const linhas = LINHAS_DA_MAO.map((id) => l.linhas!.find((x) => x?.linha === id)).filter((x) => x !== undefined);
  if (linhas.length !== LINHAS_DA_MAO.length) return null;
  return { linhas, sintese: l.sintese, passo: l.passo };
}

function naTela(l: Linha): MaoNaTela | null {
  const leitura = lerGravada(l.leitura);
  if (!leitura) return null;
  const paga = l.pago_at !== null;
  return { id: l.id, quando: l.created_at, paga, ...leituraNaTela(leitura, paga) };
}

/** As leituras da mão da pessoa, da mais nova para a mais antiga (até 6). */
export async function maosDoContato(admin: SupabaseClient, orgId: string, contactId: string): Promise<MaoNaTela[]> {
  const { data } = await admin
    .from("area_maos")
    .select("id, leitura, pago_at, created_at")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(6);
  return ((data ?? []) as Linha[]).map(naTela).filter((m): m is MaoNaTela => m !== null);
}

export async function umaMao(admin: SupabaseClient, orgId: string, contactId: string, id: string): Promise<MaoNaTela | null> {
  const { data } = await admin
    .from("area_maos")
    .select("id, leitura, pago_at, created_at")
    .eq("id", id)
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .maybeSingle();
  return data ? naTela(data as Linha) : null;
}

/** Quantas fotos de mão ela mandou hoje (no fuso da empresa). */
export async function fotosHoje(admin: SupabaseClient, org: { id: string; fuso: string }, contactId: string): Promise<number> {
  const desde = new Date(Date.now() - 36 * 3_600_000).toISOString();
  const { data } = await admin
    .from("area_maos")
    .select("created_at")
    .eq("organization_id", org.id)
    .eq("contact_id", contactId)
    .gte("created_at", desde)
    .limit(50);
  const hoje = diaNoFuso(new Date().toISOString(), org.fuso);
  return ((data ?? []) as Array<{ created_at: string }>).filter((l) => diaNoFuso(l.created_at, org.fuso) === hoje).length;
}

export type ResultadoDaFoto =
  | { ok: true; mao: MaoNaTela }
  | { ok: false; motivo: "nao_e_mao" | "indisponivel" };

/** Lê a foto e grava a leitura (ainda não paga). A foto não é guardada em lugar nenhum. */
export async function lerFotoDaMao(
  admin: SupabaseClient,
  org: { id: string; nome: string; titulo: string },
  d: { contactId: string; sessaoId: string; primeiroNome: string; foto: Buffer; mime: string; precoCents: number },
): Promise<ResultadoDaFoto> {
  let lida: Awaited<ReturnType<typeof lerMao>>;
  try {
    lida = await lerMao(getRequestPool(), llmEdgeConfigFromEnv(env), {
      organizationId: org.id,
      contactId: d.contactId,
      empresa: org.titulo || org.nome,
      primeiroNome: d.primeiroNome,
      foto: d.foto,
      mime: d.mime,
      idioma: await idiomaDaAreaOuPortugues(),
    });
  } catch (err) {
    logger.error("[area.mao] leitura não feita", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return { ok: false, motivo: "indisponivel" };
  }
  if (!lida.ok) {
    if (lida.motivo !== "nao_e_mao") logger.warn("[area.mao] leitura recusada", { organization_id: org.id, motivo: lida.motivo });
    return { ok: false, motivo: lida.motivo === "nao_e_mao" ? "nao_e_mao" : "indisponivel" };
  }
  const { data, error } = await admin
    .from("area_maos")
    .insert({
      organization_id: org.id,
      contact_id: d.contactId,
      leitura: lida.leitura,
      modelo: lida.modelo,
      preco_cents: d.precoCents,
    })
    .select("id, leitura, pago_at, created_at")
    .single();
  const mao = !error && data ? naTela(data as Linha) : null;
  if (!mao) {
    logger.error("[area.mao] leitura não gravada", { organization_id: org.id, motivo: error?.message?.slice(0, 200) });
    return { ok: false, motivo: "indisponivel" };
  }
  await registrarEvento(admin, { organizationId: org.id, contactId: d.contactId, tipo: "mao_lida", sessaoId: d.sessaoId });
  return { ok: true, mao };
}
