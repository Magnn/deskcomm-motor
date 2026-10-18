"use client";
import { useQuery } from "@tanstack/react-query";

import { useT } from "@/hooks/i18n/useT";
import { useMarcaDaInstalacao } from "@/lib/branding/contexto";
import type { RetornoDaPlataforma } from "@/lib/resultado/retorno-da-plataforma";

const reais = (centavos: number, tag: string) =>
  (centavos / 100).toLocaleString(tag, { style: "currency", currency: "BRL" });

/**
 * "O que a plataforma trouxe" — o trabalho do agente, as vendas pagas e o que a empresa pagou à plataforma,
 * lado a lado. É a prova do posicionamento "paga pouco para ter e uma parte quando vende": quem compra
 * resultado precisa ver o resultado contra o custo. Cada número diz a regra da conta
 * (`lib/resultado/retorno-da-plataforma.ts`).
 */
export function RetornoDaPlataformaPainel({ period, tagDoIdioma }: { period: string; tagDoIdioma: string }) {
  const t = useT();
  const marca = useMarcaDaInstalacao();
  const consulta = useQuery({
    queryKey: ["resultado-retorno-da-plataforma", period],
    queryFn: async (): Promise<RetornoDaPlataforma | null> => {
      const r = await fetch(`/api/v1/resultado/retorno-da-plataforma?period=${encodeURIComponent(period)}`);
      const corpo = await r.json().catch(() => null);
      if (!r.ok) throw new Error(r.status === 403 ? "sem_permissao" : "falha");
      return ((corpo?.data ?? corpo)?.retorno ?? null) as RetornoDaPlataforma | null;
    },
    retry: false,
    refetchInterval: 60_000,
  });

  const titulo = `${t("O que")} ${marca.name} ${t("trouxe para você")}`;

  if (consulta.isPending) return <p className="text-sm text-muted-foreground">{t("Calculando o resultado…")}</p>;
  if (consulta.isError || !consulta.data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {consulta.error instanceof Error && consulta.error.message === "sem_permissao"
          ? t("A receita é visível para gerentes e administradores.")
          : t("Não foi possível calcular o que a plataforma trouxe.")}
      </p>
    );
  }

  const r = consulta.data;
  const cartao = (rotulo: string, valor: string, detalhe: string, id: string) => (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight" data-testid={id}>
        {valor}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>
    </div>
  );

  return (
    <section className="space-y-3" data-testid="painel-retorno-da-plataforma">
      <div>
        <h2 className="text-base font-semibold">{titulo}</h2>
        <p className="text-xs text-muted-foreground">{t("O trabalho do agente e as vendas pagas no período, contra o que você pagou à plataforma.")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {cartao(
          t("Conversas atendidas pela IA"),
          r.conversasAtendidasPelaIa.toLocaleString(tagDoIdioma),
          `${r.mensagensDaIa.toLocaleString(tagDoIdioma)} ${t("mensagens enviadas pela IA")}`,
          "retorno-conversas",
        )}
        {cartao(
          t("Links e Pix de pagamento enviados"),
          r.linksDePagamentoEnviados.toLocaleString(tagDoIdioma),
          r.cortado ? t("Período grande demais: a conta parou no teto de mensagens.") : t("Mensagens que saíram com link ou Pix de pagamento."),
          "retorno-links",
        )}
        {cartao(
          t("Vendas pagas"),
          reais(r.receitaCentavos, tagDoIdioma),
          `${r.vendasPagas.toLocaleString(tagDoIdioma)} ${t("vendas, com estornos descontados.")}`,
          "retorno-receita",
        )}
      </div>

      <div className="rounded-2xl border bg-card p-4" data-testid="retorno-custo">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{t("Quanto você pagou à plataforma no período")}</p>
          <p className="text-lg font-semibold">{reais(r.custo.totalCentavos, tagDoIdioma)}</p>
        </div>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          <li>
            {r.custo.plano
              ? `${t("Plano")} ${r.custo.plano.nome} (${reais(r.custo.plano.precoMensalCentavos, tagDoIdioma)} ${t("por mês")}), ${t("proporcional a")} ${r.dias} ${t("dias")}: ${reais(r.custo.plano.noPeriodoCentavos, tagDoIdioma)}`
              : t("Sem plano pago no período.")}
          </li>
          <li>
            {t("Taxas por venda descontadas pela Stripe:")} {reais(r.custo.taxasCentavos, tagDoIdioma)}
          </li>
        </ul>
        <p className="mt-3 text-sm font-medium" data-testid="retorno-por-real">
          {r.retornoPorReal === null
            ? t("Sem custo no período para comparar.")
            : `${t("Para cada")} ${reais(100, tagDoIdioma)} ${t("pago à plataforma, entraram")} ${reais(Math.round(r.retornoPorReal * 100), tagDoIdioma)} ${t("em vendas.")}`}
        </p>
      </div>
    </section>
  );
}
