"use client";
/**
 * A aba QUIZZES do painel da área do cliente (migration 0944), medida no nosso banco — sem depender do pixel:
 *  - AO VIVO: quem está com o quiz aberto agora, em que etapa, de onde, em que aparelho e de qual campanha;
 *  - quem parou no pagamento (com nome e e-mail: os leads mais quentes para recuperar);
 *  - de onde vêm as visitas, a que horas abrem e quanto tempo levam até a prévia;
 *  - o funil de cada quiz e o resultado por campanha (`utm_campaign` do anúncio).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { AoVivoDosQuizzes } from "@/lib/area-do-cliente/ao-vivo-dos-quizzes";
import type { CampanhaDoQuiz, FunilDeUmQuiz } from "@/lib/area-do-cliente/funil-dos-quizzes";
import type { PassoDoQuiz, QuizDaPagina } from "@/lib/area-do-cliente/passos-do-quiz";
import { copyToClipboard } from "@/lib/clipboard";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const duracao = (s: number) =>
  s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}min` : `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;

type AoVivo = AoVivoDosQuizzes & { dias: number; fuso: string };

export function AbaQuizzes() {
  const t = useT();
  const [dias, setDias] = useState(1);
  const q = useQuery({
    queryKey: ["area", "quizzes", dias],
    queryFn: () => apiClient.get<{ data: { dias: number; quizzes: FunilDeUmQuiz[]; campanhas: CampanhaDoQuiz[] } }>(`/api/v1/area/quizzes?dias=${dias}`),
    refetchInterval: 60_000,
  });
  const vivo = useQuery({
    queryKey: ["area", "quizzes", "ao-vivo", dias],
    queryFn: () => apiClient.get<{ data: AoVivo }>(`/api/v1/area/quizzes/ao-vivo?dias=${dias}`),
    refetchInterval: 10_000,
  });
  const d = q.data?.data;
  const nomeDoQuiz: Record<QuizDaPagina, string> = {
    sinastria: t("Vocês combinam? (sinastria)"),
    prosperidade: t("Número da prosperidade"),
    caminhos: t("O que abre os seus caminhos"),
  };
  const nomeDoPasso: Record<PassoDoQuiz, string> = {
    abriu: t("Abriu a página"),
    dados: t("Preencheu nome e data"),
    perguntas: t("Respondeu as perguntas"),
    email: t("Chegou ao e-mail"),
    previa: t("Viu a prévia"),
    pagar: t("Clicou em pagar"),
    cobranca: t("Recebeu o Pix ou o link do cartão"),
    pago: t("Pagou"),
    leitura: t("Viu a leitura"),
  };

  return (
    <div className="space-y-4 pt-2" data-testid="area-quizzes">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            [1, t("Últimas 24 h")],
            [7, t("7 dias")],
            [30, t("30 dias")],
          ] as const
        ).map(([n, rotulo]) => (
          <Button key={n} size="sm" variant={dias === n ? "default" : "outline"} onClick={() => setDias(n)}>
            {rotulo}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground">{t("Medido no nosso banco, sem o pixel. Cada pessoa conta uma vez por passo.")}</span>
      </div>

      <PainelAoVivo v={vivo.data?.data} carregando={vivo.isLoading} erro={vivo.isError} nomeDoQuiz={nomeDoQuiz} nomeDoPasso={nomeDoPasso} />

      {q.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : q.isError || !d ? (
        <Card className="p-6 text-sm text-error-fg">{t("Erro ao carregar o funil dos quizzes.")}</Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            {d.quizzes.map((z) => (
              <Card key={z.quiz} className="p-4" data-testid={`area-quiz-${z.quiz}`}>
                <h2 className="font-semibold">{nomeDoQuiz[z.quiz]}</h2>
                {z.funil[0]?.pessoas === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">{t("Ninguém abriu este quiz no período.")}</p>
                ) : (
                  <>
                    <ol className="mt-3 space-y-2">
                      {z.funil.map((e) => (
                        <li key={e.passo}>
                          <div className="flex justify-between gap-2 text-sm">
                            <span>{nomeDoPasso[e.passo]}</span>
                            <span className="shrink-0 tabular-nums">
                              {e.pessoas}
                              {e.doAnterior !== null ? <span className="ml-2 text-xs text-muted-foreground">{pct(e.doAnterior)}</span> : null}
                            </span>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-surface-elevated">
                            <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(2, Math.round(e.doTotal * 100))}%` }} />
                          </div>
                        </li>
                      ))}
                    </ol>
                    {z.maiorPerda ? (
                      <p className="mt-3 rounded-md bg-warning-bg p-2 text-xs text-warning-fg">
                        {t("Onde mais gente para:")} {nomeDoPasso[z.maiorPerda.de]} → {nomeDoPasso[z.maiorPerda.para]} ({z.maiorPerda.perdidos} {t("pessoas")})
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("No celular:")} {z.celular.abriu} {t("abriram")}, {z.celular.pago} {t("pagaram")}
                    </p>
                  </>
                )}
              </Card>
            ))}
          </div>

          <Card className="p-4" data-testid="area-quizzes-campanhas">
            <h2 className="font-semibold">{t("Por campanha")}</h2>
            {d.campanhas.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("Nenhuma visita no período.")}</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3 font-medium">{t("Campanha")}</th>
                      <th className="py-1 pr-3 font-medium">{t("Quiz")}</th>
                      <th className="py-1 pr-3 text-right font-medium">{t("Abriram")}</th>
                      <th className="py-1 pr-3 text-right font-medium">{t("Prévia")}</th>
                      <th className="py-1 pr-3 text-right font-medium">{t("Foram pagar")}</th>
                      <th className="py-1 text-right font-medium">{t("Pagaram")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.campanhas.map((c) => (
                      <tr key={`${c.quiz}|${c.campanha}`} className="border-t border-border">
                        <td className="py-1.5 pr-3 font-mono text-xs">{c.campanha}</td>
                        <td className="py-1.5 pr-3">{nomeDoQuiz[c.quiz]}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{c.abriu}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{c.previa}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{c.cobranca}</td>
                        <td className="py-1.5 text-right tabular-nums">{c.pago}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function PainelAoVivo(props: {
  v: AoVivo | undefined;
  carregando: boolean;
  erro: boolean;
  nomeDoQuiz: Record<QuizDaPagina, string>;
  nomeDoPasso: Record<PassoDoQuiz, string>;
}) {
  const t = useT();
  const tag = useTagDeIdioma();
  const { v, nomeDoQuiz, nomeDoPasso } = props;
  if (props.carregando) return <Skeleton className="h-40 w-full" />;
  if (props.erro || !v) return <Card className="p-4 text-sm text-error-fg">{t("Erro ao carregar o painel ao vivo.")}</Card>;
  const picoHoras = Math.max(1, ...v.horas);
  const picoRegiao = Math.max(1, ...v.regioes.map((r) => r.visitas));
  return (
    <div className="grid gap-4 xl:grid-cols-3" data-testid="area-quizzes-ao-vivo">
      <Card className="p-4 xl:col-span-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {v.agora > 0 ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-fg opacity-60" /> : null}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${v.agora > 0 ? "bg-success-fg" : "bg-muted-foreground"}`} />
          </span>
          <h2 className="font-semibold">
            {t("Agora na página:")} <span className="tabular-nums">{v.agora}</span>
          </h2>
        </div>
        {v.visitas.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("Ninguém com o quiz aberto neste minuto.")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">{t("Quiz")}</th>
                  <th className="py-1 pr-3 font-medium">{t("Etapa")}</th>
                  <th className="py-1 pr-3 font-medium">{t("Região")}</th>
                  <th className="py-1 pr-3 font-medium">{t("Aparelho")}</th>
                  <th className="py-1 pr-3 font-medium">{t("Campanha")}</th>
                  <th className="py-1 pr-3 font-medium">{t("Na página há")}</th>
                  <th className="py-1 font-medium">{t("Quem")}</th>
                </tr>
              </thead>
              <tbody>
                {v.visitas.map((x, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5 pr-3">{nomeDoQuiz[x.quiz]}</td>
                    <td className="py-1.5 pr-3">{nomeDoPasso[x.passo]}</td>
                    <td className="py-1.5 pr-3">{x.regiao ?? "—"}</td>
                    <td className="py-1.5 pr-3">{x.celular === null ? "—" : x.celular ? t("Celular") : t("Computador")}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs">{x.campanha ?? "—"}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{duracao(x.naPaginaHaS)}</td>
                    <td className="py-1.5">
                      {x.pessoa ? (
                        [x.pessoa.nome, x.pessoa.email].filter(Boolean).join(" · ")
                      ) : (
                        <span className="text-muted-foreground">{t("anônimo")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {t("Atualiza a cada 10 s. Nome e e-mail aparecem a partir do pedido de pagamento; a região vem do fuso do aparelho.")}
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold">{t("Ritmo")}</h2>
        <p className="mt-2 text-sm">
          {t("Tempo até a prévia (mediana):")}{" "}
          <span className="font-semibold tabular-nums">{v.minutosAtePrevia === null ? "—" : `${String(v.minutosAtePrevia).replace(".", ",")} min`}</span>
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          {t("Aberturas por hora")} ({v.fuso})
        </p>
        <div className="mt-1 flex h-20 items-end gap-0.5" data-testid="area-quizzes-horas">
          {v.horas.map((n, h) => (
            <div
              key={h}
              className="flex-1 rounded-t bg-accent"
              style={{ height: `${Math.max(2, Math.round((n / picoHoras) * 100))}%`, opacity: n === 0 ? 0.25 : 1 }}
              title={`${h}h: ${n}`}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>0h</span>
          <span>6h</span>
          <span>12h</span>
          <span>18h</span>
          <span>23h</span>
        </div>
      </Card>

      <Card className="p-4 xl:col-span-2" data-testid="area-quizzes-parados">
        <h2 className="font-semibold">{t("Pararam no pagamento")}</h2>
        <p className="text-xs text-muted-foreground">{t("Pediram o Pix ou abriram o cartão e não pagaram. São os leads mais quentes para recuperar.")}</p>
        {v.parados.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("Ninguém parado no pagamento no período.")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">{t("Nome")}</th>
                  <th className="py-1 pr-3 font-medium">{t("E-mail")}</th>
                  <th className="py-1 pr-3 font-medium">{t("Quiz")}</th>
                  <th className="py-1 pr-3 font-medium">{t("Região")}</th>
                  <th className="py-1 pr-3 font-medium">{t("Campanha")}</th>
                  <th className="py-1 font-medium">{t("Visto por último")}</th>
                </tr>
              </thead>
              <tbody>
                {v.parados.map((x) => (
                  <tr key={`${x.contactId}|${x.quiz}`} className="border-t border-border">
                    <td className="py-1.5 pr-3">{x.nome ?? "—"}</td>
                    <td className="py-1.5 pr-3">
                      {x.email ? (
                        <button className="underline underline-offset-2" onClick={() => void copyToClipboard(x.email!)} title={t("Copiar")}>
                          {x.email}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1.5 pr-3">{nomeDoQuiz[x.quiz]}</td>
                    <td className="py-1.5 pr-3">{x.regiao ?? "—"}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs">{x.campanha ?? "—"}</td>
                    <td className="py-1.5 tabular-nums">
                      {new Date(x.vistoEm).toLocaleString(tag, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold">{t("De onde vêm")}</h2>
        {v.regioes.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("Nenhuma visita no período.")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {v.regioes.slice(0, 12).map((r) => (
              <li key={r.regiao}>
                <div className="flex justify-between gap-2 text-sm">
                  <span>{r.regiao}</span>
                  <span className="shrink-0 tabular-nums">
                    {r.visitas}
                    {r.pagaram > 0 ? (
                      <span className="ml-2 text-xs text-success-fg">
                        {r.pagaram} {t("pagaram")}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-surface-elevated">
                  <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(2, Math.round((r.visitas / picoRegiao) * 100))}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {v.truncado ? <p className="mt-2 text-xs text-warning-fg">{t("Período grande: contas feitas sobre as 1.000 visitas mais recentes.")}</p> : null}
      </Card>
    </div>
  );
}
