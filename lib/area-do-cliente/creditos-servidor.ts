/**
 * OS CRÉDITOS no servidor: ler o saldo e o extrato, e mover. Mover é SEMPRE pela função do banco
 * (`fn_area_creditos_mover`), que trava a carteira da pessoa, recusa saldo negativo e é idempotente pela
 * referência — nada aqui soma ou subtrai por conta própria.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { lerConfigDaArea } from "./config";
import { CREDITOS_DO_CIRCULO_PADRAO, PACOTES_PADRAO, type ConfigDosCreditos } from "./creditos";

export type MotivoDoMovimento = "pacote" | "circulo" | "leitura" | "devolucao" | "ajuste";

export interface MovimentoDeCreditos {
  delta: number;
  motivo: MotivoDoMovimento;
  quando: string;
}

export interface CarteiraDaArea {
  saldo: number;
  extrato: MovimentoDeCreditos[];
}

/** A config com os padrões preenchidos. */
export function configDosCreditos(bruto: Partial<ConfigDosCreditos> | undefined): ConfigDosCreditos {
  return {
    ativo: bruto?.ativo ?? false,
    pacotes: bruto?.pacotes && bruto.pacotes.length > 0 ? bruto.pacotes : [...PACOTES_PADRAO],
    circulo_mensal: bruto?.circulo_mensal ?? CREDITOS_DO_CIRCULO_PADRAO,
  };
}

export async function carregarCarteira(admin: SupabaseClient, orgId: string, contactId: string): Promise<CarteiraDaArea> {
  const { data, error } = await admin
    .from("area_creditos")
    .select("delta, motivo, created_at")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  const linhas = (data ?? []) as Array<{ delta: number; motivo: MotivoDoMovimento; created_at: string }>;
  return {
    // O saldo é a soma do extrato — a mesma conta que a função do banco faz antes de cada movimento.
    saldo: linhas.reduce((soma, l) => soma + l.delta, 0),
    extrato: linhas.slice(0, 20).map((l) => ({ delta: l.delta, motivo: l.motivo, quando: l.created_at })),
  };
}

export type ResultadoDoMovimento = { resultado: "aplicado" | "repetido" | "sem_saldo"; saldo: number };

export async function moverCreditos(
  admin: SupabaseClient,
  m: { organizationId: string; contactId: string; delta: number; motivo: MotivoDoMovimento; referencia: string },
): Promise<ResultadoDoMovimento> {
  const { data, error } = await admin.rpc("fn_area_creditos_mover", {
    p_org: m.organizationId,
    p_contact: m.contactId,
    p_delta: m.delta,
    p_motivo: m.motivo,
    p_referencia: m.referencia,
  });
  if (error) throw new Error(error.message);
  const linha = (Array.isArray(data) ? data[0] : data) as ResultadoDoMovimento | undefined;
  if (!linha) throw new Error("fn_area_creditos_mover sem resposta");
  return linha;
}

/** Os créditos mensais do Círculo, se a empresa ligou os créditos. Idempotente pelo pagamento. */
export async function creditarCirculo(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  pagamentoId: string,
): Promise<ResultadoDoMovimento | null> {
  const { data } = await admin.from("organizations").select("settings").eq("id", organizationId).maybeSingle();
  const cfg = configDosCreditos(lerConfigDaArea((data as { settings: unknown } | null)?.settings).creditos);
  if (!cfg.ativo || cfg.circulo_mensal <= 0) return null;
  return moverCreditos(admin, {
    organizationId,
    contactId,
    delta: cfg.circulo_mensal,
    motivo: "circulo",
    referencia: `circulo-${pagamentoId}`,
  });
}
