/**
 * O AVISO DA STRIPE SOBRE A ASSINATURA DE UM PLANO — a regra, sem HTTP.
 *
 * Eventos que importam (os outros respondem "ignorado"):
 *
 *   checkout.session.completed     → a pessoa terminou o checkout: lê a assinatura criada e aplica.
 *   customer.subscription.created  → idem (chega junto; aplicar duas vezes é inofensivo).
 *   customer.subscription.updated  → troca de plano, renovação, atraso, volta do atraso.
 *   customer.subscription.deleted  → cancelou de vez: o plano cai.
 *
 * A empresa vem de `metadata.organization_id` da assinatura (gravado pelo checkout que a própria empresa
 * abriu) — nunca do e-mail de quem pagou.
 *
 * Duas guardas contra derrubar o plano errado:
 *   - só derruba assinatura de origem 'stripe' (cortesia posta à mão não cai por aviso de pagamento);
 *   - só derruba se a assinatura do aviso é a MESMA gravada na empresa (`reference`). Um aviso atrasado de
 *     uma assinatura antiga não derruba a nova.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { encerrarFluxosDaEmpresa } from "@/lib/tenants/assinatura";

import { ativarPlano, inativarPlano, lerAssinatura, planosDaInstalacao } from "./assinatura-da-organizacao";
import { planoPorId } from "./catalogo";
import { lerAssinaturaDaStripe, situacaoDaAssinatura, type AssinaturaDaStripe } from "./stripe-dos-planos";

type Admin = SupabaseClient;

export interface DepsDoAviso {
  admin: Admin;
  /** Lê a assinatura na Stripe (o checkout concluído só traz o id dela). */
  lerAssinatura: (id: string) => Promise<AssinaturaDaStripe | null>;
  encerrarFluxos?: (admin: Admin, organizationId: string, motivo: string) => Promise<number>;
}

export type DesfechoDoAviso =
  | { resultado: "ignorado"; motivo: string }
  | { resultado: "plano_ativado"; organizationId: string; planoId: string }
  | { resultado: "plano_inativado"; organizationId: string; fluxosEncerrados: number }
  | { resultado: "sem_efeito"; motivo: string; organizationId?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function aplicarAvisoDaStripeDosPlanos(
  evento: { type?: unknown; data?: { object?: unknown } },
  deps: DepsDoAviso,
  requestId: string,
): Promise<DesfechoDoAviso> {
  const tipo = typeof evento.type === "string" ? evento.type : "";
  const objeto = (evento.data?.object ?? null) as Record<string, unknown> | null;
  if (!objeto) return { resultado: "ignorado", motivo: "sem_objeto" };

  let assinatura: AssinaturaDaStripe | null;
  switch (tipo) {
    case "checkout.session.completed": {
      if (objeto.mode !== "subscription" || typeof objeto.subscription !== "string") {
        return { resultado: "ignorado", motivo: "checkout_sem_assinatura" };
      }
      assinatura = await deps.lerAssinatura(objeto.subscription);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      assinatura = lerAssinaturaDaStripe(objeto);
      break;
    default:
      return { resultado: "ignorado", motivo: "evento_sem_efeito" };
  }

  if (!assinatura) return { resultado: "ignorado", motivo: "assinatura_ilegivel" };
  const organizationId = assinatura.organizationId;
  // Assinatura que não nasceu do nosso checkout (outro produto da mesma conta Stripe): não é conosco.
  if (!organizationId || !UUID.test(organizationId)) return { resultado: "ignorado", motivo: "assinatura_de_fora" };

  const situacao = tipo === "customer.subscription.deleted" ? "inativa" : situacaoDaAssinatura(assinatura.status);
  if (situacao === null) return { resultado: "sem_efeito", motivo: `status_${assinatura.status}`, organizationId };

  const atual = await lerAssinatura(deps.admin, organizationId);

  if (situacao === "ativa") {
    const plano = planoPorId(planosDaInstalacao(), assinatura.planoId);
    if (!plano) {
      logger.error("[planos.stripe] assinatura em dia com plano que o catálogo não tem", {
        requestId,
        organizationId,
        planoId: assinatura.planoId,
      });
      return { resultado: "sem_efeito", motivo: "plano_desconhecido", organizationId };
    }
    await ativarPlano(deps.admin, { organizationId, planoId: plano.id, origem: "stripe", referencia: assinatura.id });
    if (atual?.status !== "ativa" || atual.planoId !== plano.id || atual.referencia !== assinatura.id) {
      void audit({
        action: "tenant.plano_ativado",
        organizationId,
        resourceType: "organization",
        resourceId: organizationId,
        requestId,
        metadata: { plano: plano.id, origem: "stripe", assinatura: assinatura.id, evento: tipo },
      });
    }
    return { resultado: "plano_ativado", organizationId, planoId: plano.id };
  }

  if (!atual || atual.origem !== "stripe") return { resultado: "sem_efeito", motivo: "sem_plano_da_stripe", organizationId };
  if (atual.referencia !== assinatura.id) return { resultado: "sem_efeito", motivo: "assinatura_antiga", organizationId };
  if (atual.status !== "ativa") return { resultado: "sem_efeito", motivo: "ja_inativa", organizationId };

  const caiu = await inativarPlano(deps.admin, { organizationId, motivo: `stripe:${assinatura.status || "deleted"}`, soDaOrigem: "stripe" });
  if (!caiu) return { resultado: "sem_efeito", motivo: "sem_plano_da_stripe", organizationId };
  const encerrar = deps.encerrarFluxos ?? encerrarFluxosDaEmpresa;
  const fluxosEncerrados = await encerrar(deps.admin, organizationId, "Assinatura inativa: os fluxos foram encerrados.");
  void audit({
    action: "tenant.plano_inativado",
    organizationId,
    resourceType: "organization",
    resourceId: organizationId,
    requestId,
    metadata: { origem: "stripe", assinatura: assinatura.id, status: assinatura.status, fluxos_encerrados: fluxosEncerrados },
  });
  return { resultado: "plano_inativado", organizationId, fluxosEncerrados };
}
