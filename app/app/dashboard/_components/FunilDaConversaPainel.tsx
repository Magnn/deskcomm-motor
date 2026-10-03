"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useT } from "@/hooks/i18n/useT";

interface Resposta {
  funil: {
    etapas: { chave: string; total: number }[];
    paradas: { chave: string; total: number; conversas: string[] }[];
  };
  cortado: boolean;
}

const ROTULO_DA_ETAPA: Record<string, string> = {
  iniciadas: "Conversas iniciadas",
  atendidas: "Foram atendidas",
  com_oferta: "Receberam a oferta",
  compraram: "Compraram",
};

const ROTULO_DA_PARADA: Record<string, { titulo: string; explica: string }> = {
  sem_atendimento: { titulo: "Ficaram sem resposta", explica: "A pessoa escreveu e ninguém respondeu." },
  atendida_sem_oferta: { titulo: "Atendidas, sem oferta", explica: "Houve conversa, mas o preço ou o link de pagamento nunca foi enviado." },
  oferta_sem_resposta: { titulo: "Oferta → silêncio", explica: "Receberam a oferta e não escreveram mais nada." },
  objecao_sem_compra: { titulo: "Objeção → não compraram", explica: "Reclamaram do valor ou levantaram uma objeção cadastrada, e não compraram." },
  conversou_e_nao_comprou: { titulo: "Conversaram depois da oferta e não compraram", explica: "Seguiram falando depois da oferta, sem objeção reconhecida e sem compra." },
};

/**
 * O funil da conversa e onde ela para — na aba Receita, logo abaixo do dinheiro.
 * Cada parada abre a lista das conversas, com link para o atendimento: número
 * que não leva à conversa não ajuda ninguém a consertar nada.
 */
export function FunilDaConversaPainel({ period }: { period: string }) {
  const t = useT();
  const [aberta, setAberta] = useState<string | null>(null);
  const consulta = useQuery({
    queryKey: ["resultado-funil", period],
    queryFn: async (): Promise<Resposta> => {
      const r = await fetch(`/api/v1/resultado/funil?period=${encodeURIComponent(period)}`);
      const corpo = await r.json().catch(() => null);
      if (!r.ok) throw new Error("falha");
      return (corpo?.data ?? corpo) as Resposta;
    },
    retry: false,
  });

  if (consulta.isPending) return <p className="text-sm text-muted-foreground">{t("Montando o funil da conversa…")}</p>;
  if (consulta.isError || !consulta.data) {
    return <p role="alert" className="text-sm text-destructive">{t("Não foi possível montar o funil da conversa.")}</p>;
  }

  const { etapas, paradas } = consulta.data.funil;
  const total = etapas[0]?.total ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="painel-funil">
      <div className="rounded-2xl border bg-card p-4">
        <h3 className="text-sm font-semibold">{t("Funil da conversa")}</h3>
        <p className="mb-3 text-xs text-muted-foreground">{t("Das conversas que começaram no período, até onde cada uma chegou.")}</p>
        <ul className="space-y-2">
          {etapas.map((e) => (
            <li key={e.chave} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span>{t(ROTULO_DA_ETAPA[e.chave] ?? e.chave)}</span>
                <span className="font-medium tabular-nums">
                  {e.total}
                  {total > 0 && e.chave !== "iniciadas" ? <span className="ml-1 text-xs font-normal text-muted-foreground">({Math.round((e.total / total) * 100)}%)</span> : null}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${total > 0 ? Math.max(2, (e.total / total) * 100) : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <h3 className="text-sm font-semibold">{t("Onde a conversa para")}</h3>
        <p className="mb-3 text-xs text-muted-foreground">{t("Cada conversa que não comprou, na casa mais avançada a que chegou. Clique para ver as conversas.")}</p>
        <ul className="space-y-2">
          {paradas.map((p) => {
            const rotulo = ROTULO_DA_PARADA[p.chave];
            const estaAberta = aberta === p.chave;
            return (
              <li key={p.chave} className="rounded-lg border p-2">
                <button
                  type="button"
                  className="flex w-full items-baseline justify-between gap-2 text-left text-sm disabled:opacity-60"
                  disabled={p.total === 0}
                  aria-expanded={estaAberta}
                  onClick={() => setAberta(estaAberta ? null : p.chave)}
                  data-testid={`parada-${p.chave}`}
                >
                  <span>
                    <span className="font-medium">{t(rotulo?.titulo ?? p.chave)}</span>
                    <span className="block text-xs text-muted-foreground">{t(rotulo?.explica ?? "")}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{p.total}</span>
                </button>
                {estaAberta && (
                  <ul className="mt-2 flex flex-wrap gap-2 border-t pt-2">
                    {p.conversas.map((id, i) => (
                      <li key={id}>
                        <Link href={`/app/inbox?id=${id}`} className="text-xs underline underline-offset-4">
                          {t("Conversa")} {i + 1}
                        </Link>
                      </li>
                    ))}
                    {p.total > p.conversas.length && (
                      <li className="text-xs text-muted-foreground">
                        +{p.total - p.conversas.length} {t("não listadas")}
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {consulta.data.cortado && (
        <p className="text-xs text-muted-foreground lg:col-span-2">{t("O período tem mais conversas do que a tela soma de uma vez: escolha um período menor para ver tudo.")}</p>
      )}
      <p className="text-xs text-muted-foreground lg:col-span-2">
        {t("A oferta e a objeção são reconhecidas por regra (preço ou link de pagamento enviado; reclamação de valor ou frase da aba Objeções) e entram alguns minutos depois da mensagem.")}
      </p>
    </div>
  );
}
