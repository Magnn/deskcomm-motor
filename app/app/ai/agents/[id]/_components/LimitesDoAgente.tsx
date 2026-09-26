"use client";
/**
 * A aba "Limites": o que o agente nunca diz nem promete, e os assuntos que não discute.
 *
 * Quarta das abas ESTRUTURADAS da configuração do agente. As outras dizem ao agente o que FAZER; esta diz o
 * que NÃO fazer — o que o dono sabe e o modelo não tem como adivinhar ("não prometemos prazo", "não damos
 * diagnóstico", "não comparamos com concorrente"). O sistema compila as duas listas num bloco que vai por
 * ÚLTIMO no prompt do turno, e a coluna da direita mostra esse bloco tal como ele vai.
 *
 * Os limites DA PLATAFORMA (não prometer resultado, não inventar prova nem urgência) não moram aqui: valem
 * para todo agente, queira o dono ou não. Esta aba só acrescenta o que é da empresa.
 *
 * A configuração mora em `ai_agents.config.limits` e vale no PRÓXIMO turno, sem publicar versão. Por isso só
 * admin salva: quem edita o cadastro do agente não muda por aqui o que ele está proibido de dizer.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ListaDeChips } from "@/components/ai/ListaDeChips";
import { PreviaDoBloco } from "@/components/ai/PreviaDoBloco";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { blocoDeLimites } from "@/lib/limites/bloco-do-prompt";
import {
  MAX_ASSUNTOS,
  MAX_NUNCA_DIZ,
  SUGESTOES_DE_ASSUNTOS,
  SUGESTOES_NUNCA_DIZ,
  TAMANHO_ASSUNTO,
  TAMANHO_NUNCA_DIZ,
  limitesSchema,
  type LimitesConfig,
} from "@/lib/limites/tipos";

interface Props {
  agentId: string;
  /** `ai_agents.config` como veio do banco. */
  config: Record<string, unknown> | null | undefined;
  readOnly?: boolean;
}

interface Formulario {
  enabled: boolean;
  nuncaDiz: string[];
  evitaAssuntos: string[];
}

const VAZIO: Formulario = { enabled: false, nuncaDiz: [], evitaAssuntos: [] };

/** Item de lista que o servidor aceita: sem aspas duplas, ponto e vírgula nem quebra de linha. */
const PROIBIDOS_NA_LISTA = ['"', ";", "\n"] as const;

function formularioInicial(config: Props["config"]): Formulario {
  // Aqui o `enabled: false` também vale: a tela mostra o que o dono já preencheu mesmo desligada.
  const bruto = (config as { limits?: unknown } | null | undefined)?.limits;
  const r = limitesSchema.safeParse(bruto);
  if (!r.success) return VAZIO;
  return { enabled: r.data.enabled, nuncaDiz: r.data.nunca_diz, evitaAssuntos: r.data.evita_assuntos };
}

/** O que o servidor recebe: o resultado passa no MESMO schema do servidor, e o motivo da recusa volta legível. */
export function paraCorpo(f: Formulario): { corpo: LimitesConfig } | { erro: string } {
  const r = limitesSchema.safeParse({ enabled: f.enabled, nunca_diz: f.nuncaDiz, evita_assuntos: f.evitaAssuntos });
  if (!r.success) return { erro: r.error.issues[0]?.message ?? "Confira os campos." };
  return { corpo: r.data };
}

export function LimitesDoAgente({ agentId, config, readOnly }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = React.useState<Formulario>(() => formularioInicial(config));
  const [salvando, setSalvando] = React.useState(false);
  const patch = (p: Partial<Formulario>) => setForm((f) => ({ ...f, ...p }));

  // A prévia é o bloco REAL: a mesma função que o turno usa, sobre os mesmos campos, com o interruptor
  // ligado (desligada, a pessoa ainda vê o que passaria a valer).
  const previa = React.useMemo(() => {
    const r = paraCorpo({ ...form, enabled: true });
    return "corpo" in r ? blocoDeLimites(r.corpo).trim() : "";
  }, [form]);

  // O atalho entra na língua da tela (`t(frase)`); já ter o item, em qualquer das duas línguas, esconde o atalho.
  const jaTem = (lista: readonly string[], frase: string) =>
    lista.some((i) => [frase, t(frase)].some((f) => f.toLowerCase() === i.toLowerCase()));

  const salvar = async () => {
    const r = paraCorpo(form);
    if ("erro" in r) {
      toast.error(t(r.erro));
      return;
    }
    setSalvando(true);
    try {
      await apiClient.put(`/api/v1/ai/agents/${agentId}/limites`, r.corpo);
      await qc.invalidateQueries({ queryKey: ["ai", "agents"] });
      toast.success(
        form.enabled
          ? t("Limites salvos. Valem a partir da próxima conversa.")
          : t("Limites desligados. O agente volta a usar só as instruções dele."),
      );
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]" data-testid="limites-do-agente">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-medium">{t("Limites")}</h2>
              <p className="max-w-2xl text-sm text-text-muted">
                {t(
                  "Diga o que o agente nunca fala nem promete e os assuntos que ele não discute. Ao bater num limite, ele não inventa: explica com gentileza que não pode e oferece chamar uma pessoa da equipe. Vale a partir da próxima conversa, sem publicar versão.",
                )}
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
              disabled={readOnly}
              aria-label={t("Usar estes limites")}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-4">
          <h3 className="text-sm font-medium">{t("O que o agente nunca diz nem promete")}</h3>
          {!readOnly && form.nuncaDiz.length < MAX_NUNCA_DIZ ? (
            <div className="flex flex-col gap-2" data-testid="sugestoes-nunca-diz">
              <span className="text-xs text-text-muted">{t("Atalhos para o que quase toda empresa evita:")}</span>
              <div className="flex flex-wrap gap-2">
                {Object.entries(SUGESTOES_NUNCA_DIZ).map(([chave, frase]) =>
                  jaTem(form.nuncaDiz, frase) ? null : (
                    <Button
                      key={chave}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => patch({ nuncaDiz: [...form.nuncaDiz, t(frase)] })}
                    >
                      {t(frase)}
                    </Button>
                  ),
                )}
              </div>
            </div>
          ) : null}
          <ListaDeChips
            id="limites-nunca-diz"
            rotulo={t("Nunca diz nem promete")}
            dica={t("Uma coisa por item. Digite e aperte Enter.")}
            placeholder={t("ex.: garantia de resultado")}
            itens={form.nuncaDiz}
            aoMudar={(nuncaDiz) => patch({ nuncaDiz })}
            desabilitado={readOnly}
            max={MAX_NUNCA_DIZ}
            tamanhoMax={TAMANHO_NUNCA_DIZ}
            proibidos={PROIBIDOS_NA_LISTA}
          />
        </Card>

        <Card className="flex flex-col gap-4 p-4">
          <h3 className="text-sm font-medium">{t("Assuntos que o agente não discute")}</h3>
          {!readOnly && form.evitaAssuntos.length < MAX_ASSUNTOS ? (
            <div className="flex flex-col gap-2" data-testid="sugestoes-assuntos">
              <span className="text-xs text-text-muted">{t("Atalhos para assuntos comuns:")}</span>
              <div className="flex flex-wrap gap-2">
                {Object.entries(SUGESTOES_DE_ASSUNTOS).map(([chave, frase]) =>
                  jaTem(form.evitaAssuntos, frase) ? null : (
                    <Button
                      key={chave}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => patch({ evitaAssuntos: [...form.evitaAssuntos, t(frase)] })}
                    >
                      {t(frase)}
                    </Button>
                  ),
                )}
              </div>
            </div>
          ) : null}
          <ListaDeChips
            id="limites-assuntos"
            rotulo={t("Assuntos que não discute")}
            dica={t("Digite o assunto e aperte Enter.")}
            placeholder={t("ex.: política")}
            itens={form.evitaAssuntos}
            aoMudar={(evitaAssuntos) => patch({ evitaAssuntos })}
            desabilitado={readOnly}
            max={MAX_ASSUNTOS}
            tamanhoMax={TAMANHO_ASSUNTO}
            proibidos={PROIBIDOS_NA_LISTA}
          />
        </Card>

        {!readOnly ? (
          <div className="flex justify-end">
            <Button type="button" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? t("Salvando…") : t("Salvar limites")}
            </Button>
          </div>
        ) : null}
      </div>

      <PreviaDoBloco texto={previa} ligada={form.enabled} testId="previa-dos-limites" />
    </div>
  );
}
