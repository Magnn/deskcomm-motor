/**
 * Análise → Resultado por anúncio. Qual criativo traz quem COMPRA, e quanto custou cada venda.
 *
 * A plataforma de anúncio mostra o que ela enxerga (gasto, conversa aberta); o funil daqui para
 * dentro só este sistema conhece. Esta tela junta os dois por anúncio.
 *
 * `manager` para cima, como a vizinha Meta Ads: custo e receita são da empresa inteira. O token da
 * conta de anúncios nunca passa por esta página — quem lê o gasto é a rota.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";

import { ResultadoPorAnuncioClient } from "./_components/ResultadoPorAnuncioClient";

export const metadata = { title: "Resultado por anúncio" };
export const dynamic = "force-dynamic";

export default async function ResultadoPorAnuncioPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }
  const t = (texto: string) => traduzir(texto, user.idioma);

  return (
    <div data-superficie="clara" className="-m-6 flex min-h-[calc(100%+3rem)] flex-col gap-6 bg-bg p-6 text-text">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Resultado por anúncio")}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t(
            "De quem cada anúncio trouxe no período: quantos conversaram, ouviram o preço, receberam o link e compraram — e quanto custou cada venda. A compra conta para o anúncio que trouxe a pessoa, mesmo que ela tenha pago dias depois.",
          )}
        </p>
      </header>
      <ResultadoPorAnuncioClient />
    </div>
  );
}
