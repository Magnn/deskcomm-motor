"use client";
/**
 * A aba "Consciência": quem é esta pessoa e o quanto ela já entende do próprio problema, antes de o
 * agente tentar vender qualquer coisa.
 *
 * Sexta das abas ESTRUTURADAS da configuração do agente. O NÍVEL é vocabulário fechado (Eugene
 * Schwartz, "5 níveis de consciência" — framework de copywriting conhecido, não vocabulário de
 * nicho); desejo/dor, medo oculto e promessa são texto livre do dono, porque isso muda de negócio
 * para negócio. O sistema compila os quatro campos num bloco que entra logo depois da Oferta na
 * fila do prompt do turno, e a coluna da direita mostra esse bloco tal como ele vai.
 *
 * O medo oculto é DIFERENTE de uma objeção: objeção é o que a pessoa FALA ("está caro"); o medo
 * oculto é o que ela raramente diz com todas as letras. Objeções ditas têm aba própria.
 *
 * A configuração mora em `ai_agents.config.consciencia` e vale no PRÓXIMO turno, sem publicar
 * versão. Por isso só admin salva.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PreviaDoBloco } from "@/components/ai/PreviaDoBloco";
import { BriefsDeAnuncioDoAgente } from "./BriefsDeAnuncioDoAgente";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { blocoDeConsciencia } from "@/lib/consciencia/bloco-do-prompt";
import {
  DESCRICAO_DO_NIVEL,
  NIVEIS_DE_CONSCIENCIA,
  conscienciaSchema,
  type ConscienciaConfig,
  type NivelDeConsciencia,
} from "@/lib/consciencia/tipos";

interface Props {
  agentId: string;
  /** `ai_agents.config` como veio do banco. */
  config: Record<string, unknown> | null | undefined;
  readOnly?: boolean;
}

interface Formulario {
  enabled: boolean;
  nivel: NivelDeConsciencia | null;
  desejoOuDor: string;
  medoOculto: string;
  promessa: string;
}

const VAZIO: Formulario = { enabled: false, nivel: null, desejoOuDor: "", medoOculto: "", promessa: "" };

function formularioInicial(config: Props["config"]): Formulario {
  // Aqui o `enabled: false` também vale: a tela mostra o que o dono já preencheu mesmo desligada.
  const bruto = (config as { consciencia?: unknown } | null | undefined)?.consciencia;
  const r = conscienciaSchema.safeParse(bruto);
  if (!r.success) return VAZIO;
  return {
    enabled: r.data.enabled,
    nivel: r.data.nivel ?? null,
    desejoOuDor: r.data.desejo_ou_dor ?? "",
    medoOculto: r.data.medo_oculto ?? "",
    promessa: r.data.promessa ?? "",
  };
}

/** O que o servidor recebe: o resultado passa no MESMO schema do servidor, e o motivo da recusa volta legível. */
export function paraCorpo(f: Formulario): { corpo: ConscienciaConfig } | { erro: string } {
  const r = conscienciaSchema.safeParse({
    enabled: f.enabled,
    ...(f.nivel !== null ? { nivel: f.nivel } : {}),
    ...(f.desejoOuDor.trim() !== "" ? { desejo_ou_dor: f.desejoOuDor } : {}),
    ...(f.medoOculto.trim() !== "" ? { medo_oculto: f.medoOculto } : {}),
    ...(f.promessa.trim() !== "" ? { promessa: f.promessa } : {}),
  });
  if (!r.success) return { erro: r.error.issues[0]?.message ?? "Confira os campos." };
  return { corpo: r.data };
}

export function ConscienciaDoAgente({ agentId, config, readOnly }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = React.useState<Formulario>(() => formularioInicial(config));
  const [salvando, setSalvando] = React.useState(false);
  const patch = (p: Partial<Formulario>) => setForm((f) => ({ ...f, ...p }));

  // A prévia é o bloco REAL: a mesma função que o turno usa, sobre os mesmos campos, com o interruptor
  // ligado (desligada, a pessoa ainda vê o que passaria a valer).
  const previa = React.useMemo(() => {
    const r = paraCorpo({ ...form, enabled: true });
    return "corpo" in r ? blocoDeConsciencia(r.corpo).trim() : "";
  }, [form]);

  const salvar = async () => {
    const r = paraCorpo(form);
    if ("erro" in r) {
      toast.error(t(r.erro));
      return;
    }
    setSalvando(true);
    try {
      await apiClient.put(`/api/v1/ai/agents/${agentId}/consciencia`, r.corpo);
      await qc.invalidateQueries({ queryKey: ["ai", "agents"] });
      toast.success(
        form.enabled
          ? t("Consciência do lead salva. Vale a partir da próxima conversa.")
          : t("Consciência do lead desligada. O agente volta a usar só as instruções dele."),
      );
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]" data-testid="consciencia-do-agente">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-medium">{t("Consciência do lead")}</h2>
              <p className="max-w-2xl text-sm text-text-muted">
                {t(
                  "Diga quem costuma chegar até este agente e o quanto essa pessoa já entende do próprio problema. Isso calibra COMO conduzir a conversa até a oferta — a mesma oferta soa diferente para quem ainda nem percebeu o problema e para quem já está comparando. Vale a partir da próxima conversa, sem publicar versão.",
                )}
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
              disabled={readOnly}
              aria-label={t("Usar esta consciência do lead")}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1.5">
            <span id="consciencia-nivel-rotulo" className="text-sm font-medium text-text">
              {t("Nível de consciência mais comum")}
            </span>
            <p className="text-xs text-text-muted">
              {t("Escolha o que descreve melhor quem costuma chegar até este agente.")}
            </p>
            <div role="radiogroup" aria-labelledby="consciencia-nivel-rotulo" className="grid gap-2">
              {NIVEIS_DE_CONSCIENCIA.map((nivel) => {
                const ativo = form.nivel === nivel;
                return (
                  <button
                    key={nivel}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    disabled={readOnly}
                    onClick={() => patch({ nivel: ativo ? null : nivel })}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      ativo
                        ? "border-accent-500 bg-accent-soft ring-1 ring-accent-500"
                        : "border-border bg-surface hover:bg-surface-elevated",
                    )}
                  >
                    <span className={cn("text-sm font-medium", ativo ? "text-accent" : "text-text")}>
                      {t(DESCRICAO_DO_NIVEL[nivel].rotulo)}
                    </span>
                    <span className="text-xs text-text-muted">{t(DESCRICAO_DO_NIVEL[nivel].tela)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-4">
          <h3 className="text-sm font-medium">{t("O que move esta pessoa")}</h3>
          <div className="flex flex-col gap-1">
            <Label htmlFor="consciencia-desejo">{t("O que ela mais quer resolver ou conquistar")}</Label>
            <Textarea
              id="consciencia-desejo"
              rows={2}
              maxLength={300}
              placeholder={t("Nas palavras do seu negócio — não existe lista pronta aqui.")}
              value={form.desejoOuDor}
              onChange={(e) => patch({ desejoOuDor: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="consciencia-medo">{t("O medo de fundo, raramente dito em voz alta")}</Label>
            <Textarea
              id="consciencia-medo"
              rows={2}
              maxLength={300}
              placeholder={t("Diferente de uma objeção: é o que ela não chega a falar.")}
              value={form.medoOculto}
              onChange={(e) => patch({ medoOculto: e.target.value })}
              disabled={readOnly}
            />
            <p className="text-xs text-text-muted">
              {t("O agente reconhece isso com delicadeza; nunca nomeia de forma crua nem repete de volta à pessoa.")}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="consciencia-promessa">{t("A promessa central desta oferta")}</Label>
            <Textarea
              id="consciencia-promessa"
              rows={2}
              maxLength={300}
              placeholder={t("O que faz a sua oferta ser diferente do resto.")}
              value={form.promessa}
              onChange={(e) => patch({ promessa: e.target.value })}
              disabled={readOnly}
            />
          </div>
        </Card>

        {!readOnly ? (
          <div className="flex justify-end">
            <Button type="button" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? t("Salvando…") : t("Salvar consciência do lead")}
            </Button>
          </div>
        ) : null}

        <BriefsDeAnuncioDoAgente agentId={agentId} readOnly={readOnly} />
      </div>

      <PreviaDoBloco texto={previa} ligada={form.enabled} testId="previa-da-consciencia" />
    </div>
  );
}
