"use client";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiUsage, type AiUsageFilters } from "@/hooks/ai/useAiUsage";
import { UsageFilters, type UsageFiltersAgent } from "@/components/ai/UsageFilters";
import { UsageChart } from "@/components/ai/UsageChart";
import { formatCentsUSD } from "@/lib/money";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { PONTO_POR_ID } from "@/lib/ai/pontos/registro";

interface Props {
  agents: UsageFiltersAgent[];
  initial: {
    agent_id?: string;
    invocation_kind?: string;
    from?: string;
    to?: string;
  };
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

/** 3.531.659.761 → "3,5 bi". O número inteiro vai no `title`, para quem quiser conferir. */
function compacto(valor: number, idioma: string): string {
  return new Intl.NumberFormat(idioma, { notation: "compact", maximumFractionDigits: 1 }).format(valor);
}

function StatSkeletons() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-8 w-32" />
        </Card>
      ))}
    </div>
  );
}

function ChartSkeletons() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-4 h-[200px] w-full" />
        </div>
      ))}
    </div>
  );
}

export function UsageDashboardClient({ agents, initial }: Props) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const searchParams = useSearchParams();

  const filters: AiUsageFilters = {
    agent_id: searchParams.get("agent_id") ?? undefined,
    invocation_kind: searchParams.get("invocation_kind") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };

  const q = useAiUsage(filters);

  return (
    <div className="flex flex-col gap-6">
      <UsageFilters agents={agents} initial={initial} />

      {q.isLoading || !q.data ? (
        <>
          <StatSkeletons />
          <ChartSkeletons />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t("Custo no período")}
              // DÓLAR: esta tela mostrava o MESMO número em duas moedas — o card de
              // orçamento logo acima em US$ e este StatCard em R$, dois centímetros abaixo.
              value={formatCentsUSD(q.data.totals.cost_cents)}
            />
            {/*
              Cada resposta ao cliente faz VÁRIAS chamadas (ler o clima, conferir a promessa,
              escrever, resumir). O rótulo antigo, "Atendimentos com IA", fazia 177 mil chamadas
              parecerem 177 mil clientes.
            */}
            <StatCard
              label={t("Chamadas à IA")}
              value={q.data.totals.invocations.toLocaleString(idioma)}
              hint={t("cada resposta ao cliente faz várias")}
            />
            <StatCard
              label={t("Passaram para uma pessoa")}
              value={`${(q.data.totals.handoff_rate * 100).toFixed(2)}%`}
              hint={t("quanto mais alto, mais a IA precisou de ajuda")}
            />
            {/*
              "p95" quer dizer: em 95 das 100 respostas o tempo foi ATÉ isso.
              É a medida honesta para tempo de resposta (a média esconde os
              casos ruins), mas o rótulo não pode ser a sigla — quem lê a tela
              precisa saber o que fazer com o número, não decorar estatística.
            */}
            <StatCard
              label={t("Tempo de resposta")}
              value={`${(q.data.totals.p95_latency_ms / 1000).toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })} s`}
              hint={`${t("a maioria responde em")} ${(
                q.data.totals.p50_latency_ms / 1000
              ).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s; ${t("este é o pior caso comum")}`}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="uso-tokens">
            <StatCard
              label={t("Tokens lidos pela IA")}
              value={compacto(q.data.totals.input_tokens, idioma)}
              hint={t("o roteiro, o material e a conversa, relidos a cada chamada")}
            />
            <StatCard
              label={t("Tokens escritos pela IA")}
              value={compacto(q.data.totals.output_tokens, idioma)}
              hint={t("as respostas e as anotações que ela produziu")}
            />
            <StatCard
              label={t("Leitura reaproveitada")}
              value={
                q.data.totals.input_tokens > 0
                  ? `${Math.round((q.data.totals.cached_tokens / q.data.totals.input_tokens) * 100)}%`
                  : "—"
              }
              hint={t("trecho repetido da conversa, que o fornecedor cobra com desconto")}
            />
          </div>

          {q.data.totals.unpriced_invocations > 0 && (
            <p
              data-testid="uso-sem-preco"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200"
            >
              {q.data.totals.unpriced_invocations.toLocaleString(idioma)}{" "}
              {t(
                "chamadas deste período usaram um modelo cujo preço o produto não conhece: os tokens delas estão contados, o custo não.",
              )}
            </p>
          )}

          <UsageChart payload={q.data} />

          {q.data.kinds.length > 0 && (
            <Card className="p-4" data-testid="uso-por-finalidade">
              <h3 className="text-sm font-medium text-muted-foreground">{t("Para onde foram os tokens")}</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">{t("Para quê")}</th>
                      <th className="py-2 pr-3 text-right font-medium">{t("Chamadas")}</th>
                      <th className="py-2 pr-3 text-right font-medium">{t("Lidos")}</th>
                      <th className="py-2 pr-3 text-right font-medium">{t("Escritos")}</th>
                      <th className="py-2 text-right font-medium">{t("Custo")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.kinds.map((k) => (
                      <tr key={k.kind} className="border-b last:border-0">
                        <td className="py-2 pr-3">{t(PONTO_POR_ID.get(k.kind)?.rotulo ?? k.kind)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{k.invocations.toLocaleString(idioma)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums" title={k.input_tokens.toLocaleString(idioma)}>
                          {compacto(k.input_tokens, idioma)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums" title={k.output_tokens.toLocaleString(idioma)}>
                          {compacto(k.output_tokens, idioma)}
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatCentsUSD(k.cost_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
