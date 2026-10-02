import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { emailDeSuporte } from "@/lib/branding/saida";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { env } from "@/lib/env";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { planosDaInstalacao, situacaoDosNumeros, type SituacaoDosNumeros } from "@/lib/planos/assinatura-da-organizacao";
import { precoLegivel } from "@/lib/planos/catalogo";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkDoCheckoutDoPlano, produtosDaAssinatura } from "@/lib/tenants/assinatura-cakto";

export const dynamic = "force-dynamic";

/**
 * PLANOS E COBRANÇA da empresa.
 *
 * Com a cobrança de plano ligada na instalação (`PLANS_ENFORCED`), mostra o plano
 * em vigor, quantos números ele libera e quantos estão em uso, e os planos à
 * venda com o link de pagamento. O que aparece aqui é o MESMO retrato que a trava
 * de conexão lê (`situacaoDosNumeros`) — a tela não promete o que a trava nega.
 *
 * Com a cobrança desligada não há plano a mostrar: a tela diz com quem falar. O
 * endereço é o de quem opera a instalação (`SUPPORT_EMAIL`) — nunca o nosso — e,
 * sem ele configurado, nenhum endereço aparece.
 */
export default async function BillingPage() {
  // spec 13 §4: billing é admin-only (viewer/agent/manager = none).
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const t = (texto: string) => traduzir(texto, user.idioma);
  const suporte = await emailDeSuporte();

  let situacao: SituacaoDosNumeros | null = null;
  try {
    situacao = await situacaoDosNumeros(createAdminClient(), activeOrg.orgId);
  } catch (err) {
    logger.error("[billing] não deu para ler a assinatura", { erro: err instanceof Error ? err.message : String(err) });
  }

  const falarComQuem = suporte ? (
    <>
      {t("Para questões de pagamento, contate")}{" "}
      <a className="underline" href={`mailto:${suporte}`}>
        {suporte}
      </a>
      .
    </>
  ) : (
    <>{t("Para questões de pagamento, fale com quem administra este sistema.")}</>
  );

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">{t("Planos, faturas e cobrança.")}</p>
      </header>

      {situacao === null ? (
        <Card className="max-w-xl p-6">
          <p className="text-sm text-muted-foreground">
            {t("Não foi possível carregar o plano desta conta agora. Recarregue a página em instantes.")}
          </p>
        </Card>
      ) : !situacao.cobrando ? (
        <Card className="max-w-xl p-6">
          <h2 className="text-sm font-semibold">{t("Esta conta não tem cobrança por plano")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{falarComQuem}</p>
        </Card>
      ) : (
        <PlanosDaConta situacao={situacao} t={t} emailDoComprador={user.email ?? null} falarComQuem={falarComQuem} />
      )}
    </div>
  );
}

function PlanosDaConta({
  situacao,
  t,
  emailDoComprador,
  falarComQuem,
}: {
  situacao: SituacaoDosNumeros;
  t: (texto: string) => string;
  emailDoComprador: string | null;
  falarComQuem: React.ReactNode;
}) {
  const planos = planosDaInstalacao();
  const ofertas = produtosDaAssinatura(env.CAKTO_SUBSCRIPTION_PRODUCTS ?? "");
  const emDia = situacao.assinatura?.status === "ativa" && situacao.plano !== null;
  const planoAtualId = emDia ? situacao.plano!.id : null;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Card className="p-6" data-testid="plano-atual">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">{t("Seu plano")}</h2>
          {emDia ? (
            <Badge variant="success">{situacao.plano!.nome}</Badge>
          ) : situacao.assinatura ? (
            <Badge variant="error">{t("Assinatura inativa")}</Badge>
          ) : (
            <Badge variant="neutral">{t("Grátis")}</Badge>
          )}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {emDia
            ? `${t("Números conectados:")} ${situacao.usados} ${t("de")} ${situacao.limite}.`
            : situacao.assinatura
              ? t("A assinatura desta conta não está em dia. Os números conectados pararam de responder sozinhos até a regularização — as conversas continuam chegando.")
              : t("No plano grátis você cria e importa fluxos e monta seus agentes. Para conectar um número de WhatsApp e colocar tudo no ar, escolha um plano abaixo.")}
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {planos.map((p) => {
          const link = linkDoCheckoutDoPlano(ofertas, p.id);
          const atual = planoAtualId === p.id;
          // O e-mail vai preenchido no checkout: é por ele que o pagamento acha
          // esta conta. Quem troca o e-mail lá paga para outra conta.
          const href =
            link && emailDoComprador ? `${link}?email=${encodeURIComponent(emailDoComprador)}` : link;
          return (
            <Card key={p.id} className="flex flex-col gap-3 p-6" data-testid={`plano-${p.id}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{p.nome}</h3>
                {atual && <Badge variant="success">{t("Plano atual")}</Badge>}
              </div>
              <p className="text-2xl font-semibold tracking-tight">
                {precoLegivel(p.precoMensalCentavos)}
                <span className="text-sm font-normal text-muted-foreground"> {t("/mês")}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {p.numeros === 1
                  ? t("1 número de WhatsApp conectado (QR code ou API oficial).")
                  : `${p.numeros} ${t("números de WhatsApp conectados (QR code ou API oficial).")}`}
              </p>
              {atual ? null : href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {emDia ? t("Mudar para este plano") : t("Assinar")}
                </a>
              ) : (
                <p className="mt-auto text-xs text-muted-foreground">{t("Para contratar este plano, fale com quem administra este sistema.")}</p>
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {emailDoComprador
          ? `${t("Pague usando o e-mail desta conta —")} ${emailDoComprador} ${t("— para o plano ser liberado automaticamente.")} `
          : null}
        {falarComQuem}
      </p>
    </div>
  );
}
