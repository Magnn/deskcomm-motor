"use client";
import { useQuery } from "@tanstack/react-query";

import { useT } from "@/hooks/i18n/useT";
import type { PainelDoPosVenda } from "@/lib/resultado/pos-venda";

const reais = (centavos: number, tag: string) =>
  (centavos / 100).toLocaleString(tag, { style: "currency", currency: "BRL" });

/**
 * O pós-venda do catálogo do agente: a quem cada produto foi oferecido, quantos pediram o link,
 * quantos compraram e quanto entrou — e a receita média por cliente, de sempre. Cada número diz a
 * regra da conta (`lib/resultado/pos-venda.ts`).
 */
export function PosVendaPainel({ period, tagDoIdioma }: { period: string; tagDoIdioma: string }) {
  const t = useT();
  const consulta = useQuery({
    queryKey: ["resultado-pos-venda", period],
    queryFn: async (): Promise<PainelDoPosVenda | null> => {
      const r = await fetch(`/api/v1/resultado/pos-venda?period=${encodeURIComponent(period)}`);
      const corpo = await r.json().catch(() => null);
      if (!r.ok) throw new Error(r.status === 403 ? "sem_permissao" : "falha");
      return ((corpo?.data ?? corpo)?.painel ?? null) as PainelDoPosVenda | null;
    },
    retry: false,
    refetchInterval: 60_000,
  });

  if (consulta.isPending) return <p className="text-sm text-muted-foreground">{t("Calculando o pós-venda…")}</p>;
  if (consulta.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {consulta.error instanceof Error && consulta.error.message === "sem_permissao"
          ? t("A receita é visível para gerentes e administradores.")
          : t("Não foi possível calcular o pós-venda.")}
      </p>
    );
  }

  const p = consulta.data;
  if (p === null || p === undefined) {
    return (
      <section className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground" data-testid="painel-pos-venda">
        <h2 className="mb-1 text-base font-semibold text-foreground">{t("Pós-venda")}</h2>
        {t("Nenhum agente com catálogo ligado. Cadastre os produtos para quem já comprou na aba Catálogo do agente.")}
      </section>
    );
  }

  return (
    <section className="space-y-3" data-testid="painel-pos-venda">
      <div>
        <h2 className="text-base font-semibold">{t("Pós-venda")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("O que o catálogo do agente rendeu com quem já comprou, no período escolhido.")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">{t("Receita média por cliente")}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight" data-testid="pos-venda-media">
            {reais(p.receitaMediaPorClienteCentavos, tagDoIdioma)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Tudo o que já entrou, de sempre, dividido por quem já pagou")}: {p.clientesQuePagaram}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">{t("Receita do pós-venda no período")}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {reais(p.produtos.reduce((a, l) => a + l.receitaCentavos, 0), tagDoIdioma)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {p.produtos.reduce((a, l) => a + l.compras, 0)} {t("compras dos produtos do catálogo")}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">{t("Produto")}</th>
              <th className="p-3 text-right font-medium">{t("Oferecido a")}</th>
              <th className="p-3 text-right font-medium">{t("Pediram o link")}</th>
              <th className="p-3 text-right font-medium">{t("Compraram")}</th>
              <th className="p-3 text-right font-medium">{t("Receita")}</th>
            </tr>
          </thead>
          <tbody>
            {p.produtos.map((l) => (
              <tr key={l.nome} className="border-t">
                <td className="p-3">
                  <span className="font-medium">{l.nome}</span>{" "}
                  <span className="text-xs text-muted-foreground">{reais(l.precoCentavos, tagDoIdioma)}</span>
                </td>
                <td className="p-3 text-right tabular-nums">{l.oferecidas}</td>
                <td className="p-3 text-right tabular-nums">{l.pediramLink}</td>
                <td className="p-3 text-right tabular-nums">{l.compras}</td>
                <td className="p-3 text-right tabular-nums">{reais(l.receitaCentavos, tagDoIdioma)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {p.ofertasRepetidasNoDia > 0 && (
        <p role="alert" className="text-sm text-destructive" data-testid="pos-venda-repetida">
          {t("Atenção: houve cliente que recebeu mais de um produto no mesmo dia")}: {p.ofertasRepetidasNoDia}
        </p>
      )}
      {p.cortado && (
        <p className="text-xs text-muted-foreground">{t("O período tem mais mensagens do que a tela soma de uma vez: escolha um período menor para ver tudo.")}</p>
      )}
      <p className="text-xs text-muted-foreground">
        {t("Oferecido = mensagem do agente que cita o produto para quem já pagou. Compra = pagamento aprovado do produto; estorno entra negativo.")}
      </p>
    </section>
  );
}
