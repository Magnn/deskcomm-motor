"use server";

import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { marcaDaSaida } from "@/lib/branding/saida";
import { env } from "@/lib/env";
import { supportWriteError } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { ativarPlano, lerAssinatura, planosAtivos, planosDaInstalacao } from "@/lib/planos/assinatura-da-organizacao";
import { planoPorId } from "@/lib/planos/catalogo";
import { configuracaoDaStripeDosPlanos, criarStripeDosPlanos } from "@/lib/planos/stripe-dos-planos";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ASSINAR UM PLANO PELA STRIPE — o botão "Assinar" da tela de planos.
 *
 * Sem assinatura da Stripe em dia: abre o checkout de assinatura mensal e manda a pessoa para lá. Com uma
 * em dia: troca o plano DELA (a Stripe cobra a diferença proporcional) — nunca uma segunda assinatura.
 *
 * Quem decide se o plano entrou é o aviso da Stripe (`/api/v1/webhooks/stripe-planos`), não esta ação: a
 * volta do checkout só mostra a tela. A troca de plano já devolve a assinatura nova, então ela é aplicada
 * aqui também — o aviso que chega depois grava o mesmo valor.
 *
 * Mesmas guardas da tela: admin da organização (billing é admin-only), sessão de suporte não paga por
 * ninguém. Erro volta para a tela com `?erro=…`, nunca em silêncio.
 */

function voltar(erro: string): never {
  redirect(`/app/settings/billing?erro=${encodeURIComponent(erro)}`);
}

async function enderecoDoApp(): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const protocolo = (hdrs.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
  return host ? `${protocolo}://${host}` : env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

async function quemPaga() {
  const authUser = await loadAuthUser();
  if (!authUser) redirect("/login");
  if (supportWriteError(authUser.support)) voltar("suporte");
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) redirect("/403");
  return { authUser, orgId: activeOrg.orgId };
}

export async function assinarPlano(formData: FormData): Promise<void> {
  const { authUser, orgId } = await quemPaga();
  const cfg = configuracaoDaStripeDosPlanos();
  if (!cfg || !planosAtivos()) voltar("stripe_desligada");
  const plano = planoPorId(planosDaInstalacao(), String(formData.get("plano") ?? ""));
  if (!plano) voltar("plano_desconhecido");

  const admin = createAdminClient();
  // A marca da INSTALAÇÃO (não a da organização que paga): é ela que vende o plano, e é o nome que a
  // fatura do cartão mostra na assinatura. `marcaDaSaida` nunca lança.
  const stripe = criarStripeDosPlanos({ ...cfg, marca: (await marcaDaSaida(null)).nome });
  const base = await enderecoDoApp();
  let destino: string;
  try {
    const atual = await lerAssinatura(admin, orgId);
    const daStripe =
      atual?.origem === "stripe" && atual.referencia?.startsWith("sub_") ? await stripe.lerAssinatura(atual.referencia) : null;
    const viva = daStripe && ["active", "trialing", "past_due"].includes(daStripe.status) ? daStripe : null;

    if (viva) {
      if (viva.planoId === plano.id) voltar("ja_e_o_plano");
      const trocada = await stripe.trocarPlano(viva, plano);
      if (trocada && trocada.planoId === plano.id && trocada.status === "active") {
        await ativarPlano(admin, { organizationId: orgId, planoId: plano.id, origem: "stripe", referencia: trocada.id, por: authUser.id });
      }
      void audit({
        action: "tenant.plano_ativado",
        actorUserId: authUser.id,
        organizationId: orgId,
        resourceType: "organization",
        resourceId: orgId,
        metadata: { plano: plano.id, origem: "stripe", troca_de: viva.planoId, assinatura: viva.id },
      });
      revalidatePath("/app/settings/billing");
      destino = `/app/settings/billing?assinatura=trocada`;
    } else {
      destino = await stripe.criarCheckout({
        plano,
        organizationId: orgId,
        email: authUser.email ?? null,
        clienteId: daStripe?.clienteId ?? null,
        sucesso: `${base}/app/settings/billing?assinatura=ok`,
        cancelado: `${base}/app/settings/billing?assinatura=cancelada`,
      });
    }
  } catch (err) {
    // `redirect()` lança de propósito — deixa passar.
    unstable_rethrow(err);
    logger.error("[billing] a Stripe recusou abrir a assinatura", {
      organizationId: orgId,
      plano: plano.id,
      erro: err instanceof Error ? err.message : String(err),
    });
    voltar("stripe_indisponivel");
  }
  redirect(destino);
}

/** O portal da Stripe: trocar cartão, ver faturas, cancelar. */
export async function abrirPortalDoPlano(): Promise<void> {
  const { orgId } = await quemPaga();
  const cfg = configuracaoDaStripeDosPlanos();
  if (!cfg) voltar("stripe_desligada");
  const admin = createAdminClient();
  const stripe = criarStripeDosPlanos(cfg);
  let destino: string;
  try {
    const atual = await lerAssinatura(admin, orgId);
    if (atual?.origem !== "stripe" || !atual.referencia?.startsWith("sub_")) voltar("sem_assinatura_stripe");
    const daStripe = await stripe.lerAssinatura(atual.referencia);
    if (!daStripe?.clienteId) voltar("sem_assinatura_stripe");
    destino = await stripe.criarPortal(daStripe.clienteId, `${await enderecoDoApp()}/app/settings/billing`);
  } catch (err) {
    unstable_rethrow(err);
    logger.error("[billing] a Stripe recusou abrir o portal", { organizationId: orgId, erro: err instanceof Error ? err.message : String(err) });
    voltar("stripe_indisponivel");
  }
  redirect(destino);
}
