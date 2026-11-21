"use client";
import { useQuery } from "@tanstack/react-query";

import { useT } from "@/hooks/i18n/useT";
import type { CobrancaDoMes } from "@/lib/resultado/cobranca-do-whatsapp";

const reais = (centavos: number, tag: string) =>
  (centavos / 100).toLocaleString(tag, { style: "currency", currency: "BRL" });

/**
 * "Cobrança do WhatsApp oficial" — o que a Meta cobra no mês, número a número. Desde 1º/10/2026 cada número oficial
 * tem 1.000 mensagens de atendimento grátis por mês; depois disso, toda resposta é paga. Sem esta tela a conta só
 * aparecia na fatura (`lib/resultado/cobranca-do-whatsapp.ts`).
 */
export function CobrancaDoWhatsappPainel({ tagDoIdioma }: { tagDoIdioma: string }) {
  const t = useT();
  const consulta = useQuery({
    queryKey: ["resultado-cobranca-do-whatsapp"],
    queryFn: async (): Promise<CobrancaDoMes | null> => {
      const r = await fetch("/api/v1/resultado/cobranca-do-whatsapp");
      const corpo = await r.json().catch(() => null);
      if (!r.ok) throw new Error(r.status === 403 ? "sem_permissao" : "falha");
      return ((corpo?.data ?? corpo)?.cobranca ?? null) as CobrancaDoMes | null;
    },
    retry: false,
    refetchInterval: 5 * 60_000,
  });

  if (consulta.isPending) return <p className="text-sm text-muted-foreground">{t("Lendo a cobrança do WhatsApp…")}</p>;
  if (consulta.isError || !consulta.data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {consulta.error instanceof Error && consulta.error.message === "sem_permissao"
          ? t("A cobrança é visível para gerentes e administradores.")
          : t("Não foi possível ler a cobrança do WhatsApp.")}
      </p>
    );
  }

  const c = consulta.data;
  if (c.numeros.length === 0) return null;

  return (
    <section className="space-y-3" data-testid="painel-cobranca-whatsapp">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{t("Cobrança do WhatsApp oficial neste mês")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("A Meta dá")} {c.franquia.toLocaleString(tagDoIdioma)} {t("mensagens de atendimento grátis por número por mês; depois disso, cada mensagem é cobrada.")}
          </p>
        </div>
        <p className="text-lg font-semibold" data-testid="cobranca-total">
          {reais(c.totalCentavos, tagDoIdioma)}
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="p-3 text-left font-medium">{t("Número")}</th>
              <th className="p-3 text-right font-medium">{t("Enviadas")}</th>
              <th className="p-3 text-left font-medium">{t("Franquia grátis")}</th>
              <th className="p-3 text-right font-medium">{t("Pagas")}</th>
              <th className="p-3 text-right font-medium">{t("Custo aproximado")}</th>
            </tr>
          </thead>
          <tbody>
            {c.numeros.map((n) => {
              const usado = Math.min(100, Math.round((n.gratis / c.franquia) * 100));
              return (
                <tr key={n.canalId} className="border-b last:border-0" data-testid="cobranca-numero">
                  <td className="p-3">
                    <p className="font-medium">{n.nome ?? n.telefone}</p>
                    <p className="text-xs text-muted-foreground">{n.telefone}</p>
                  </td>
                  <td className="p-3 text-right tabular-nums">{n.enviadas.toLocaleString(tagDoIdioma)}</td>
                  <td className="p-3">
                    <div className="h-2 w-28 rounded-full bg-muted" role="img" aria-label={`${usado}% ${t("da franquia usada")}`}>
                      <div className={`h-2 rounded-full ${usado >= 100 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${usado}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.gratis.toLocaleString(tagDoIdioma)} / {c.franquia.toLocaleString(tagDoIdioma)}
                    </p>
                  </td>
                  <td className="p-3 text-right tabular-nums">{n.pagas.toLocaleString(tagDoIdioma)}</td>
                  <td className="p-3 text-right tabular-nums">
                    {reais(n.custoCentavos, tagDoIdioma)}
                    {n.estimada ? <p className="text-xs text-muted-foreground">{t("estimado")}</p> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("Valores aproximados, pelo que a Meta informa a cada mensagem. A fatura da Meta é a referência final.")}
      </p>
    </section>
  );
}
