"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

type Motivo = "preco" | "confianca" | "sem_urgencia" | "timing" | "concorrente" | "sem_resposta" | "outro";
type Origem = "regra" | "ia" | "humano";

interface Painel {
  porMotivo: { motivo: Motivo; total: number; confiancaMedia: number | null }[];
  conversas: { conversaId: string; motivo: Motivo; confianca: number | null; origem: Origem; em: string }[];
  pendentes: number;
}

interface Analise {
  porRegra: number;
  porIa: number;
  semLeitura: number;
  interrompida: string | null;
  restantes: number;
}

const ROTULO: Record<Motivo, string> = {
  preco: "Preço",
  confianca: "Falta de confiança",
  sem_urgencia: "Sem urgência",
  timing: "Não é o momento",
  concorrente: "Foi para um concorrente",
  sem_resposta: "Parou de responder",
  outro: "Outro motivo",
};

const ROTULO_DA_ORIGEM: Record<Origem, string> = {
  regra: "Fato",
  ia: "Sugestão da IA",
  humano: "Corrigido por uma pessoa",
};

const MOTIVOS = Object.keys(ROTULO) as Motivo[];

/**
 * Por que não compraram — os motivos das conversas que receberam a oferta e
 * pararam. A tela separa o que é FATO (parou de responder), o que é SUGESTÃO da
 * IA (com a confiança dela) e o que uma pessoa CORRIGIU. A análise é pedida no
 * botão: ela gasta IA, e nenhum gasto acontece sozinho.
 */
export function MotivoDaPerdaPainel({ period }: { period: string }) {
  const t = useT();
  const cache = useQueryClient();
  const [analisando, setAnalisando] = useState(false);
  const chave = ["resultado-perdas", period];
  const consulta = useQuery({
    queryKey: chave,
    queryFn: async () => (await apiClient.get<{ data: Painel }>(`/api/v1/resultado/perdas?period=${encodeURIComponent(period)}`)).data,
    retry: false,
  });

  const analisar = async () => {
    setAnalisando(true);
    try {
      const r = (await apiClient.post<{ data: Analise }>("/api/v1/resultado/perdas", {})).data;
      if (r.interrompida) toast.warning(t("A IA parou no meio da análise (limite de gasto, chave ou provedor). O que já foi analisado ficou gravado."));
      else if (r.porRegra + r.porIa === 0) toast.info(t("Nenhuma conversa parada para analisar agora."));
      else toast.success(`${r.porRegra + r.porIa} ${t("conversas analisadas.")}`);
      await cache.invalidateQueries({ queryKey: chave });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Não foi possível analisar as conversas."));
    } finally {
      setAnalisando(false);
    }
  };

  const corrigir = async (conversaId: string, motivo: Motivo) => {
    try {
      await apiClient.patch(`/api/v1/resultado/perdas/${conversaId}`, { motivo });
      toast.success(t("Motivo corrigido."));
      await cache.invalidateQueries({ queryKey: chave });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Não foi possível corrigir o motivo."));
    }
  };

  if (consulta.isPending) return <p className="text-sm text-muted-foreground">{t("Lendo os motivos de perda…")}</p>;
  if (consulta.isError || !consulta.data) {
    return <p role="alert" className="text-sm text-destructive">{t("Não foi possível ler os motivos de perda.")}</p>;
  }

  const { porMotivo, conversas, pendentes } = consulta.data;
  const total = porMotivo.reduce((s, m) => s + m.total, 0);

  return (
    <div className="rounded-2xl border bg-card p-4" data-testid="painel-perdas">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{t("Por que não compraram")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("Conversas que receberam a oferta, não compraram e estão paradas há dois dias ou mais.")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button size="sm" disabled={analisando || pendentes === 0} onClick={() => void analisar()} data-testid="analisar-perdas">
            {analisando ? t("Analisando…") : t("Analisar conversas paradas")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {pendentes === 0 ? t("Nenhuma conversa esperando análise.") : `${pendentes} ${t("esperando análise. A análise usa a inteligência artificial e conta no seu limite de gasto.")}`}
          </span>
        </div>
      </div>

      {total === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("Nenhum motivo registrado neste período.")}</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ul className="space-y-2">
            {porMotivo.map((m) => (
              <li key={m.motivo} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{t(ROTULO[m.motivo])}</span>
                  <span className="font-medium tabular-nums">
                    {Math.round((m.total / total) * 100)}%
                    <span className="ml-1 text-xs font-normal text-muted-foreground">({m.total})</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, (m.total / total) * 100)}%` }} />
                </div>
                {m.confiancaMedia !== null && (
                  <p className="text-xs text-muted-foreground">
                    {t("Confiança média da IA:")} {m.confiancaMedia}%
                  </p>
                )}
              </li>
            ))}
          </ul>

          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {conversas.map((c, i) => (
              <li key={c.conversaId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                <span className="min-w-0">
                  <Link href={`/app/inbox?id=${c.conversaId}`} className="underline underline-offset-4">
                    {t("Conversa")} {i + 1}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {t(ROTULO_DA_ORIGEM[c.origem])}
                    {c.origem === "ia" && c.confianca !== null ? ` · ${c.confianca}%` : ""}
                  </span>
                </span>
                <label className="flex items-center gap-2 text-xs">
                  <span className="sr-only">{t("Corrigir o motivo")}</span>
                  <select
                    className="h-8 rounded-md border bg-background px-2 text-sm"
                    value={c.motivo}
                    onChange={(e) => void corrigir(c.conversaId, e.target.value as Motivo)}
                    aria-label={t("Corrigir o motivo")}
                  >
                    {MOTIVOS.map((m) => (
                      <option key={m} value={m}>
                        {t(ROTULO[m])}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
