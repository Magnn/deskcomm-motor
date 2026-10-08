"use client";
/**
 * "Ritmo de resposta": quanto o agente leva para "digitar" cada mensagem.
 *
 * Existe porque resposta longa que chega inteira em dois segundos denuncia a automação — e
 * porque mais devagar custa tempo de atendimento. Quem decide o ponto é o dono do negócio.
 *
 * A configuração mora em `ai_agents.config.ritmo` e vale no PRÓXIMO turno, sem publicar.
 */
import * as React from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { PAUSA_ENTRE_BOLHAS, PISO_ENTRE_BOLHAS_MS, RITMOS, lerRitmo, type Ritmo } from "@/lib/ritmo/tipos";

interface Props {
  agentId: string;
  /** `ai_agents.config` como veio do banco. */
  config: Record<string, unknown> | null | undefined;
  readOnly?: boolean;
}

/** O exemplo que a tela mostra: uma mensagem de tamanho comum. */
const EXEMPLO_CARACTERES = 150;

/** Segundos entre duas mensagens de `EXEMPLO_CARACTERES`, sem a variação — o que a pessoa vê, em média. */
function segundosDoExemplo(ritmo: Ritmo): number {
  const p = PAUSA_ENTRE_BOLHAS[ritmo];
  const ms = p === null ? PISO_ENTRE_BOLHAS_MS + 400 : Math.min(p.maximoMs, p.baseMs + p.msPorCaractere * EXEMPLO_CARACTERES);
  return Math.round(ms / 1000);
}

export function RitmoDoAgente({ agentId, config, readOnly }: Props) {
  const t = useT();
  const [modo, setModo] = React.useState<Ritmo>(() => lerRitmo(config));
  const [salvando, setSalvando] = React.useState(false);

  const NOME: Record<Ritmo, string> = {
    rapido: t("Rápido"),
    natural: t("Natural"),
    calmo: t("Calmo"),
  };
  const DESCRICAO: Record<Ritmo, string> = {
    rapido: t("As mensagens seguintes saem uma atrás da outra. É como o agente sempre respondeu."),
    natural: t("Cada mensagem leva o tempo de ser digitada, com “digitando…” aparecendo entre elas."),
    calmo: t("Mais devagar ainda. Para atendimento em que pressa passa a impressão errada."),
  };

  async function escolher(novo: Ritmo): Promise<void> {
    if (novo === modo || salvando || readOnly) return;
    const anterior = modo;
    setModo(novo);
    setSalvando(true);
    try {
      await apiClient.put(`/api/v1/ai/agents/${agentId}/ritmo`, { modo: novo });
      toast.success(t("Ritmo salvo. Vale a partir da próxima resposta."));
    } catch (err) {
      setModo(anterior);
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card className="mt-4 flex flex-col gap-3 p-4" data-testid="ritmo-do-agente">
      <div>
        <h2 className="font-medium">{t("Ritmo de resposta")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Quanto o agente leva para “digitar”. Resposta longa que chega inteira em dois segundos parece automática; mais devagar parece gente, e cada atendimento demora um pouco mais.")}
        </p>
      </div>
      <div role="radiogroup" aria-label={t("Ritmo de resposta")} className="grid gap-2 md:grid-cols-3">
        {RITMOS.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={modo === r}
            disabled={readOnly || salvando}
            onClick={() => void escolher(r)}
            data-testid={`ritmo-${r}`}
            className={`flex flex-col gap-1 rounded-md border p-3 text-left text-sm transition-colors disabled:opacity-60 ${
              modo === r ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
            }`}
          >
            <span className="font-medium">{NOME[r]}</span>
            <span className="text-muted-foreground">{DESCRICAO[r]}</span>
            <span className="text-xs text-muted-foreground">
              {t("Entre duas mensagens de tamanho comum:")} {t("cerca de")} {segundosDoExemplo(r)} s
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("Vale a partir da próxima resposta, sem publicar. Áudios e fotos não mudam.")}
      </p>
    </Card>
  );
}
