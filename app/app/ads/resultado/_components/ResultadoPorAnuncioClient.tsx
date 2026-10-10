"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import type { LinhaDoResultado, ResultadoPorAnuncio } from "@/lib/anuncio/resultado-por-anuncio";
import { formatCentsBRL } from "@/lib/money";

interface Resposta extends ResultadoPorAnuncio {
  periodo: { from: string; to: string };
  lido_em: string;
  avisos: string[];
}

/** Abaixo disto a conversão de um anúncio ainda é sorte: a tela diz, em vez de deixar concluir. */
const LEADS_PARA_CONCLUIR = 100;

const dinheiro = (centavos: number | null): string => (centavos === null ? "—" : formatCentsBRL(centavos));

function Celula({ children, forte }: { children: React.ReactNode; forte?: boolean }) {
  return <td className={`px-3 py-2 text-right tabular-nums ${forte ? "font-semibold" : ""}`}>{children}</td>;
}

function Linha({ l, rotulo, idioma, destaque }: { l: LinhaDoResultado; rotulo: string; idioma: string; destaque?: boolean }) {
  const t = useT();
  const num = (v: number) => v.toLocaleString(idioma);
  const poucos = l.anuncio !== "total" && l.leads < LEADS_PARA_CONCLUIR;
  return (
    <tr className={`border-b last:border-0 ${destaque ? "bg-muted/40 font-medium" : ""}`} data-testid="linha-do-anuncio">
      <td className="max-w-[18rem] px-3 py-2">
        <div className="truncate" title={rotulo}>
          {rotulo}
        </div>
        {l.campanha ? (
          <div className="truncate text-xs text-muted-foreground" title={l.campanha}>
            {l.campanha}
          </div>
        ) : null}
      </td>
      <Celula>{num(l.leads)}</Celula>
      <Celula>{num(l.engajaram)}</Celula>
      <Celula>{num(l.ouviramPreco)}</Celula>
      <Celula>{num(l.receberamLink)}</Celula>
      <Celula forte>{num(l.compradores)}</Celula>
      <Celula>
        <span title={poucos ? t("Com menos de 100 leads, a diferença entre anúncios ainda pode ser acaso.") : undefined}>
          {l.conversaoPct.toLocaleString(idioma, { maximumFractionDigits: 2 })}%{poucos ? " *" : ""}
        </span>
      </Celula>
      <Celula>{dinheiro(l.receitaCents)}</Celula>
      <Celula>{dinheiro(l.gastoCents)}</Celula>
      <Celula>{dinheiro(l.custoPorLeadCents)}</Celula>
      <Celula forte>{dinheiro(l.custoPorVendaCents)}</Celula>
      <Celula>{l.retorno === null ? "—" : l.retorno.toLocaleString(idioma, { maximumFractionDigits: 2 })}</Celula>
    </tr>
  );
}

export function ResultadoPorAnuncioClient() {
  const t = useT();
  const idioma = useTagDeIdioma();
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [pedido, setPedido] = useState<{ de: string; ate: string }>({ de: "", ate: "" });

  const q = useQuery({
    queryKey: ["ads", "resultado-por-anuncio", pedido],
    // Cada leitura consulta a plataforma de anúncio por anúncio: nada de repetir sozinho.
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (pedido.de) qs.set("from", pedido.de);
      if (pedido.ate) qs.set("to", pedido.ate);
      const sufixo = qs.toString() ? `?${qs.toString()}` : "";
      return (await apiClient.get<{ data: Resposta }>(`/api/v1/ads/resultado-por-anuncio${sufixo}`)).data;
    },
  });

  const cabecalhos = [
    t("Leads"),
    t("Conversaram"),
    t("Ouviram o preço"),
    t("Receberam link"),
    t("Compraram"),
    t("Conversão"),
    t("Receita"),
    t("Gasto"),
    t("Custo por lead"),
    t("Custo por venda"),
    t("Retorno"),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="resultado-de">{t("De")}</Label>
          <Input id="resultado-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="resultado-ate">{t("Até")}</Label>
          <Input id="resultado-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-40" />
        </div>
        <Button variant="outline" disabled={q.isFetching} onClick={() => setPedido({ de, ate })}>
          {q.isFetching ? t("Lendo…") : t("Atualizar")}
        </Button>
        {q.data ? (
          <p className="text-xs text-muted-foreground">
            {q.data.periodo.from} → {q.data.periodo.to} · {t("lido às")}{" "}
            {new Date(q.data.lido_em).toLocaleTimeString(idioma, { hour: "2-digit", minute: "2-digit" })}
          </p>
        ) : null}
      </div>

      {q.isError ? (
        <p className="rounded-md border border-destructive/40 p-3 text-sm" role="alert">
          {q.error instanceof ApiError ? q.error.message : t("Não foi possível ler o resultado por anúncio.")}
        </p>
      ) : null}

      {q.data?.avisos.map((aviso) => (
        <p key={aviso} className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200">
          {aviso}
        </p>
      ))}

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Lendo o funil e o gasto de cada anúncio…")}</p>
      ) : q.data && q.data.linhas.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          {t("Nenhum contato entrou neste período.")}
        </p>
      ) : q.data ? (
        <div className="overflow-x-auto rounded-md border" data-testid="tabela-resultado-por-anuncio">
          <table className="w-full min-w-[64rem] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">{t("Anúncio")}</th>
                {cabecalhos.map((c) => (
                  <th key={c} className="px-3 py-2 text-right font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Linha l={q.data.total} rotulo={t("Todos os anúncios identificados")} idioma={idioma} destaque />
              {q.data.linhas.map((l) => (
                <Linha
                  key={l.anuncio ?? "sem-anuncio"}
                  l={l}
                  idioma={idioma}
                  rotulo={
                    l.anuncio === null
                      ? t("Sem anúncio identificado")
                      : `${l.nome ?? t("Anúncio")} · …${l.anuncio.slice(-6)}`
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {q.data && q.data.linhas.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t(
            "“—” no gasto quer dizer que ele não foi lido para aquele anúncio, não que foi zero. O asterisco marca anúncio com menos de 100 leads: a conversão dele ainda não sustenta conclusão.",
          )}
        </p>
      ) : null}
    </div>
  );
}
