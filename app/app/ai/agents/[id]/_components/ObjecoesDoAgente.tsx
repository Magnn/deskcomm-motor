"use client";
/**
 * A aba "Objeções": o que a pessoa costuma dizer para não fechar ("tá caro", "vou pensar", "preciso falar
 * com outra pessoa") e a resposta que o dono aprovou para cada uma.
 *
 * Terceira das abas ESTRUTURADAS da configuração do agente. Objeção é o momento em que o agente mais
 * improvisa, e é ali que ele inventa urgência, prova ou garantia. Aqui o dono escreve o SENTIDO da resposta
 * — o agente a diz com as próprias palavras —, e o sistema compila isso num bloco do turno. A coluna da
 * direita mostra esse bloco tal como ele vai.
 *
 * VALOR E DESCONTO não entram aqui, de propósito: a aba Preço é a única fonte deles, e o servidor recusa
 * valor em dinheiro na resposta.
 *
 * A configuração mora em `ai_agents.config.objections` e vale no PRÓXIMO turno, sem publicar versão. Por
 * isso só admin salva: quem edita o cadastro do agente não muda por aqui como ele responde a quem hesita.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PreviaDoBloco } from "@/components/ai/PreviaDoBloco";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { blocoDeObjecoes } from "@/lib/objecoes/bloco-do-prompt";
import {
  MAX_OBJECOES,
  MAX_QUANDO,
  MAX_RESPOSTA,
  SUGESTOES_DE_OBJECAO,
  objecoesSchema,
  type ObjecoesConfig,
} from "@/lib/objecoes/tipos";

interface Props {
  agentId: string;
  /** `ai_agents.config` como veio do banco. */
  config: Record<string, unknown> | null | undefined;
  readOnly?: boolean;
}

interface ObjecaoNaTela {
  quando: string;
  resposta: string;
}

interface Formulario {
  enabled: boolean;
  objecoes: ObjecaoNaTela[];
}

const VAZIO: Formulario = { enabled: false, objecoes: [] };

function formularioInicial(config: Props["config"]): Formulario {
  // Aqui o `enabled: false` também vale: a tela mostra o que o dono já preencheu mesmo desligada.
  const bruto = (config as { objections?: unknown } | null | undefined)?.objections;
  const r = objecoesSchema.safeParse(bruto);
  if (!r.success) return VAZIO;
  return { enabled: r.data.enabled, objecoes: r.data.objecoes.map((o) => ({ quando: o.quando, resposta: o.resposta })) };
}

/** O que o servidor recebe: o resultado passa no MESMO schema do servidor, e o motivo da recusa volta legível. */
export function paraCorpo(f: Formulario): { corpo: ObjecoesConfig } | { erro: string } {
  if (f.objecoes.some((o) => o.quando.trim() === "" || o.resposta.trim() === "")) {
    return { erro: "Preencha a frase e a resposta de cada objeção." };
  }
  const candidato = {
    enabled: f.enabled,
    objecoes: f.objecoes.map((o) => ({ quando: o.quando.trim(), resposta: o.resposta.trim() })),
  };
  const r = objecoesSchema.safeParse(candidato);
  if (!r.success) return { erro: r.error.issues[0]?.message ?? "Confira os campos." };
  return { corpo: r.data };
}

export function ObjecoesDoAgente({ agentId, config, readOnly }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = React.useState<Formulario>(() => formularioInicial(config));
  const [salvando, setSalvando] = React.useState(false);
  const patch = (p: Partial<Formulario>) => setForm((f) => ({ ...f, ...p }));
  const mudaObjecao = (i: number, p: Partial<ObjecaoNaTela>) =>
    setForm((f) => ({ ...f, objecoes: f.objecoes.map((x, j) => (j === i ? { ...x, ...p } : x)) }));

  const cheia = form.objecoes.length >= MAX_OBJECOES;
  // A sugestão entra na língua da tela (`t(frase)`); já ter uma objeção com a frase, em qualquer das duas
  // línguas, esconde o atalho.
  const jaTem = (frase: string) =>
    form.objecoes.some((o) => [frase, t(frase)].some((f) => f.toLowerCase() === o.quando.trim().toLowerCase()));
  const haSugestaoLivre = Object.values(SUGESTOES_DE_OBJECAO).some((frase) => !jaTem(frase));

  // A prévia é o bloco REAL: a mesma função que o turno usa, sobre os mesmos campos, com o interruptor
  // ligado (desligada, a pessoa ainda vê o que passaria a valer). Objeção pela metade ainda não entra.
  const previa = React.useMemo(() => {
    const completas = form.objecoes.filter((o) => o.quando.trim() !== "" && o.resposta.trim() !== "");
    const r = paraCorpo({ enabled: true, objecoes: completas });
    return "corpo" in r ? blocoDeObjecoes(r.corpo).trim() : "";
  }, [form]);

  const salvar = async () => {
    const r = paraCorpo(form);
    if ("erro" in r) {
      toast.error(t(r.erro));
      return;
    }
    setSalvando(true);
    try {
      await apiClient.put(`/api/v1/ai/agents/${agentId}/objecoes`, r.corpo);
      await qc.invalidateQueries({ queryKey: ["ai", "agents"] });
      toast.success(
        form.enabled
          ? t("Objeções salvas. Valem a partir da próxima conversa.")
          : t("Objeções desligadas. O agente volta a usar só as instruções dele."),
      );
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]" data-testid="objecoes-do-agente">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-medium">{t("Objeções")}</h2>
              <p className="max-w-2xl text-sm text-text-muted">
                {t(
                  "Escreva o que as pessoas costumam dizer para não fechar e como você quer que o agente responda. Ele usa a sua resposta como base, com as próprias palavras. Valor e desconto não vão aqui: vêm da aba Preço. Vale a partir da próxima conversa, sem publicar versão.",
                )}
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
              disabled={readOnly}
              aria-label={t("Usar estas objeções")}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">{t("Objeções e respostas")}</h3>
            <p className="text-xs text-text-muted">
              {t("Uma por cartão. Escreva a frase do jeito que a pessoa diz e o sentido da resposta que você aprova.")}
            </p>
          </div>

          {!readOnly && haSugestaoLivre && !cheia ? (
            <div className="flex flex-col gap-2" data-testid="sugestoes-de-objecao">
              <span className="text-xs text-text-muted">{t("Atalhos para as objeções mais comuns:")}</span>
              <div className="flex flex-wrap gap-2">
                {Object.entries(SUGESTOES_DE_OBJECAO).map(([chave, frase]) =>
                  jaTem(frase) ? null : (
                    <Button
                      key={chave}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => patch({ objecoes: [...form.objecoes, { quando: t(frase), resposta: "" }] })}
                    >
                      {t(frase)}
                    </Button>
                  ),
                )}
              </div>
            </div>
          ) : null}

          {form.objecoes.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-text-muted">
              {t("Nenhuma objeção ainda. Comece por um atalho acima ou adicione a sua.")}
            </p>
          ) : null}

          {form.objecoes.map((o, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3" data-testid={`objecao-${i}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-text">{`${t("Objeção")} ${i + 1}`}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={readOnly}
                  onClick={() => patch({ objecoes: form.objecoes.filter((_, j) => j !== i) })}
                >
                  {t("Remover")}
                </Button>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`objecao-${i}-quando`}>{t("Quando a pessoa diz")}</Label>
                <Input
                  id={`objecao-${i}-quando`}
                  maxLength={MAX_QUANDO}
                  placeholder={t("ex.: vou pensar")}
                  value={o.quando}
                  onChange={(e) => mudaObjecao(i, { quando: e.target.value })}
                  disabled={readOnly}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`objecao-${i}-resposta`}>{t("O que o agente responde")}</Label>
                <Textarea
                  id={`objecao-${i}-resposta`}
                  rows={3}
                  maxLength={MAX_RESPOSTA}
                  placeholder={t("O sentido da resposta, com as suas palavras. Sem valores em dinheiro.")}
                  value={o.resposta}
                  onChange={(e) => mudaObjecao(i, { resposta: e.target.value })}
                  disabled={readOnly}
                />
                <p className="text-xs text-text-muted">{`${o.resposta.length}/${MAX_RESPOSTA}`}</p>
              </div>
            </div>
          ))}

          {!cheia && !readOnly ? (
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => patch({ objecoes: [...form.objecoes, { quando: "", resposta: "" }] })}
              >
                {t("Adicionar objeção")}
              </Button>
            </div>
          ) : null}
        </Card>

        {!readOnly ? (
          <div className="flex justify-end">
            <Button type="button" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? t("Salvando…") : t("Salvar objeções")}
            </Button>
          </div>
        ) : null}
      </div>

      <PreviaDoBloco texto={previa} ligada={form.enabled} testId="previa-das-objecoes" />
    </div>
  );
}
