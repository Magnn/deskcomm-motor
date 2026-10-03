/**
 * A ASSINATURA DE CADA EMPRESA — qual plano ela tem, se está em dia, e o que isso libera.
 *
 * A regra do produto vendido como serviço:
 *
 *   sem assinatura            → a empresa cria fluxos e agentes, mas NÃO conecta número;
 *   assinatura em dia         → conecta até o número de números do plano;
 *   assinatura que caiu       → os números conectados param de automatizar; a conta
 *                               continua aberta para a pessoa regularizar.
 *
 * Tudo aqui só vale com `PLANS_ENFORCED=true`. Desligado, toda pergunta responde
 * "pode" — a instalação de quem usa o sistema para a própria empresa não muda.
 *
 * A linha mora em `organization_subscriptions` (migration 0908), que só o
 * service_role alcança: o cliente não pode se dar um plano.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { PROVIDERS_DE_NUMERO } from "@/lib/channels/capabilities";
import { logger } from "@/lib/logger";

import { lerCatalogoDeclarado, planoPorId, PLANOS_PADRAO, type Plano } from "./catalogo";

type Admin = SupabaseClient;

export type OrigemDaAssinatura = "cakto" | "manual";

export interface Assinatura {
  planoId: string;
  status: "ativa" | "inativa";
  origem: OrigemDaAssinatura;
  referencia: string | null;
  motivo: string | null;
  atualizadaEm: string;
}

/** A instalação cobra plano para conectar número? */
export function planosAtivos(): boolean {
  return (env.PLANS_ENFORCED ?? "").trim().toLowerCase() === "true";
}

let avisouCatalogoInvalido = false;

/** O catálogo em vigor: o do `.env` quando bem formado, senão o padrão. */
export function planosDaInstalacao(): readonly Plano[] {
  const declarado = (env.PLANS_CATALOG ?? "").trim();
  if (declarado === "") return PLANOS_PADRAO;
  const lido = lerCatalogoDeclarado(declarado);
  if (lido !== null) return lido;
  if (!avisouCatalogoInvalido) {
    avisouCatalogoInvalido = true;
    logger.error("planos: PLANS_CATALOG no .env está malformado (esperado id:Nome:centavos:números,…); vale o catálogo padrão");
  }
  return PLANOS_PADRAO;
}

const COLUNAS = "plan_id, status, source, reference, reason, updated_at";

type Linha = {
  plan_id: string;
  status: string;
  source: string;
  reference: string | null;
  reason: string | null;
  updated_at: string;
};

function daLinha(l: Linha): Assinatura {
  return {
    planoId: l.plan_id,
    status: l.status === "ativa" ? "ativa" : "inativa",
    origem: l.source === "manual" ? "manual" : "cakto",
    referencia: l.reference,
    motivo: l.reason,
    atualizadaEm: l.updated_at,
  };
}

/** `null` = a empresa nunca assinou. Erro de leitura LANÇA: "não li" não é "não tem". */
export async function lerAssinatura(admin: Admin, organizationId: string): Promise<Assinatura | null> {
  const { data, error } = await admin
    .from("organization_subscriptions")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`planos: leitura da assinatura falhou: ${error.message}`);
  return data ? daLinha(data as Linha) : null;
}

/** Grava (ou troca) o plano em dia da empresa. Idempotente. */
export async function ativarPlano(
  admin: Admin,
  p: { organizationId: string; planoId: string; origem: OrigemDaAssinatura; referencia?: string | null; por?: string | null },
): Promise<void> {
  const { error } = await admin.from("organization_subscriptions").upsert(
    {
      organization_id: p.organizationId,
      plan_id: p.planoId,
      status: "ativa",
      source: p.origem,
      reference: p.referencia ?? null,
      reason: null,
      updated_by: p.por ?? null,
    },
    { onConflict: "organization_id" },
  );
  if (error) throw new Error(`planos: ativar o plano falhou: ${error.message}`);
  esquecerAssinaturaInativa(p.organizationId);
}

/**
 * A assinatura caiu. `false` quando a empresa nunca teve uma — não há o que
 * derrubar. Uma assinatura posta À MÃO pelo dono da instalação não cai por
 * aviso de pagamento (`soDaOrigem`): cortesia e conta própria não têm fatura.
 */
export async function inativarPlano(
  admin: Admin,
  p: { organizationId: string; motivo: string; soDaOrigem?: OrigemDaAssinatura; por?: string | null },
): Promise<boolean> {
  let consulta = admin
    .from("organization_subscriptions")
    .update({ status: "inativa", reason: p.motivo, updated_by: p.por ?? null })
    .eq("organization_id", p.organizationId);
  if (p.soDaOrigem) consulta = consulta.eq("source", p.soDaOrigem);
  const { data, error } = await consulta.select("id");
  if (error) throw new Error(`planos: inativar o plano falhou: ${error.message}`);
  esquecerAssinaturaInativa(p.organizationId);
  return (data?.length ?? 0) > 0;
}

/** Remove a assinatura: a empresa volta ao estado de quem nunca assinou. */
export async function removerPlano(admin: Admin, organizationId: string): Promise<void> {
  const { error } = await admin.from("organization_subscriptions").delete().eq("organization_id", organizationId);
  if (error) throw new Error(`planos: remover o plano falhou: ${error.message}`);
  esquecerAssinaturaInativa(organizationId);
}

export interface SituacaoDosNumeros {
  /** `false` = a instalação não cobra plano; nada aqui limita. */
  cobrando: boolean;
  plano: Plano | null;
  assinatura: Assinatura | null;
  /** Números conectados (não excluídos) da empresa. */
  usados: number;
  /** Quantos o plano em dia permite. 0 sem plano em dia. */
  limite: number;
}

/** O retrato que a tela de planos e a trava de conexão leem — a MESMA conta nos dois. */
export async function situacaoDosNumeros(admin: Admin, organizationId: string): Promise<SituacaoDosNumeros> {
  if (!planosAtivos()) return { cobrando: false, plano: null, assinatura: null, usados: 0, limite: Number.POSITIVE_INFINITY };
  const assinatura = await lerAssinatura(admin, organizationId);
  const plano = assinatura ? planoPorId(planosDaInstalacao(), assinatura.planoId) : null;
  const { count, error } = await admin
    .from("channel_sessions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    // Só o que É número de WhatsApp: página, rede social, bot e linha de voz não
    // gastam o plano (a lista e o porquê estão em `lib/channels/capabilities`).
    .in("provider", [...PROVIDERS_DE_NUMERO])
    .is("archived_at", null);
  if (error) throw new Error(`planos: contagem dos números falhou: ${error.message}`);
  const limite = assinatura?.status === "ativa" && plano ? plano.numeros : 0;
  return { cobrando: true, plano, assinatura, usados: count ?? 0, limite };
}

export type RecusaDeNumero =
  | { motivo: "sem_plano" }
  | { motivo: "plano_inativo" }
  | { motivo: "limite_do_plano"; limite: number; plano: string };

/**
 * A empresa pode conectar MAIS UM número? `null` = pode.
 *
 * Chamada por toda porta que cria um número (ver a cerca em
 * `tests/unit/planos-trava-toda-porta-de-numero.test.ts`). Reconectar um número
 * que já está vivo não é "mais um" — quem chama passa por aqui só quando a
 * conexão é nova ou ressuscita um número excluído.
 */
export async function recusaParaNovoNumero(admin: Admin, organizationId: string): Promise<RecusaDeNumero | null> {
  if (!planosAtivos()) return null;
  const s = await situacaoDosNumeros(admin, organizationId);
  if (s.assinatura === null) return { motivo: "sem_plano" };
  if (s.assinatura.status !== "ativa" || s.plano === null) return { motivo: "plano_inativo" };
  if (s.usados >= s.limite) return { motivo: "limite_do_plano", limite: s.limite, plano: s.plano.nome };
  return null;
}

/** A frase que a pessoa lê quando a conexão é recusada. */
export function mensagemDaRecusa(r: RecusaDeNumero): string {
  switch (r.motivo) {
    case "sem_plano":
      return "Para conectar um número é preciso assinar um plano. Abra Configurações › Billing para escolher o seu.";
    case "plano_inativo":
      return "A assinatura desta conta não está em dia. Regularize em Configurações › Billing para conectar um número.";
    case "limite_do_plano":
      return "O plano desta conta já está com todos os números em uso. Para conectar mais um, mude de plano em Configurações › Billing.";
  }
}

// ── A assinatura caiu? (lido a cada mensagem que chega) ─────────────────────

const INATIVA_TTL_MS = 30_000;
const memoDeInativa = new Map<string, { em: number; inativa: boolean }>();

function esquecerAssinaturaInativa(organizationId: string): void {
  memoDeInativa.delete(organizationId);
}

/** Só para os testes. */
export function esquecerMemoDasAssinaturas(): void {
  memoDeInativa.clear();
}

/**
 * A empresa tem assinatura e ela CAIU? É o que faz os números pararem de
 * automatizar. Empresa que nunca assinou responde `false`: ela não tem número
 * para automatizar, e uma instalação que liga a cobrança depois não pode
 * silenciar quem já estava no ar.
 *
 * Memo curto e FALHA ABERTA, pelo mesmo motivo de `empresaSuspensa`: roda no
 * caminho de toda mensagem recebida, e calar um cliente em dia por um soluço do
 * banco é o erro caro aqui.
 */
export async function assinaturaCaiu(admin: Admin, organizationId: string): Promise<boolean> {
  if (!planosAtivos()) return false;
  const agora = Date.now();
  const memo = memoDeInativa.get(organizationId);
  if (memo && agora - memo.em < INATIVA_TTL_MS) return memo.inativa;
  try {
    const assinatura = await lerAssinatura(admin, organizationId);
    const inativa = assinatura !== null && assinatura.status !== "ativa";
    memoDeInativa.set(organizationId, { em: agora, inativa });
    return inativa;
  } catch {
    return memo?.inativa ?? false;
  }
}
