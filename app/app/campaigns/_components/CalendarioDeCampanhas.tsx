"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EstadoDaCampanha } from "@/components/campanhas/EstadoDaCampanha";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CampanhaDaLista } from "@/hooks/campanhas/useCampanhas";
import { useT } from "@/hooks/i18n/useT";
import { campanhasPorDia, chaveDoDia, diaDaCampanha, gradeDoMes } from "@/lib/campanhas/calendario";

/**
 * As campanhas no mês — cada uma no dia em que fala com as pessoas (agendada ou
 * iniciada). Serve para ver de relance o que sai quando, e não empilhar duas
 * campanhas no mesmo dia para o mesmo público.
 */
export function CalendarioDeCampanhas({ campanhas, idioma }: { campanhas: CampanhaDaLista[]; idioma: string }) {
  const t = useT();
  const hoje = useMemo(() => new Date(), []);
  const [mes, setMes] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() });

  const porDia = useMemo(() => campanhasPorDia(campanhas), [campanhas]);
  const dias = useMemo(() => gradeDoMes(mes.ano, mes.mes), [mes]);
  const semDia = useMemo(() => campanhas.filter((c) => diaDaCampanha(c) === null).length, [campanhas]);

  const titulo = new Date(mes.ano, mes.mes, 1).toLocaleDateString(idioma, { month: "long", year: "numeric" });
  // Domingo a sábado, no idioma de quem lê (4 de janeiro de 2026 é um domingo).
  const nomesDosDias = Array.from({ length: 7 }, (_, i) => new Date(2026, 0, 4 + i).toLocaleDateString(idioma, { weekday: "short" }));
  const andar = (delta: number) => {
    const d = new Date(mes.ano, mes.mes + delta, 1);
    setMes({ ano: d.getFullYear(), mes: d.getMonth() });
  };

  return (
    <Card className="space-y-3 p-4" data-testid="calendario-de-campanhas">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => andar(-1)} aria-label={t("Mês anterior")}>
          ‹
        </Button>
        <h2 className="font-medium capitalize">{titulo}</h2>
        <Button variant="outline" size="sm" onClick={() => andar(1)} aria-label={t("Próximo mês")}>
          ›
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-border text-sm">
        {nomesDosDias.map((n) => (
          <div key={n} className="bg-surface p-1 text-center text-xs text-muted-foreground">
            {n}
          </div>
        ))}
        {dias.map((d) => {
          const doDia = porDia.get(d.chave) ?? [];
          const ehHoje = d.chave === chaveDoDia(hoje);
          return (
            <div key={d.chave} className={`min-h-20 space-y-1 bg-surface p-1 ${d.doMes ? "" : "opacity-40"}`}>
              <span className={`inline-block rounded px-1 text-xs ${ehHoje ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                {d.data.getDate()}
              </span>
              {doDia.map((c) => (
                <Link
                  key={c.id}
                  href={`/app/campaigns/${c.id}`}
                  className="block space-y-0.5 rounded border border-border p-1 text-xs hover:bg-surface-elevated"
                  title={c.name}
                >
                  <span className="block truncate font-medium">{c.name}</span>
                  <EstadoDaCampanha status={c.status} />
                </Link>
              ))}
            </div>
          );
        })}
      </div>

      {semDia > 0 && (
        <p className="text-xs text-muted-foreground">
          {semDia === 1
            ? t("1 campanha sem data (rascunho ou ainda não iniciada) não aparece no calendário. Ela está na lista.")
            : `${semDia} ${t("campanhas sem data (rascunho ou ainda não iniciadas) não aparecem no calendário. Elas estão na lista.")}`}
        </p>
      )}
    </Card>
  );
}
