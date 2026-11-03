/**
 * A RODADA QUE RENOVA O PLANO DA SEMANA no cartão guardado (migration 0954), de hora em hora (`/api/v1/cron/area-planos`).
 *
 * Quem entra: `renova` ligado, cartão guardado, vencimento nas próximas 12 horas (ou vencido há menos de 3 dias — a
 * nova tentativa depois de uma recusa) e `proxima_tentativa` já passada. A empresa precisa estar com o plano ligado:
 * plano desligado no painel não cobra ninguém.
 *
 * Como cobra: um pagamento fora da sessão no cartão guardado, com os MESMOS metadados da área (`extra=plano-semanal`).
 * Quem estende os 7 dias é o aviso `payment_intent.succeeded` de sempre — a rodada nunca mexe em `valido_ate`.
 *
 * Contra a cobrança em dobro: a linha é "reservada" (`proxima_tentativa` = agora + 6 h, só se ainda estava livre)
 * antes de chamar a Stripe, e a chamada leva a chave de idempotência `renova-plano-<id>-<vencimento>` — a mesma
 * semana nunca vira duas cobranças, nem com duas rodadas ao mesmo tempo.
 *
 * Recusa do cartão: conta uma falha e tenta de novo em 24 h; na 3ª recusa seguida a renovação desliga (a pessoa
 * continua podendo pagar a semana pela área). Stripe fora do ar não conta como recusa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { lerConfigDaArea } from "@/lib/area-do-cliente/config";
import { precoDaOferta } from "@/lib/area-do-cliente/moeda-do-visitante";
import { EXTRA_DO_PLANO_SEMANAL, configDoPlanoSemanal } from "@/lib/area-do-cliente/plano-semanal";
import { lerConexaoStripe } from "@/lib/pagamentos/conexao-stripe";
import { ErroDaStripe, criarClienteStripe } from "@/lib/pagamentos/stripe";

export const HORAS_ANTES_DE_RENOVAR = 12;
export const RECUSAS_ATE_DESLIGAR = 3;
const HORA = 3_600_000;
const POR_RODADA = 100;

export interface LinhaDeRenovacao {
  id: string;
  organization_id: string;
  contact_id: string;
  valido_ate: string;
  moeda: "BRL" | "USD" | "EUR";
  stripe_cliente: string | null;
  stripe_cartao: string | null;
  falhas: number;
}

export interface RodadaDeRenovacao {
  cobradas: number;
  recusadas: number;
  desligadas: number;
  adiadas: number;
}

/** Pura: depois de uma recusa, o que muda na linha. */
export function depoisDaRecusa(falhas: number, agora: Date): { falhas: number; renova: boolean; proxima_tentativa: string } {
  const novas = falhas + 1;
  return { falhas: novas, renova: novas < RECUSAS_ATE_DESLIGAR, proxima_tentativa: new Date(agora.getTime() + 24 * HORA).toISOString() };
}

/** Pura: a chave que impede a mesma semana de virar duas cobranças. */
export function referenciaDaRenovacao(planoId: string, validoAte: string): string {
  return `renova-plano-${planoId}-${new Date(validoAte).getTime()}`;
}

type Cobrar = (
  admin: SupabaseClient,
  orgId: string,
  pedido: Parameters<ReturnType<typeof criarClienteStripe>["cobrarCartaoGuardado"]>[0],
) => Promise<{ status: string }>;

const cobrarDeVerdade: Cobrar = async (admin, orgId, pedido) => {
  const conexao = await lerConexaoStripe(admin, orgId);
  if (!conexao) throw new ErroDaStripe("indisponivel", "organização sem Stripe conectada");
  return criarClienteStripe(conexao).cobrarCartaoGuardado(pedido);
};

export async function renovarPlanosSemanais(admin: SupabaseClient, agora: Date, cobrar: Cobrar = cobrarDeVerdade): Promise<RodadaDeRenovacao> {
  const rodada: RodadaDeRenovacao = { cobradas: 0, recusadas: 0, desligadas: 0, adiadas: 0 };
  const { data, error } = await admin
    .from("area_planos")
    .select("id, organization_id, contact_id, valido_ate, moeda, stripe_cliente, stripe_cartao, falhas")
    .eq("plano", "semanal")
    .eq("renova", true)
    .not("stripe_cartao", "is", null)
    .lte("valido_ate", new Date(agora.getTime() + HORAS_ANTES_DE_RENOVAR * HORA).toISOString())
    .gte("valido_ate", new Date(agora.getTime() - 72 * HORA).toISOString())
    .or(`proxima_tentativa.is.null,proxima_tentativa.lte.${agora.toISOString()}`)
    .order("valido_ate", { ascending: true })
    .limit(POR_RODADA);
  if (error) throw new Error(error.message);
  const linhas = (data ?? []) as LinhaDeRenovacao[];
  if (linhas.length === 0) return rodada;

  // A configuração de cada empresa, uma vez por rodada.
  const orgIds = [...new Set(linhas.map((l) => l.organization_id))];
  const { data: orgs, error: erroOrgs } = await admin.from("organizations").select("id, settings").in("id", orgIds);
  if (erroOrgs) throw new Error(erroOrgs.message);
  const planoDaOrg = new Map(
    ((orgs ?? []) as Array<{ id: string; settings: unknown }>).map((o) => [o.id, configDoPlanoSemanal(lerConfigDaArea(o.settings).plano_semanal)]),
  );

  for (const l of linhas) {
    const cfg = planoDaOrg.get(l.organization_id);
    const valor = cfg ? precoDaOferta(cfg, l.moeda) : null;
    if (!cfg?.ativo || valor === null || !l.stripe_cliente || !l.stripe_cartao) {
      rodada.adiadas++;
      continue;
    }
    // Reserva a linha: só quem a pegou livre segue (duas rodadas ao mesmo tempo não cobram duas vezes).
    const { data: reservada, error: erroReserva } = await admin
      .from("area_planos")
      .update({ proxima_tentativa: new Date(agora.getTime() + 6 * HORA).toISOString() })
      .eq("id", l.id)
      .eq("valido_ate", l.valido_ate)
      .or(`proxima_tentativa.is.null,proxima_tentativa.lte.${agora.toISOString()}`)
      .select("id");
    if (erroReserva) throw new Error(erroReserva.message);
    if (!reservada || reservada.length === 0) continue;

    try {
      const r = await cobrar(admin, l.organization_id, {
        valorCentavos: valor,
        moeda: l.moeda,
        descricao: `${cfg.nome} — 7 dias (renovação)`,
        cliente: l.stripe_cliente,
        cartao: l.stripe_cartao,
        referencia: referenciaDaRenovacao(l.id, l.valido_ate),
        metadados: {
          organization_id: l.organization_id,
          contact_id: l.contact_id,
          produto: cfg.nome,
          extra: EXTRA_DO_PLANO_SEMANAL,
          moeda: l.moeda,
          renovacao: "1",
        },
      });
      if (r.status === "succeeded" || r.status === "processing") {
        rodada.cobradas++;
        continue;
      }
      // `requires_action` (o banco pediu autenticação) ou `requires_payment_method`: conta como recusa.
      throw new ErroDaStripe("recusada", `status ${r.status}`);
    } catch (err) {
      if (!(err instanceof ErroDaStripe) || err.codigo === "indisponivel") {
        // Stripe fora do ar: a reserva de 6 h já espaça a próxima tentativa, sem contar recusa.
        rodada.adiadas++;
        continue;
      }
      const depois = depoisDaRecusa(l.falhas, agora);
      const { error: erroFalha } = await admin.from("area_planos").update({ ...depois, updated_at: agora.toISOString() }).eq("id", l.id);
      if (erroFalha) throw new Error(erroFalha.message);
      rodada.recusadas++;
      if (!depois.renova) rodada.desligadas++;
    }
  }
  return rodada;
}
