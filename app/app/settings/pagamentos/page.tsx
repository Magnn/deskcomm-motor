/**
 * Configurações → Pagamentos. Onde a empresa conecta a conta de cobrança (Asaas) que o nó "Cobrança" dos
 * fluxos usa para gerar o link e o PIX copia-e-cola.
 *
 * Nasce JUNTO com o mecanismo (invariante 6 da doutrina de restrição de canal): estado configurável precisa de
 * tela para ver e tela para mudar. Lê pelo ADMIN CLIENT — a tabela tem RLS sem policies e grants revogados de
 * anon/authenticated — e o gate de papel abaixo é o que autoriza. `admin`, não `manager`: a chave emite
 * cobranças em nome da empresa.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { audit } from "@/lib/audit";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { lerEstadoDaCobranca } from "@/lib/pagamentos/estado-da-conexao";
import { criarStripeConnect } from "@/lib/pagamentos/stripe-connect";
import { regraDaTaxaDaInstalacao } from "@/lib/pagamentos/taxa-da-instalacao";
import { configuracaoDaStripeDosPlanos } from "@/lib/planos/stripe-dos-planos";
import { createAdminClient } from "@/lib/supabase/admin";

import { FormularioDeCobranca } from "./_form";
import { ConexaoComAStripe, type EstadoDaStripe } from "./_stripe";

export const metadata = { title: "Pagamentos" };
export const dynamic = "force-dynamic";

export default async function PagamentosPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const admin = createAdminClient();
  const estado = await lerEstadoDaCobranca(admin, activeOrg.orgId);
  // Só booleanos: nem a chave nem o segredo do aviso entram no que vai para a tela.
  const { data: linhaDaStripe } = await admin
    .from("payment_gateway_connections")
    .select(
      "id, enabled, api_key_encrypted, webhook_secret_encrypted, stripe_account_id, stripe_pronta",
    )
    .eq("organization_id", activeOrg.orgId)
    .eq("provider", "stripe")
    .maybeSingle();
  const s = linhaDaStripe as {
    id: string;
    enabled: boolean;
    api_key_encrypted: string | null;
    webhook_secret_encrypted: string | null;
    stripe_account_id: string | null;
    stripe_pronta: boolean;
  } | null;

  // Conta conectada ainda em cadastro: pergunta à Stripe como ela está AGORA (a pessoa acabou de voltar do
  // cadastro, ou a análise terminou). O aviso `account.updated` também atualiza — esta leitura é o que faz a
  // tela não depender dele. Falha aqui nunca derruba a tela: mostra o último estado gravado.
  const cfg = configuracaoDaStripeDosPlanos();
  let pronta = s?.stripe_pronta ?? false;
  let pixAtivo: boolean | null = null;
  if (s?.stripe_account_id && cfg) {
    try {
      const conta = await criarStripeConnect(cfg).lerConta(s.stripe_account_id);
      pixAtivo = conta.pixAtivo;
      if (conta.pronta !== pronta) {
        pronta = conta.pronta;
        // ⚠️ Filtro de organização: o client é service-role.
        const { error } = await admin
          .from("payment_gateway_connections")
          .update({ stripe_pronta: pronta })
          .eq("organization_id", activeOrg.orgId)
          .eq("id", s.id);
        if (error) {
          logger.warn("[stripe.connect] situação da conta não gravada", {
            organizationId: activeOrg.orgId,
            error: error.message,
          });
          pronta = s.stripe_pronta;
        } else {
          await audit({
            action: "payment_gateway_connection.updated",
            organizationId: activeOrg.orgId,
            actorUserId: user.id,
            resourceType: "payment_gateway_connections",
            resourceId: s.id,
            metadata: { provider: "stripe", origem: "consulta_da_conta", stripe_pronta: pronta },
          });
        }
      }
    } catch (err) {
      logger.warn("[stripe.connect] situação da conta não lida", {
        organizationId: activeOrg.orgId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const estadoDaStripe: EstadoDaStripe = {
    conectada: Boolean(s),
    temChave: Boolean(s?.api_key_encrypted),
    habilitada: s?.enabled ?? false,
    temAviso: Boolean(s?.webhook_secret_encrypted),
    connect: {
      disponivel: cfg !== null,
      temConta: Boolean(s?.stripe_account_id),
      pronta,
      pixAtivo,
      taxa: regraDaTaxaDaInstalacao(),
    },
  };
  const t = (texto: string) => traduzir(texto, user.idioma);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t("Pagamentos")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Conecte sua conta do Asaas. A caixa Cobrança dos fluxos usa esta conexão para gerar o link de pagamento e o PIX copia e cola.",
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {estado.conectada && estado.temChave
            ? estado.habilitada
              ? t("Conectado e ativo.")
              : t("Conectado, mas pausado.")
            : t("Ainda não conectado.")}
        </p>
      </header>
      <ConexaoComAStripe estado={estadoDaStripe} idioma={user.idioma} />
      <FormularioDeCobranca estado={estado} idioma={user.idioma} />
    </div>
  );
}
