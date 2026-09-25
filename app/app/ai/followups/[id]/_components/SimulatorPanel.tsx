"use client";

import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";
import { X } from "@/lib/ui/icons";
import type { FlowGraph } from "@/lib/followup/graph-schema";
import {
  avancarSimulacao,
  iniciarSimulacao,
  type Classificador,
  type SimEntrada,
  type SimState,
  type SimTranscriptEntry,
} from "@/lib/followup/simulate";

/**
 * Painel de simulação — testa o grafo que está NA TELA agora (o `graph` que o
 * canvas monta a partir dos nós/arestas em edição, com ou sem alterações
 * salvas) sem sair do construtor. Ver `lib/followup/simulate.ts` pro desenho
 * completo — este componente só é a CASCA: chama o driver puro, mostra o
 * transcript e coleta o próximo insumo do operador.
 *
 * Nada aqui grava em `contact_flow_data`/`followup_enrollments` nem cria
 * lead ou contato — a sessão vive só no estado do React, some ao fechar o
 * painel ou recarregar a tela (decisão de design: DoD do simulador).
 */

interface Props {
  flowId: string;
  graph: FlowGraph;
  onActiveNodeChange: (nodeId: string | null) => void;
  onClose: () => void;
}

interface ClassifyResponse {
  data: { class: string };
}

function Bolha({ lado, children }: { lado: "lead" | "assistente"; children: React.ReactNode }) {
  return (
    <div className={cn("flex", lado === "lead" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          lado === "lead" ? "bg-accent-soft text-text" : "border border-border bg-surface text-text",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Entrada({ entry }: { entry: SimTranscriptEntry }) {
  const t = useT();
  switch (entry.kind) {
    case "lead":
      return <Bolha lado="lead">{entry.texto}</Bolha>;

    case "lead_sem_resposta":
      return (
        <p className="text-center text-xs italic text-text-muted">
          {t("(simulação: sem resposta — prazo esgotado)")}
        </p>
      );

    case "mensagem_simulada":
      return (
        <Bolha lado="assistente">
          <Badge variant="outline" className="mb-1">
            {t("Simulado — não é enviado de verdade")}
          </Badge>
          <p>{entry.texto}</p>
          {entry.origem === "ia" && (
            <p className="mt-1 text-xs text-text-muted">
              {t("Orientação que a IA receberia para gerar a mensagem (não foi gerada aqui).")}
            </p>
          )}
          {entry.origem === "modelo_salvo" && (
            <p className="mt-1 text-xs text-text-muted">
              {t("Usaria este modelo salvo; o conteúdo dele não é pré-visualizado no simulador.")}
            </p>
          )}
          {entry.origem === "confirmacao" && (
            <p className="mt-1 text-xs text-text-muted">
              {t("Pergunta de confirmação — o dado já está preenchido nos dados simulados do lead.")}
            </p>
          )}
        </Bolha>
      );

    case "transicao":
      return (
        <p className="text-center text-xs text-text-muted" data-testid="simulator-transicao">
          → {entry.label}
          {entry.repeat ? ` (${entry.repeat.index}/${entry.repeat.total})` : ""}
        </p>
      );

    case "aguardando": {
      const texto =
        entry.motivo === "wait"
          ? t("Aguardando o fim da espera configurada neste nó.")
          : entry.motivo === "ai_classify"
            ? t("Aguardando a resposta do lead para classificar com IA.")
            : t("Aguardando a resposta do lead para casar com as regras deste nó.");
      return <p className="text-center text-xs text-text-muted">{texto}</p>;
    }

    case "classificado":
      return (
        <p className="text-center text-xs text-text-muted">
          {t("Classificado como:")} «{entry.classe}»
        </p>
      );

    case "fim":
      return (
        <p className="text-center text-sm font-medium text-text" data-testid="simulator-fim">
          {t("Fluxo concluído.")}
          {entry.nota ? ` — ${entry.nota}` : ""}
        </p>
      );

    case "finalizacao": {
      const texto =
        entry.tipo === "skill"
          ? `${t("Ao concluir, seria ativada a skill:")} ${entry.detalhe}`
          : entry.tipo === "proximo_fluxo"
            ? `${t("Ao concluir, encadearia para o fluxo:")} ${entry.detalhe}`
            : t("Ao concluir, a IA assumiria a conversa livremente.");
      return <p className="text-center text-xs text-text-muted">{texto}</p>;
    }

    case "erro":
      return (
        <p className="text-center text-xs text-destructive" data-testid="simulator-erro">
          {t("Erro:")} {entry.mensagem}
        </p>
      );
  }
}

export function SimulatorPanel({ flowId, graph, onActiveNodeChange, onClose }: Props) {
  const t = useT();
  const [state, setState] = React.useState<SimState | null>(null);
  const [erroInicial, setErroInicial] = React.useState<string | null>(null);
  const [mensagem, setMensagem] = React.useState("");
  const [processando, setProcessando] = React.useState(false);
  const [leadJson, setLeadJson] = React.useState("{}");
  const [leadJsonErro, setLeadJsonErro] = React.useState<string | null>(null);

  async function classificar({ candidateText, classes, hint }: Parameters<Classificador>[0]) {
    const res = await apiClient.post<ClassifyResponse>(
      `/api/v1/ai/followup-flows/${flowId}/simulate-classify`,
      { candidate_text: candidateText, classes, ...(hint ? { hint } : {}) },
      { timeoutMs: 60_000 },
    );
    return res.data.class;
  }

  function comDadosDoLead(base: SimState): SimState {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(leadJson) as Record<string, unknown>;
    } catch {
      setLeadJsonErro(t("JSON inválido — os dados do lead não foram atualizados nesta rodada."));
      return base;
    }
    setLeadJsonErro(null);
    return {
      ...base,
      lead: {
        ...base.lead,
        lead_stage: typeof parsed.lead_stage === "string" ? parsed.lead_stage : base.lead.lead_stage,
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.filter((x): x is string => typeof x === "string")
          : base.lead.tags,
        custom_fields:
          parsed.custom_fields && typeof parsed.custom_fields === "object" && !Array.isArray(parsed.custom_fields)
            ? (parsed.custom_fields as Record<string, unknown>)
            : base.lead.custom_fields,
      },
    };
  }

  async function passo(base: SimState, entrada?: SimEntrada) {
    setProcessando(true);
    try {
      const proximo = await avancarSimulacao({ graph, state: comDadosDoLead(base), entrada, classificar });
      setState(proximo);
      onActiveNodeChange(proximo.currentNodeId);
    } catch (err) {
      toast.error(err instanceof ApiError ? t(err.message) || t("Erro ao simular.") : t("Erro ao simular."));
    } finally {
      setProcessando(false);
    }
  }

  async function iniciar() {
    const inicio = iniciarSimulacao(graph);
    if (!inicio.ok) {
      setErroInicial(inicio.erro);
      setState(null);
      onActiveNodeChange(null);
      return;
    }
    setErroInicial(null);
    await passo(inicio.state);
  }

  // Só ao abrir o painel — "Reiniciar" é quem relê o grafo atual de propósito;
  // reagir a toda mudança de `graph` aqui reiniciaria a conversa a cada tecla
  // digitada num nó, no meio de uma simulação em andamento.
  React.useEffect(() => {
    // A rajada inicial é assíncrona (ai_classify chamaria a rota de
    // classificação se o Gatilho caísse direto nela) e termina com setState —
    // mesmo padrão de app/app/agenda/_client.tsx e
    // app/app/tasks/_components/FormularioDeTarefa.tsx para "estado que nasce
    // de um efeito de montagem", não de uma prop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void iniciar();
    return () => onActiveNodeChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const podeResponder = !!state && state.status === "aguardando_entrada" && !processando;

  async function enviar() {
    if (!state || !mensagem.trim()) return;
    const texto = mensagem.trim();
    setMensagem("");
    await passo(state, { kind: "mensagem", texto });
  }

  async function semResposta() {
    if (!state) return;
    await passo(state, { kind: "sem_resposta" });
  }

  return (
    <div className="flex h-full flex-col" data-testid="simulator-panel">
      <div className="flex items-center justify-between border-b border-border p-3">
        <h2 className="text-sm font-semibold text-text">{t("Simulador")}</h2>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t("Fechar")}>
          <X size={16} aria-hidden />
        </Button>
      </div>

      <div className="border-b border-border bg-warning-bg/40 p-3 text-xs text-text-muted">
        {t(
          "Simulação em memória: nenhuma mensagem é enviada de verdade e nenhum lead ou contato é criado. A classificação por IA roda de verdade (consome créditos do provedor); ações e skills só mostram o que SERIAM feitas.",
        )}
      </div>

      {erroInicial && (
        <p className="p-3 text-sm text-destructive" data-testid="simulator-erro-inicial">
          {erroInicial}
        </p>
      )}

      <details className="border-b border-border p-3 text-xs">
        <summary className="cursor-pointer font-medium text-text">{t("Dados do lead (simulados)")}</summary>
        <p className="mt-1 text-text-muted">
          {t("JSON opcional — lead_stage, tags e custom_fields — lido pelos nós de Condição e de Resposta.")}
        </p>
        <Textarea
          value={leadJson}
          onChange={(e) => setLeadJson(e.target.value)}
          rows={3}
          className="mt-2 font-mono text-xs"
          data-testid="simulator-lead-json"
        />
        {leadJsonErro && <p className="mt-1 text-destructive">{leadJsonErro}</p>}
      </details>

      <div className="flex-1 space-y-2 overflow-y-auto p-3" data-testid="simulator-transcript">
        {state?.transcript.map((entry, i) => <Entrada key={i} entry={entry} />)}
        {processando && <p className="text-center text-xs text-text-muted">{t("Processando…")}</p>}
      </div>

      <div className="border-t border-border p-3">
        {state?.status === "concluido" && (
          <p className="mb-2 text-xs font-medium text-success-fg" data-testid="simulator-concluido">
            {t("Simulação concluída.")}
          </p>
        )}
        <div className="flex gap-2">
          <Input
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder={t("Digite como se fosse o lead…")}
            disabled={!podeResponder}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            data-testid="simulator-input"
          />
          <Button
            type="button"
            onClick={() => void enviar()}
            disabled={!podeResponder || !mensagem.trim()}
            data-testid="simulator-enviar"
          >
            {t("Enviar")}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void semResposta()}
            disabled={!podeResponder}
            data-testid="simulator-sem-resposta"
          >
            {t("Simular: sem resposta / prazo esgotado")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void iniciar()}
            disabled={processando}
            data-testid="simulator-reiniciar"
          >
            {t("Reiniciar simulação")}
          </Button>
        </div>
      </div>
    </div>
  );
}
