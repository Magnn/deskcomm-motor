"use client";
import { useQuery } from "@tanstack/react-query";

import { useT } from "@/hooks/i18n/useT";

interface Fatia {
  chave: string;
  rotulo: string;
  receitaCentavos: number;
  vendas: number;
}

interface Resposta {
  receita: {
    receitaLiquidaCentavos: number;
    receitaBrutaCentavos: number;
    devolvidoCentavos: number;
    vendas: number;
    ticketMedioCentavos: number;
    porOrigem: Fatia[];
    porAgente: Fatia[];
    porFluxo: Fatia[];
  };
  delta: { receita: number; vendas: number };
  cortado: boolean;
}

const reais = (centavos: number, tag: string) =>
  (centavos / 100).toLocaleString(tag, { style: "currency", currency: "BRL" });

/**
 * A aba Receita do dashboard: quanto dinheiro entrou pelos pagamentos (Cakto),
 * e de onde ele veio — anúncio, agente, fluxo. Cada bloco diz a REGRA da conta;
 * atribuição sem a regra escrita é número que ninguém sabe ler.
 */
export function ReceitaAtribuidaPainel({ period, tagDoIdioma }: { period: string; tagDoIdioma: string }) {
  const t = useT();
  const consulta = useQuery({
    queryKey: ["resultado-receita", period],
    queryFn: async (): Promise<Resposta> => {
      const r = await fetch(`/api/v1/resultado/receita?period=${encodeURIComponent(period)}`);
      const corpo = await r.json().catch(() => null);
      if (!r.ok) throw new Error(r.status === 403 ? "sem_permissao" : "falha");
      return (corpo?.data ?? corpo) as Resposta;
    },
    retry: false,
    // Relê sozinho a cada minuto com a aba visível (o react-query pausa em segundo plano).
    refetchInterval: 60_000,
  });

  if (consulta.isPending) return <p className="text-sm text-muted-foreground">{t("Calculando a receita…")}</p>;
  if (consulta.isError || !consulta.data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {consulta.error instanceof Error && consulta.error.message === "sem_permissao"
          ? t("A receita é visível para gerentes e administradores.")
          : t("Não foi possível calcular a receita.")}
      </p>
    );
  }

  const dados = consulta.data;
  const r = dados.receita;
  const vazio = r.vendas === 0 && r.devolvidoCentavos === 0;

  return (
    <div className="space-y-6" data-testid="painel-receita">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo={t("Receita líquida")} valor={reais(r.receitaLiquidaCentavos, tagDoIdioma)} delta={dados.delta.receita} />
        <Indicador titulo={t("Vendas")} valor={String(r.vendas)} delta={dados.delta.vendas} />
        <Indicador titulo={t("Ticket médio")} valor={reais(r.ticketMedioCentavos, tagDoIdioma)} />
        <Indicador titulo={t("Reembolsos e chargebacks")} valor={reais(r.devolvidoCentavos, tagDoIdioma)} />
      </div>

      {vazio ? (
        <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
          {t("Nenhum pagamento neste período. A receita aparece aqui assim que a plataforma de pagamento avisar uma venda (hoje: Cakto, pelo webhook em Integrações).")}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Fatias titulo={t("Por origem")} regra={t("Primeiro toque: o anúncio que trouxe a pessoa.")} fatias={r.porOrigem} tag={tagDoIdioma} />
          <Fatias titulo={t("Por agente")} regra={t("O último agente que respondeu a pessoa antes da compra.")} fatias={r.porAgente} tag={tagDoIdioma} />
          <Fatias titulo={t("Por fluxo")} regra={t("O último fluxo em que a pessoa entrou antes da compra.")} fatias={r.porFluxo} tag={tagDoIdioma} />
        </div>
      )}

      {dados.cortado && (
        <p className="text-xs text-muted-foreground">{t("O período tem mais pagamentos do que a tela soma de uma vez: escolha um período menor para ver tudo.")}</p>
      )}
      <p className="text-xs text-muted-foreground">
        {t("Reembolso e chargeback entram negativos, na mesma origem, agente e fluxo da venda. Valores pela data do pagamento.")}
      </p>
    </div>
  );
}

function Indicador({ titulo, valor, delta }: { titulo: string; valor: string; delta?: number }) {
  const t = useT();
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{valor}</p>
      {delta !== undefined && (
        <p className={`mt-1 text-xs ${delta >= 0 ? "text-emerald-600" : "text-destructive"}`}>
          {delta >= 0 ? "+" : ""}
          {delta}% {t("vs. período anterior")}
        </p>
      )}
    </div>
  );
}

function Fatias({ titulo, regra, fatias, tag }: { titulo: string; regra: string; fatias: Fatia[]; tag: string }) {
  const t = useT();
  const maior = Math.max(1, ...fatias.map((f) => Math.abs(f.receitaCentavos)));
  return (
    <div className="rounded-2xl border bg-card p-4">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{regra}</p>
      <ul className="space-y-2">
        {fatias.map((f) => (
          <li key={f.chave} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate" title={t(f.rotulo)}>
                {t(f.rotulo)}
              </span>
              <span className="shrink-0 font-medium tabular-nums">{reais(f.receitaCentavos, tag)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted">
              <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, (Math.abs(f.receitaCentavos) / maior) * 100)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {f.vendas === 1 ? t("1 venda") : `${f.vendas} ${t("vendas")}`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
