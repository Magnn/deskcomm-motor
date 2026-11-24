"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import type { ResumoResposta } from "@/hooks/ads/useMetaAds";
import { vereditoDaCampanha, type NumerosDoPeriodo, type Veredito } from "@/lib/anuncio/resumo-da-conta";

import { DecisaoDoDia, FunilPorAnuncio, LinhaDoTempo, PodeEscalar } from "./PainelDeTrafego";

/**
 * O topo da tela de Meta Ads: os quatro números que decidem verba, o que está rodando com uma
 * etiqueta de decisão, e os anúncios que mais vendem. As colunas técnicas ficam recolhidas embaixo.
 */

const ETIQUETA: Record<Veredito, { texto: string; classe: string }> = {
  escalar: { texto: "Escalar", classe: "bg-success-bg text-success-fg" },
  segurar: { texto: "Segurar", classe: "bg-warning-bg text-warning-fg" },
  cortar: { texto: "Cortar", classe: "bg-error-bg text-error-fg" },
  pouco_dado: { texto: "Pouco dado", classe: "bg-muted text-muted-foreground" },
};

const VEICULACAO: Record<string, string> = {
  WITH_ISSUES: "com problema",
  DISAPPROVED: "reprovada",
  PENDING_REVIEW: "em análise",
  IN_PROCESS: "em processamento",
  PENDING_BILLING_INFO: "aguardando pagamento",
};

/** Conta que a plataforma marcou (status ≠ 1): o alerta mais importante da tela. */
const STATUS_DA_CONTA: Record<number, string> = {
  2: "desativada",
  3: "pendência de cobrança",
  7: "em análise de risco",
  8: "aguardando pagamento",
  9: "em período de carência",
  100: "encerramento pendente",
  101: "encerrada",
};

interface Props {
  resumo: ResumoResposta;
  moeda: string;
  statusDaConta: number | null;
  /** Mostra Pausar/Reativar em cada campanha (admin). */
  podeGerenciar: boolean;
}

/** Status de veiculação que a pessoa pode reverter daqui: o que está no ar pausa, o que ELA pausou reativa. */
const PODE_PAUSAR = new Set(["ACTIVE"]);
const PODE_REATIVAR = new Set(["PAUSED", "CAMPAIGN_PAUSED"]);

export function ResumoDaConta({ resumo, moeda, statusDaConta, podeGerenciar }: Props) {
  const t = useT();
  const queryClient = useQueryClient();
  const [mudando, setMudando] = useState<string | null>(null);

  async function mudarVeiculacao(campanhaId: string, status: "PAUSED" | "ACTIVE") {
    setMudando(campanhaId);
    try {
      await apiClient.post(`/api/v1/ads/meta/campaigns/${campanhaId}/veiculacao`, { status });
      toast.success(status === "PAUSED" ? t("Campanha pausada.") : t("Campanha reativada."));
      await queryClient.invalidateQueries({ queryKey: ["ads", "meta"] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Não foi possível mudar a campanha. Tente de novo."));
    } finally {
      setMudando(null);
    }
  }
  const tag = useTagDeIdioma();
  const dinheiro = (cents: number) =>
    (cents / 100).toLocaleString(tag, { style: "currency", currency: moeda, maximumFractionDigits: 0 });
  const vezes = (r: number | null) => (r === null ? "—" : `${r.toLocaleString(tag, { maximumFractionDigits: 1 })}×`);
  const { atual, anterior } = resumo;
  const emReal = moeda === "BRL";

  const alertaDaConta = statusDaConta !== null ? STATUS_DA_CONTA[statusDaConta] : undefined;

  return (
    <div className="flex flex-col gap-6">
      {(alertaDaConta || resumo.alertas.length > 0) && (
        <ul role="alert" className="flex flex-col gap-1 rounded-xl border border-warning/40 bg-warning-bg p-4 text-sm text-warning-fg">
          {alertaDaConta && (
            <li>
              ⚠ {t("Conta de anúncios")} {t(alertaDaConta)}
            </li>
          )}
          {resumo.alertas.map((a) => (
            <li key={a.campanha}>
              ⚠ {a.campanha}: {t(VEICULACAO[a.veiculacao] ?? a.veiculacao)}
            </li>
          ))}
        </ul>
      )}

      <DecisaoDoDia
        resumo={resumo}
        moeda={moeda}
        podeGerenciar={podeGerenciar}
        pausando={mudando !== null}
        onPausar={(id) => void mudarVeiculacao(id, "PAUSED")}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero rotulo={t("Gasto")} valor={dinheiro(atual.gastoCents)} delta={variacao(atual.gastoCents, anterior.gastoCents)} />
        <Numero
          rotulo={t("Vendas")}
          valor={dinheiro(atual.receitaCents)}
          detalhe={`${t("Clientes")}: ${atual.compradores}`}
          delta={variacao(atual.receitaCents, anterior.receitaCents)}
        />
        <Numero
          rotulo={t("Retorno")}
          valor={emReal ? vezes(atual.retorno) : "—"}
          detalhe={emReal ? t("pelo menos: só conta venda registrada") : t("conta em outra moeda")}
          delta={emReal && atual.retorno !== null && anterior.retorno !== null ? diferencaDeRetorno(atual, anterior, tag) : null}
        />
        <Numero
          rotulo={t("Custo por cliente")}
          valor={atual.custoPorClienteCents === null ? "—" : dinheiro(atual.custoPorClienteCents)}
          delta={
            atual.custoPorClienteCents !== null && anterior.custoPorClienteCents !== null
              ? variacao(atual.custoPorClienteCents, anterior.custoPorClienteCents, true)
              : null
          }
        />
      </div>

      <PodeEscalar resumo={resumo} alertaDaConta={alertaDaConta} />

      <section className="flex flex-col gap-3 rounded-xl border bg-surface p-5 shadow-sm">
        <h2 className="text-base font-bold">{t("Rodando agora")}</h2>
        {resumo.rodando.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Nenhuma campanha rodou neste período.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("Campanha")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("Gasto")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("Conversas")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("Vendas")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("Retorno")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {resumo.rodando.map((c) => {
                  const v = vereditoDaCampanha(c, moeda);
                  return (
                    <tr key={c.id} className="border-t">
                      <td className="px-3 py-2">
                        <span className={c.veiculacao === "ACTIVE" ? "text-success" : "text-muted-foreground"} aria-hidden>
                          ●
                        </span>{" "}
                        {c.nome}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{dinheiro(c.gastoCents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.conversas}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{dinheiro(c.receitaCents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{emReal ? vezes(c.retorno) : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {v && <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${ETIQUETA[v].classe}`}>{t(ETIQUETA[v].texto)}</span>}
                          {podeGerenciar && c.veiculacao && PODE_PAUSAR.has(c.veiculacao) && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={mudando !== null}
                              data-testid={`pausar-campanha-${c.id}`}
                              onClick={() => void mudarVeiculacao(c.id, "PAUSED")}
                            >
                              {mudando === c.id ? t("Pausando…") : t("Pausar")}
                            </Button>
                          )}
                          {podeGerenciar && c.veiculacao && PODE_REATIVAR.has(c.veiculacao) && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={mudando !== null}
                              data-testid={`reativar-campanha-${c.id}`}
                              onClick={() => void mudarVeiculacao(c.id, "ACTIVE")}
                            >
                              {mudando === c.id ? t("Reativando…") : t("Reativar")}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Os campeões viraram a miniatura na linha deles: o funil mostra TODOS os anúncios, do gasto ao Pix. */}
      <FunilPorAnuncio resumo={resumo} moeda={moeda} />

      <LinhaDoTempo resumo={resumo} moeda={moeda} />

      {resumo.paradas > 0 && (
        <p className="text-xs text-muted-foreground">
          {resumo.paradas} {t("campanhas paradas, sem gasto no período (estão nos números técnicos).")}
        </p>
      )}
    </div>
  );
}

/** Variação percentual; `menorEMelhor` pinta queda de verde (custo). */
function variacao(atual: number, anterior: number, menorEMelhor = false): { texto: string; bom: boolean } | null {
  if (anterior === 0) return null;
  const pct = Math.round(((atual - anterior) / anterior) * 100);
  if (pct === 0) return { texto: "=", bom: true };
  return { texto: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`, bom: menorEMelhor ? pct < 0 : pct > 0 };
}

function diferencaDeRetorno(atual: NumerosDoPeriodo, anterior: NumerosDoPeriodo, tag: string): { texto: string; bom: boolean } {
  const d = (atual.retorno ?? 0) - (anterior.retorno ?? 0);
  return { texto: `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toLocaleString(tag, { maximumFractionDigits: 1 })}`, bom: d >= 0 };
}

function Numero({ rotulo, valor, detalhe, delta }: { rotulo: string; valor: string; detalhe?: string; delta: { texto: string; bom: boolean } | null }) {
  const t = useT();
  return (
    <div className="rounded-xl border bg-surface p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{rotulo}</p>
      <p className="mt-1 font-mono text-[28px] font-semibold tabular-nums">{valor}</p>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
      {delta && (
        <p className={`mt-1 text-xs ${delta.bom ? "text-success" : "text-error"}`}>
          {delta.texto} <span className="text-muted-foreground">{t("vs período anterior")}</span>
        </p>
      )}
    </div>
  );
}
