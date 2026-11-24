"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import type { ResumoResposta } from "@/hooks/ads/useMetaAds";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { vereditoDaCampanha, type Veredito } from "@/lib/anuncio/resumo-da-conta";

/**
 * O PAINEL DE TRÁFEGO — o que fica em volta dos números da conta: a decisão do dia (com o botão que a
 * executa e o desfazer), "pode escalar?", o funil de cada anúncio até o Pix e a linha do tempo do que
 * foi mudado por aqui. Tudo vem pronto do resumo (`/api/v1/ads/meta/resumo`); a regra da decisão mora
 * em `lib/anuncio/decisao-do-dia.ts`, e a escrita no orçamento em `campaigns/[id]/orcamento`.
 */

type Dinheiro = (cents: number) => string;

function useFormatos(moeda: string) {
  const tag = useTagDeIdioma();
  const dinheiro: Dinheiro = (cents) =>
    (cents / 100).toLocaleString(tag, { style: "currency", currency: moeda, maximumFractionDigits: 0 });
  const centavos: Dinheiro = (cents) =>
    (cents / 100).toLocaleString(tag, { style: "currency", currency: moeda, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dia = (iso: string) => new Date(iso).toLocaleDateString(tag, { day: "2-digit", month: "2-digit" });
  return { dinheiro, centavos, dia };
}

// ─────────────────────────────────────────────────────────────────────────────
// Decisão do dia
// ─────────────────────────────────────────────────────────────────────────────

export function DecisaoDoDia({
  resumo,
  moeda,
  podeGerenciar,
  onPausar,
  pausando,
}: {
  resumo: ResumoResposta;
  moeda: string;
  podeGerenciar: boolean;
  onPausar: (campanhaId: string) => void;
  pausando: boolean;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const { dinheiro, centavos, dia } = useFormatos(moeda);
  const [salvando, setSalvando] = useState(false);
  const d = resumo.decisao;

  async function trocarOrcamento(campanhaId: string, antesCents: number, depoisCents: number, sucesso: string) {
    setSalvando(true);
    try {
      await apiClient.post(`/api/v1/ads/meta/campaigns/${campanhaId}/orcamento`, { antes_cents: antesCents, depois_cents: depoisCents });
      toast.success(sucesso);
      await queryClient.invalidateQueries({ queryKey: ["ads", "meta"] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Não foi possível mudar o orçamento. Tente de novo."));
    } finally {
      setSalvando(false);
    }
  }

  if (d.tipo === "sem_campanha") return null;

  const cadaReal = d.retorno === null ? null : centavos(Math.round(d.retorno * 100));
  const ultima = resumo.mudancas.find((m) => m.campanhaId === d.campanhaId && m.tipo === "orcamento");
  const podeDesfazer =
    d.tipo === "esperar" && ultima?.antesCents && ultima.depoisCents && ultima.depoisCents === d.orcamentoCents;

  let frase: string;
  let detalhe: string;
  if (d.tipo === "subir") {
    frase = `${t("Cada R$ 1 em anúncio voltou")} ${cadaReal} ${t("em vendas registradas. Dá para subir 20%.")}`;
    detalhe =
      d.orcamentoCents !== null && d.novoOrcamentoCents !== null
        ? `${t("Orçamento")}: ${dinheiro(d.orcamentoCents)} → ${dinheiro(d.novoOrcamentoCents)} ${t("por dia. A próxima subida só depois de 3 dias.")}`
        : t("O orçamento desta campanha está nos conjuntos de anúncios: suba 20% pelo Gerenciador.");
  } else if (d.tipo === "pausar") {
    frase = `${t("Gastou")} ${dinheiro(d.gastoCents)} ${t("e as vendas registradas não pagam o anúncio.")}`;
    detalhe = `${d.compradores} ${t(d.compradores === 1 ? "venda" : "vendas")} · ${dinheiro(d.receitaCents)}. ${t("Pausar estanca o gasto; dá para reativar depois.")}`;
  } else if (d.tipo === "esperar") {
    frase = `${t("O orçamento mudou em")} ${ultima ? dia(ultima.quando) : "—"}. ${t("A Meta está reaprendendo: espere para ler o resultado.")}`;
    detalhe = `${t("Leitura justa a partir de")} ${d.lerEm ? dia(d.lerEm) : "—"}.`;
  } else if (d.veredito === "pouco_dado" || d.retorno === null) {
    frase = t("Ainda tem pouco dado para decidir. Mantenha como está.");
    detalhe = `${t("Gasto no período")}: ${dinheiro(d.gastoCents)}.`;
  } else {
    frase = `${t("Cada R$ 1 em anúncio voltou")} ${cadaReal}. ${t("Mantenha como está.")}`;
    detalhe = t("Para subir: 3 vendas no período e cada R$ 1 voltando R$ 2,50 ou mais.");
  }

  return (
    <section
      aria-labelledby="decisao-do-dia"
      className="flex flex-wrap items-center justify-between gap-5 rounded-xl border border-accent/30 bg-accent-soft p-5"
      data-testid="decisao-do-dia"
    >
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-1.5">
        <p id="decisao-do-dia" className="text-xs font-bold uppercase tracking-wider text-accent">
          {t("Decisão do dia")} · {d.campanha}
        </p>
        <p className="text-xl font-bold leading-snug text-pretty">{frase}</p>
        <p className="text-sm text-muted-foreground">{detalhe}</p>
      </div>
      {podeGerenciar && (
        <div className="flex min-w-[220px] flex-col gap-2">
          {d.tipo === "subir" && d.campanhaId && d.orcamentoCents !== null && d.novoOrcamentoCents !== null && (
            <Button
              size="lg"
              disabled={salvando}
              data-testid="subir-orcamento"
              onClick={() => void trocarOrcamento(d.campanhaId as string, d.orcamentoCents as number, d.novoOrcamentoCents as number, t("Orçamento subiu."))}
            >
              {salvando ? t("Subindo…") : `${t("Subir para")} ${dinheiro(d.novoOrcamentoCents)}/${t("dia")}`}
            </Button>
          )}
          {d.tipo === "pausar" && d.campanhaId && (
            <Button size="lg" variant="outline" disabled={pausando} onClick={() => onPausar(d.campanhaId as string)}>
              {pausando ? t("Pausando…") : t("Pausar campanha")}
            </Button>
          )}
          {podeDesfazer && d.campanhaId && ultima && (
            <Button
              variant="outline"
              disabled={salvando}
              data-testid="desfazer-orcamento"
              onClick={() =>
                void trocarOrcamento(d.campanhaId as string, ultima.depoisCents as number, ultima.antesCents as number, t("Orçamento voltou ao que era."))
              }
            >
              {salvando ? t("Desfazendo…") : `${t("Desfazer")} (${t("voltar para")} ${dinheiro(ultima.antesCents as number)})`}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pode escalar?
// ─────────────────────────────────────────────────────────────────────────────

type Tom = "ok" | "atencao" | "neutro";
const PONTO: Record<Tom, string> = { ok: "bg-success", atencao: "bg-warning", neutro: "bg-muted-foreground" };

export function PodeEscalar({ resumo, alertaDaConta }: { resumo: ResumoResposta; alertaDaConta: string | undefined }) {
  const t = useT();
  const tag = useTagDeIdioma();
  const { capacidade, pixel } = resumo;

  const sinais: { titulo: string; texto: string; tom: Tom }[] = [];

  sinais.push(
    alertaDaConta
      ? { titulo: t("Conta de anúncios"), texto: t(alertaDaConta), tom: "atencao" }
      : resumo.alertas.length > 0
        ? { titulo: t("Conta de anúncios"), texto: `${resumo.alertas.length} ${t("campanhas pedem atenção (veja o aviso acima).")}`, tom: "atencao" }
        : { titulo: t("Conta de anúncios"), texto: t("Sem pendência na Meta."), tom: "ok" },
  );

  if (!capacidade) {
    sinais.push({ titulo: t("Números de WhatsApp"), texto: t("Nenhum número com agente publicado."), tom: "atencao" });
  } else {
    const plural = capacidade.numeros === 1 ? t("número") : t("números");
    const carga =
      capacidade.orcamento === null
        ? `${capacidade.leadsHoje} ${t("conversas novas hoje, sem teto definido.")}`
        : `${capacidade.leadsHoje} ${t("de")} ${capacidade.orcamento} ${t("conversas novas hoje.")}`;
    const cheio = capacidade.cheios > 0;
    sinais.push({
      titulo: `${capacidade.numeros} ${plural}`,
      texto: cheio ? `${carga} ${capacidade.cheios} ${t("já no limite: subir verba agora vira fila.")}` : carga,
      tom: cheio ? "atencao" : "ok",
    });
  }

  if (!pixel || pixel.length === 0) {
    sinais.push({ titulo: t("Pixel"), texto: t("Sem nota de correspondência (sem eventos de site ou sem conexão de envio)."), tom: "neutro" });
  } else {
    const NOME: Record<string, string> = { Purchase: t("Compra"), Lead: t("Lead"), Contact: t("Contato"), InitiateCheckout: t("Checkout") };
    const pior = Math.min(...pixel.map((p) => p.nota));
    sinais.push({
      titulo: t("Pixel"),
      texto: pixel.map((p) => `${NOME[p.evento] ?? p.evento} ${p.nota.toLocaleString(tag, { maximumFractionDigits: 1 })}`).join(" · "),
      tom: pior >= 6 ? "ok" : "atencao",
    });
  }

  return (
    <section aria-labelledby="pode-escalar" className="flex flex-col gap-3 rounded-xl border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pode-escalar" className="text-base font-bold">{t("Pode escalar?")}</h2>
        <span className="text-sm text-muted-foreground">{t("O atendimento aguenta mais conversas?")}</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {sinais.map((s) => (
          <li key={s.titulo} className="flex items-start gap-2.5 rounded-lg bg-surface-elevated p-3">
            <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${PONTO[s.tom]}`} />
            <div className="min-w-0 text-sm">
              <p className="font-bold">{s.titulo}</p>
              <p className="text-muted-foreground">{s.texto}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Funil por anúncio, até o Pix
// ─────────────────────────────────────────────────────────────────────────────

const SELO: Record<Veredito, { texto: string; classe: string }> = {
  escalar: { texto: "Escalar", classe: "bg-success-bg text-success-fg" },
  segurar: { texto: "Segurar", classe: "bg-surface-elevated text-text" },
  cortar: { texto: "Cortar", classe: "bg-error-bg text-error-fg" },
  pouco_dado: { texto: "Pouco dado", classe: "bg-surface-elevated text-muted-foreground" },
};

export function FunilPorAnuncio({ resumo, moeda }: { resumo: ResumoResposta; moeda: string }) {
  const t = useT();
  const { dinheiro, centavos } = useFormatos(moeda);
  const miniaturas = new Map(resumo.campeoes.map((c) => [c.adId, c.miniatura]));
  if (resumo.anuncios.length === 0) return null;

  const pct = (parte: number, todo: number) => `${todo > 0 ? Math.min(100, Math.round((parte / todo) * 100)) : 0}%`;

  return (
    <section aria-labelledby="funil-por-anuncio" className="flex flex-col gap-3 rounded-xl border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="funil-por-anuncio" className="text-base font-bold">{t("Cada anúncio, até o Pix")}</h2>
        <span className="text-sm text-muted-foreground">{t("Onde cada anúncio perde gente")}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-2 font-normal">{t("Anúncio")}</th>
              <th className="px-2 py-2 text-right font-normal">{t("Gasto")}</th>
              <th className="w-[38%] px-2 py-2 font-normal">{t("Conversa → preço → Pix")}</th>
              <th className="px-2 py-2 text-right font-normal">{t("Cada R$ 1")}</th>
              <th className="px-2 py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {resumo.anuncios.map((a) => {
              const v = vereditoDaCampanha(a, moeda);
              const miniatura = miniaturas.get(a.adId);
              return (
                <tr key={a.adId} className="border-t">
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2.5">
                      {miniatura ? (
                        // Miniatura servida pela plataforma; `next/image` exigiria liberar o domínio dela.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={miniatura} alt="" className="size-9 shrink-0 rounded-md object-cover" />
                      ) : null}
                      <span className="font-bold">{a.nome ?? a.adId}</span>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right font-mono tabular-nums">{dinheiro(a.gastoCents)}</td>
                  <td className="px-2 py-3">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex h-2 overflow-hidden rounded-sm bg-surface-elevated" aria-hidden>
                        <div className="bg-accent/40" style={{ width: pct(Math.max(0, a.ouviramPreco - a.compradores), a.conversas) }} />
                        <div className="bg-accent" style={{ width: pct(a.compradores, a.conversas) }} />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {a.conversas} {t("conversas")} · {a.ouviramPreco} {t("ouviram o preço")} · {a.compradores} {t("pagaram")}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right font-mono font-semibold tabular-nums">
                    {moeda === "BRL" && a.retorno !== null ? centavos(Math.round(a.retorno * 100)) : "—"}
                  </td>
                  <td className="px-2 py-3 text-right">
                    {v && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${SELO[v].classe}`}>{t(SELO[v].texto)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O que mudou
// ─────────────────────────────────────────────────────────────────────────────

export function LinhaDoTempo({ resumo, moeda }: { resumo: ResumoResposta; moeda: string }) {
  const t = useT();
  const { dinheiro, dia } = useFormatos(moeda);
  if (resumo.mudancas.length === 0) return null;
  const nome = new Map(resumo.rodando.map((c) => [c.id, c.nome]));

  return (
    <section aria-labelledby="linha-do-tempo" className="flex flex-col gap-3 rounded-xl border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="linha-do-tempo" className="text-base font-bold">{t("O que mudou")}</h2>
        <span className="text-sm text-muted-foreground">{t("Mudanças feitas por aqui nos últimos 14 dias")}</span>
      </div>
      <ol className="flex flex-col">
        {resumo.mudancas.map((m) => (
          <li key={`${m.campanhaId}-${m.quando}`} className="grid grid-cols-[72px_1fr] gap-4 border-t py-2.5 text-sm">
            <span className="font-mono text-muted-foreground">{dia(m.quando)}</span>
            <span>
              <span className="font-bold">{nome.get(m.campanhaId) ?? m.campanhaId}</span>{" "}
              {m.tipo === "orcamento" && m.antesCents && m.depoisCents
                ? `· ${t("orçamento")} ${dinheiro(m.antesCents)} → ${dinheiro(m.depoisCents)}`
                : `· ${m.status === "PAUSED" ? t("pausada") : t("reativada")}`}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
