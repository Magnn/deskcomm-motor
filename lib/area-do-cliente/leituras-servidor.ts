/**
 * A MESA DE LEITURAS no servidor: o que a página mostra (`carregarMesa`) e o momento de revelar
 * (`revelarLeitura`). As rotas e a página só chamam daqui.
 *
 * Revelar é idempotente: as cartas são sorteadas UMA vez e gravadas antes de chamar a IA; se a IA falhar, a
 * pessoa vê as cartas e o aviso de que a leitura está sendo preparada, e a próxima chamada escreve sobre as
 * MESMAS cartas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { diaNoFuso, fotoDaCarta } from "./dados";
import { registrarEvento } from "./eventos";
import {
  LIMITE_POR_DIA_PADRAO,
  MODALIDADES,
  NOME_DA_MODALIDADE,
  PRECO_DA_PRIMEIRA_PADRAO,
  PRECO_PADRAO,
  ehModalidade,
  lerCartas,
  precoDaLeitura,
  sortearCartas,
  type CartaDaLeitura,
  type ConfigDasLeituras,
  type Modalidade,
} from "./leituras";
import { escreverLeitura, type LeituraEscrita } from "./leituras-ia";

export type CartaNaTela = CartaDaLeitura & { foto: string | null };

export interface LeituraSalva {
  id: string;
  modalidade: Modalidade;
  pergunta: string;
  quando: string;
  paga: boolean;
  revelada: boolean;
  cartas: CartaNaTela[];
  leitura: LeituraEscrita | null;
}

export interface MesaDaArea {
  modalidades: Array<{ id: Modalidade; nome: string; precoCents: number; primeira: boolean }>;
  restamHoje: number;
  leituras: LeituraSalva[];
}

type Linha = {
  id: string;
  modalidade: string;
  pergunta: string;
  pago_at: string | null;
  cartas: unknown;
  texto: string | null;
  created_at: string;
};

/** A config com os padrões preenchidos. */
export function configDasLeituras(bruto: Partial<ConfigDasLeituras> | undefined): ConfigDasLeituras {
  return {
    ativo: bruto?.ativo ?? false,
    preco_primeira_cents: bruto?.preco_primeira_cents ?? PRECO_DA_PRIMEIRA_PADRAO,
    preco_cents: bruto?.preco_cents ?? PRECO_PADRAO,
    limite_por_dia: bruto?.limite_por_dia ?? LIMITE_POR_DIA_PADRAO,
  };
}

/** O texto gravado (JSON da leitura); `null` se ainda não há ou se não serve. */
export function lerTextoGravado(texto: string | null): LeituraEscrita | null {
  if (!texto) return null;
  try {
    const j = JSON.parse(texto) as LeituraEscrita;
    return Array.isArray(j.cartas) && typeof j.sintese === "string" && typeof j.passo === "string" ? j : null;
  } catch {
    return null;
  }
}

async function comFotos(admin: SupabaseClient, orgId: string, modalidade: Modalidade, cartas: CartaDaLeitura[]): Promise<CartaNaTela[]> {
  if (modalidade !== "tarot") return cartas.map((c) => ({ ...c, foto: null }));
  return Promise.all(cartas.map(async (c) => ({ ...c, foto: await fotoDaCarta(admin, orgId, c.id) })));
}

/** Quantas leituras a pessoa já pagou HOJE, no fuso da empresa. */
export async function pagasHoje(admin: SupabaseClient, org: { id: string; fuso: string }, contactId: string): Promise<number> {
  const desde = new Date(Date.now() - 36 * 3_600_000).toISOString();
  const { data } = await admin
    .from("area_leituras")
    .select("pago_at")
    .eq("organization_id", org.id)
    .eq("contact_id", contactId)
    .not("pago_at", "is", null)
    .gte("pago_at", desde)
    .limit(50);
  const hoje = diaNoFuso(new Date().toISOString(), org.fuso);
  return ((data ?? []) as Array<{ pago_at: string }>).filter((l) => diaNoFuso(l.pago_at, org.fuso) === hoje).length;
}

/** Já pagou alguma leitura nesta modalidade? (decide se esta é a primeira, pelo preço de entrada) */
export async function jaPagouNaModalidade(
  admin: SupabaseClient,
  orgId: string,
  contactId: string,
  modalidade: Modalidade,
): Promise<boolean> {
  const { count } = await admin
    .from("area_leituras")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .eq("modalidade", modalidade)
    .not("pago_at", "is", null);
  return (count ?? 0) > 0;
}

export async function carregarMesa(
  admin: SupabaseClient,
  org: { id: string; fuso: string },
  contactId: string,
  cfg: ConfigDasLeituras,
): Promise<MesaDaArea> {
  const { data } = await admin
    .from("area_leituras")
    .select("id, modalidade, pergunta, pago_at, cartas, texto, created_at")
    .eq("organization_id", org.id)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(30);
  const linhas = ((data ?? []) as Linha[]).filter((l) => ehModalidade(l.modalidade));
  const pagasPorModalidade = new Set(linhas.filter((l) => l.pago_at).map((l) => l.modalidade));
  const hoje = diaNoFuso(new Date().toISOString(), org.fuso);
  const pagasNoDia = linhas.filter((l) => l.pago_at && diaNoFuso(l.pago_at, org.fuso) === hoje).length;

  // Só as pagas aparecem: o pedido abandonado no Pix não é leitura dela.
  const pagas = linhas.filter((l) => l.pago_at).slice(0, 12);
  const leituras = await Promise.all(
    pagas.map(async (l): Promise<LeituraSalva> => {
      const modalidade = l.modalidade as Modalidade;
      const cartas = lerCartas(l.cartas);
      return {
        id: l.id,
        modalidade,
        pergunta: l.pergunta,
        quando: l.created_at,
        paga: true,
        revelada: cartas.length > 0,
        cartas: await comFotos(admin, org.id, modalidade, cartas),
        leitura: lerTextoGravado(l.texto),
      };
    }),
  );

  return {
    modalidades: MODALIDADES.map((id) => {
      const primeira = !pagasPorModalidade.has(id);
      return { id, nome: NOME_DA_MODALIDADE[id], precoCents: precoDaLeitura(cfg, !primeira), primeira };
    }),
    restamHoje: Math.max(0, cfg.limite_por_dia - pagasNoDia),
    leituras,
  };
}

export type ResultadoDaRevelacao =
  | { ok: true; cartas: CartaNaTela[]; leitura: LeituraEscrita | null }
  | { ok: false; motivo: "nao_encontrada" | "nao_paga" };

export async function revelarLeitura(
  admin: SupabaseClient,
  org: { id: string; nome: string; titulo: string },
  contactId: string,
  leituraId: string,
  primeiroNome: string,
): Promise<ResultadoDaRevelacao> {
  const { data } = await admin
    .from("area_leituras")
    .select("id, modalidade, pergunta, pago_at, cartas, texto, created_at")
    .eq("id", leituraId)
    .eq("organization_id", org.id)
    .eq("contact_id", contactId)
    .maybeSingle();
  const l = data as Linha | null;
  if (!l || !ehModalidade(l.modalidade)) return { ok: false, motivo: "nao_encontrada" };
  if (!l.pago_at) return { ok: false, motivo: "nao_paga" };
  const modalidade = l.modalidade;

  let cartas = lerCartas(l.cartas);
  if (cartas.length === 0) {
    const sorteadas = sortearCartas(modalidade);
    // Grava antes da IA e só se ainda não houver: duas abas revelando ao mesmo tempo ficam com as mesmas cartas.
    await admin
      .from("area_leituras")
      .update({ cartas: sorteadas, revelada_at: new Date().toISOString() })
      .eq("id", l.id)
      .is("cartas", null);
    const { data: relida } = await admin.from("area_leituras").select("cartas").eq("id", l.id).maybeSingle();
    cartas = lerCartas((relida as { cartas: unknown } | null)?.cartas);
    if (cartas.length === 0) cartas = sorteadas;
    await registrarEvento(admin, { organizationId: org.id, contactId, tipo: "leitura_revelada", props: { modalidade } });
  }

  let leitura = lerTextoGravado(l.texto);
  if (!leitura) {
    try {
      const escrita = await escreverLeitura(getRequestPool(), llmEdgeConfigFromEnv(env), {
        organizationId: org.id,
        contactId,
        empresa: org.titulo || org.nome,
        modalidade,
        pergunta: l.pergunta,
        cartas,
        primeiroNome,
      });
      if (escrita) {
        leitura = escrita.leitura;
        await admin
          .from("area_leituras")
          .update({ texto: JSON.stringify(escrita.leitura), modelo: escrita.modelo })
          .eq("id", l.id)
          .is("texto", null);
      }
    } catch (err) {
      logger.error("[area.leitura] leitura não escrita", {
        organization_id: org.id,
        motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      });
    }
  }
  return { ok: true, cartas: await comFotos(admin, org.id, modalidade, cartas), leitura };
}
