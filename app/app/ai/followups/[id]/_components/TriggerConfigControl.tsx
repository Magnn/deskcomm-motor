"use client";

import { useT } from "@/hooks/i18n/useT";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { palavrasDe } from "@/lib/followup/gatilho-da-criacao";
import { MODOS_DA_MENSAGEM, MODOS_DA_PALAVRA } from "@/lib/followup/vocabulario";
import { EVENTOS_DA_CAKTO, ROTULOS_DOS_EVENTOS_DA_CAKTO, type EventoDaCakto } from "@/lib/pagamentos/eventos-da-cakto";
import type { ModoDaMensagem, ModoDaPalavra } from "@/lib/followup/mensagem-casa";
import { useUpdateTriggerConfig } from "@/hooks/followup/useFollowupFlow";
import { etapasPorFunil, nomeDaEtapa, useEtapasDeGatilho } from "@/hooks/followup/useEtapasDeGatilho";
import {
  DEFAULT_THRESHOLD_MINUTES as DEFAULT_RETORNO_MINUTES,
  UNIDADES_DE_LIMIAR,
  limiarDaTela,
  limiarValido,
  minutosDoLimiar,
  type UnidadeDeLimiar,
} from "@/lib/followup/gap-de-retorno";

/**
 * Controle de `trigger_config` do pointer (Task 8.5) — como o fluxo começa.
 *
 * ⚠️ SÓ APARECE AQUI O QUE TEM MOTOR VIVO, e essa disciplina é a razão de o
 * controle ser confiável: `manual` (POST manual), `silence` (silence-sweep),
 * `stage_change` (`lib/followup/gatilho-etapa.ts`), `inbound_after_silence`
 * (`lib/followup/gatilho-retorno.ts`) e os demais kinds com produtor.
 * `conversation_end` continua no schema sem produtor — não é oferecido, e o
 * publish o recusa se chegar por API crua.
 * Dado antigo com um kind que não sabemos armar é mostrado como
 * «(indisponível)» em vez de mentir «Manual».
 *
 * ⚠️ A ETAPA É ESCOLHIDA PELO NOME, NUNCA POR UUID. O `trigger_config` guarda
 * `stage_id`; a tela resolve id → nome com `useEtapasDeGatilho`.
 *
 * ⚠️ E O NOME DA ETAPA SOZINHO NÃO IDENTIFICA A ETAPA. Todo funil nasce com
 * «Novo / Em andamento / Ganho / Perdido» (`ETAPAS_INICIAIS`), então DOIS funis
 * já bastam para quatro pares homônimos — não é caso de borda, é o default. Por
 * isso o funil viaja junto do nome da etapa em TODA superfície: no item da
 * lista, no seletor fechado e no rótulo do botão. O agrupamento por funil ficou,
 * mas ele sozinho não resolvia: o cabeçalho só existe DENTRO da lista aberta, e
 * some nas duas superfícies que duram. Quem armasse a homônima do funil errado
 * via `Gatilho: entrou em «Em andamento»` — idêntico ao certo — e o motor então
 * saía por `pointers_armados = 0`, calado (`lib/followup/gatilho-etapa.ts`):
 * fluxo `active` que nunca dispara, sem um sinal. É o invariante 6 do Sistema
 * Vivo, que proíbe exatamente o `return` mudo em cima de estado configurável.
 *
 * ⚠️ O RÓTULO DIZ QUANDO, NÃO SÓ O QUÊ. O disparo depende de dois crons de um
 * minuto (o dreno do `event_log` e o tick do motor), então a tela promete
 * «poucos minutos», não «na hora» — prometer instantâneo seria o controle
 * mentindo sobre a própria função.
 */
type TriggerKind =
  | "appointment_no_show"
  | "manual"
  | "silence"
  | "stage_change"
  | "case_opened"
  | "webhook"
  | "inbound_after_silence"
  | "inbound_message"
  | "payment_event"
  | "lead_created";

interface TriggerFormState {
  kind: TriggerKind;
  thresholdMinutes: number;
  thresholdValor: number;
  thresholdUnidade: UnidadeDeLimiar;
  segments: string;
  stageId: string;
  cancelOnReply: boolean;
  eventTypeIds: string[];
  pagamentoEvento: EventoDaCakto;
  pagamentoProdutos: string;
  msgMatch: ModoDaMensagem;
  msgKeywords: string;
  msgKeywordMode: ModoDaPalavra;
}

const DEFAULT_THRESHOLD_MINUTES = 60;
const MIN_THRESHOLD_MINUTES = 5;

const KIND_LABEL: Record<TriggerKind, string> = {
  appointment_no_show:"Falta confirmada pela equipe",
  manual: "Manual",
  silence: "Silêncio",
  stage_change: "Etapa do funil",
  // "Agente pediu ajuda", e não "Pedido de ajuda": numa lista ao lado de
  // "Manual", "Silêncio" e "Etapa do funil", o rótulo sem sujeito não diz
  // QUEM pediu. O resumo do botão (`resumoDoGatilho`) e o vocabulário
  // (`lib/followup/vocabulario.ts`) já falam de "o agente pede ajuda" —
  // esta era a única das três grafias sem sujeito, e as duas specs que
  // cercam o gatilho procuram por ela com `exact: true`.
  case_opened: "Agente pediu ajuda",
  webhook: "Automação (Webhooks)",
  inbound_after_silence: "Cliente voltou",
  inbound_message: "Mensagem recebida",
  payment_event: "Evento de pagamento (Cakto)",
  lead_created: "Lead criado",
};

function parseTriggerConfig(raw: Record<string, unknown>): TriggerFormState {
  // ⚠️ RECONHECER É DIFERENTE DE ACEITAR. Esta função degradava QUALQUER kind
  // desconhecido para "manual" — e o formulário então salvava `{kind:"manual"}`,
  // destruindo a configuração com um toast de sucesso. Bastava o operador abrir
  // o painel de um fluxo `case_opened` numa versão antiga do app e mexer no
  // botão de cancelar-na-resposta. Agora só os kinds que este painel sabe EDITAR
  // caem no formulário; o resto é preservado (ver `open` no componente).
  const kind: TriggerKind =
    raw.kind === "appointment_no_show"
      ? "appointment_no_show"
      : raw.kind === "silence"
        ? "silence"
        : raw.kind === "inbound_after_silence"
          ? "inbound_after_silence"
          : raw.kind === "inbound_message"
            ? "inbound_message"
            : raw.kind === "payment_event"
              ? "payment_event"
          : raw.kind === "stage_change"
            ? "stage_change"
            : raw.kind === "case_opened"
              ? "case_opened"
              : raw.kind === "webhook"
                ? "webhook"
                : raw.kind === "lead_created"
                  ? "lead_created"
                  : "manual";
  const params =
    (raw.params as { threshold_minutes?: number; segments?: string[]; stage_id?: string; event_type_ids?: string[]; match?: ModoDaMensagem; keywords?: string[]; keyword_mode?: ModoDaPalavra; event?: EventoDaCakto; products?: string[] } | undefined) ?? {};
  const minutosRetorno =
    kind === "inbound_after_silence" && typeof params.threshold_minutes === "number"
      ? params.threshold_minutes
      : DEFAULT_RETORNO_MINUTES;
  const tela = limiarDaTela(minutosRetorno);
  return {
    kind,
    eventTypeIds: Array.isArray(params.event_type_ids) ? params.event_type_ids : [],
    thresholdMinutes:
      kind === "silence" && typeof params.threshold_minutes === "number"
        ? params.threshold_minutes
        : DEFAULT_THRESHOLD_MINUTES,
    thresholdValor: tela.valor,
    thresholdUnidade: tela.unidade,
    segments:
      (kind === "silence" || kind === "inbound_after_silence") && Array.isArray(params.segments)
        ? params.segments.join(", ")
        : "",
    stageId: kind === "stage_change" && typeof params.stage_id === "string" ? params.stage_id : "",
    cancelOnReply: raw.cancel_on_reply === true,
    pagamentoEvento:
      kind === "payment_event" && params.event && EVENTOS_DA_CAKTO.includes(params.event) ? params.event : "purchase_approved",
    pagamentoProdutos: kind === "payment_event" && Array.isArray(params.products) ? params.products.join(", ") : "",
    msgMatch: kind === "inbound_message" && params.match ? params.match : "any",
    msgKeywords: kind === "inbound_message" && Array.isArray(params.keywords) ? params.keywords.join(", ") : "",
    msgKeywordMode: kind === "inbound_message" && params.keyword_mode ? params.keyword_mode : "contains",
  };
}

function toTriggerConfig(form: TriggerFormState): Record<string, unknown> {
  const cancelOnReply = form.cancelOnReply ? { cancel_on_reply: true } : {};
  if (form.kind === "appointment_no_show") return {kind:"appointment_no_show",params:{event_type_ids:form.eventTypeIds}};
  if (form.kind === "manual") return { kind: "manual", ...cancelOnReply };

  if (form.kind === "stage_change") {
    return { kind: "stage_change", params: { stage_id: form.stageId }, ...cancelOnReply };
  }

  // Sem `params`: não há o que casar. Todo caso aberto da organização dispara
  // todo fluxo armado assim.
  if (form.kind === "case_opened") return { kind: "case_opened", ...cancelOnReply };
  if (form.kind === "webhook") return { kind: "webhook", ...cancelOnReply };
  if (form.kind === "payment_event") {
    const products = palavrasDe(form.pagamentoProdutos);
    return {
      kind: "payment_event",
      params: { provider: "cakto", event: form.pagamentoEvento, ...(products.length > 0 ? { products } : {}) },
      ...cancelOnReply,
    };
  }
  if (form.kind === "inbound_message") {
    const keywords = palavrasDe(form.msgKeywords);
    return {
      kind: "inbound_message",
      params:
        form.msgMatch === "keyword"
          ? { match: "keyword", keywords, keyword_mode: form.msgKeywordMode }
          : { match: form.msgMatch },
      ...cancelOnReply,
    };
  }
  if (form.kind === "lead_created") return { kind: "lead_created", ...cancelOnReply };

  const segments = form.segments
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (form.kind === "inbound_after_silence") {
    const minutes = minutosDoLimiar(form.thresholdValor, form.thresholdUnidade);
    return {
      kind: "inbound_after_silence",
      params: {
        threshold_minutes: Number.isFinite(minutes) ? minutes : DEFAULT_RETORNO_MINUTES,
        ...(segments.length > 0 ? { segments } : {}),
      },
      ...cancelOnReply,
    };
  }

  return {
    kind: "silence",
    params: { threshold_minutes: form.thresholdMinutes, ...(segments.length > 0 ? { segments } : {}) },
    ...cancelOnReply,
  };
}

function summaryLabel(
  cfg: Record<string, unknown>,
  etapa: { stageName: string; pipelineName: string } | null,
  t: (texto: string) => string = (texto) => texto,
): string {
  if(cfg.kind === "appointment_no_show") return t("Gatilho: falta confirmada pela equipe");
  if (cfg.kind === "silence") {
    const minutes = (cfg.params as { threshold_minutes?: number } | undefined)?.threshold_minutes;
    return `Gatilho: Silêncio${typeof minutes === "number" ? ` (${minutes} min)` : ""}`;
  }
  if (cfg.kind === "inbound_after_silence") {
    const minutes = (cfg.params as { threshold_minutes?: number } | undefined)?.threshold_minutes;
    const tela = limiarDaTela(typeof minutes === "number" ? minutes : DEFAULT_RETORNO_MINUTES);
    const unidade =
      tela.unidade === "days"
        ? tela.valor === 1
          ? t("dia")
          : t("dias")
        : tela.unidade === "hours"
          ? tela.valor === 1
            ? t("hora")
            : t("horas")
          : tela.valor === 1
            ? t("minuto")
            : t("minutos");
    return `${t("Gatilho")}: ${t("Cliente voltou")} (${tela.valor} ${unidade})`;
  }
  if (cfg.kind === "stage_change") {
    // Enquanto os nomes não chegaram (ou a etapa sumiu do funil) o rótulo diz o
    // TIPO em vez de vazar o uuid — que é justamente o que esta tela não faz.
    // Com o funil junto, este rótulo passa a distinguir as homônimas: é a única
    // superfície que o dono lê uma semana depois, sem abrir nada.
    return etapa ? `Gatilho: entrou em «${etapa.stageName}» em ${etapa.pipelineName}` : "Gatilho: Etapa do funil";
  }
  if (cfg.kind === "payment_event") {
    const e = (cfg.params as { event?: EventoDaCakto } | undefined)?.event;
    const prod = (cfg.params as { products?: string[] } | undefined)?.products ?? [];
    return `${t("Gatilho")}: Cakto — ${e ? t(ROTULOS_DOS_EVENTOS_DA_CAKTO[e] ?? e) : t("evento")}${prod.length > 0 ? ` (${prod.join(", ")})` : ""}`;
  }
  if (cfg.kind === "inbound_message") {
    const p = (cfg.params as { match?: string; keywords?: string[] } | undefined) ?? {};
    if (p.match === "keyword") return `${t("Gatilho")}: ${t("palavra-chave")} «${(p.keywords ?? []).join(", ")}»`;
    if (p.match === "first_message") return `${t("Gatilho")}: ${t("primeira mensagem do contato")}`;
    return `${t("Gatilho")}: ${t("qualquer mensagem recebida")}`;
  }
  if (cfg.kind === "case_opened") return `${t("Gatilho")}: ${t("quando o agente pede ajuda")}`;
  if (cfg.kind === "webhook") return t("Disparado por uma automação em Webhooks");
  if (cfg.kind === "lead_created") return `${t("Gatilho")}: ${t("Lead criado")}`;
  if (cfg.kind === "manual" || cfg.kind === undefined) return `${t("Gatilho")}: ${t("Manual")}`;
  // conversation_end de dados antigos (API crua) — sem UI própria, mas mostrado
  // com transparência em vez de mentir "Manual".
  return `Gatilho: ${String(cfg.kind)} (indisponível)`;
}

interface Props {
  flowId: string;
  triggerConfig: Record<string, unknown>;
}

export function TriggerConfigControl({ flowId, triggerConfig }: Props) {
  const t = useT();
  const update = useUpdateTriggerConfig(flowId);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<TriggerFormState>(() => parseTriggerConfig(triggerConfig));
  const [form, setForm] = useState<TriggerFormState>(saved);
  const eventTypes=useQuery({queryKey:["agenda","tipos"],enabled:open&&form.kind==="appointment_no_show",queryFn:async()=>
    (await apiClient.get<{data:Array<{id:string;name:string}>}>("/api/v1/agenda/tipos")).data});
  // A leitura das etapas acompanha o botão, não o popover: o rótulo fechado
  // precisa do nome da etapa para não exibir «Etapa do funil» genérico num
  // fluxo já configurado.
  const { etapas, carregando: etapasCarregando } = useEtapasDeGatilho();
  const etapaSalva = etapas.find((e) => e.stageId === parseTriggerConfig(triggerConfig).stageId);

  // Re-sincroniza com o valor persistido quando o popover está FECHADO — nunca
  // no meio de uma edição em andamento (mesma doutrina do `savedGraph` do canvas).
  useEffect(() => {
    if (open) return;
    const next = parseTriggerConfig(triggerConfig);
    setSaved(next);
    setForm(next);
  }, [triggerConfig, open]);

  const minutosRetorno = minutosDoLimiar(form.thresholdValor, form.thresholdUnidade);
  const retornoInvalid =
    form.kind === "inbound_after_silence" && !limiarValido(minutosRetorno);
  const thresholdInvalid =
    (form.kind === "silence" &&
      (!Number.isFinite(form.thresholdMinutes) || form.thresholdMinutes < MIN_THRESHOLD_MINUTES)) ||
    retornoInvalid;
  // Gatilho de etapa sem etapa escolhida não é rascunho: é um fluxo que ficaria
  // ativo sem nunca disparar. O publish recusa; o Salvar recusa antes.
  const stageInvalid = form.kind === "stage_change" && form.stageId.trim().length === 0;
  // Palavra-chave sem palavra é fluxo ativo que nunca dispara: o publish recusa, o Salvar recusa antes.
  const palavraInvalid = form.kind === "inbound_message" && form.msgMatch === "keyword" && palavrasDe(form.msgKeywords).length === 0;
  const dirty =
    form.kind !== saved.kind ||
    (form.kind === "appointment_no_show" && form.eventTypeIds.join() !== saved.eventTypeIds.join()) ||
    form.cancelOnReply !== saved.cancelOnReply ||
    (form.kind === "silence" && (form.thresholdMinutes !== saved.thresholdMinutes || form.segments !== saved.segments)) ||
    (form.kind === "inbound_after_silence" &&
      (form.thresholdValor !== saved.thresholdValor ||
        form.thresholdUnidade !== saved.thresholdUnidade ||
        form.segments !== saved.segments)) ||
    (form.kind === "stage_change" && form.stageId !== saved.stageId) ||
    (form.kind === "payment_event" &&
      (form.pagamentoEvento !== saved.pagamentoEvento || form.pagamentoProdutos !== saved.pagamentoProdutos)) ||
    (form.kind === "inbound_message" &&
      (form.msgMatch !== saved.msgMatch ||
        form.msgKeywords !== saved.msgKeywords ||
        form.msgKeywordMode !== saved.msgKeywordMode));

  const onSave = () => {
    if (thresholdInvalid || stageInvalid || palavraInvalid) return;
    update.mutate(toTriggerConfig(form), {
      onSuccess: () => {
        setSaved(form);
        setOpen(false);
      },
    });
  };

  // Duas etapas homônimas em funis diferentes precisam do cabeçalho do grupo
  // para serem distinguíveis.
  const funis = etapasPorFunil(etapas);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" data-testid="trigger-config-button">
          {summaryLabel(triggerConfig, etapaSalva ?? null, t)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end" data-testid="trigger-config-panel">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="trigger-kind">{t("Tipo de gatilho")}</Label>
            <Select
              value={form.kind}
              onValueChange={(v) =>
                setForm((f) => {
                  const kind = v as TriggerKind;
                  if (kind === "inbound_after_silence" && f.kind !== "inbound_after_silence") {
                    const tela = limiarDaTela(DEFAULT_RETORNO_MINUTES);
                    return { ...f, kind, thresholdValor: tela.valor, thresholdUnidade: tela.unidade };
                  }
                  return { ...f, kind };
                })
              }
            >
              <SelectTrigger id="trigger-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">{t(KIND_LABEL.manual)}</SelectItem>
                <SelectItem value="silence">{t(KIND_LABEL.silence)}</SelectItem>
                <SelectItem value="stage_change">{t(KIND_LABEL.stage_change)}</SelectItem>
                <SelectItem value="appointment_no_show">{t(KIND_LABEL.appointment_no_show)}</SelectItem>
                <SelectItem value="case_opened">{t(KIND_LABEL.case_opened)}</SelectItem>
                <SelectItem value="inbound_after_silence">{t(KIND_LABEL.inbound_after_silence)}</SelectItem>
                <SelectItem value="inbound_message">{t(KIND_LABEL.inbound_message)}</SelectItem>
                <SelectItem value="payment_event">{t(KIND_LABEL.payment_event)}</SelectItem>
                <SelectItem value="lead_created">{t(KIND_LABEL.lead_created)}</SelectItem>
                <SelectItem value="webhook">{t(KIND_LABEL.webhook)}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.kind === "stage_change" && (
            <div className="space-y-2">
              <Label htmlFor="trigger-stage">{t("Etapa que dispara o fluxo")}</Label>
              <Select
                value={form.stageId}
                onValueChange={(v) => setForm((f) => ({ ...f, stageId: v }))}
                disabled={etapasCarregando || etapas.length === 0}
              >
                <SelectTrigger id="trigger-stage" data-testid="trigger-stage-select" aria-invalid={stageInvalid}>
                  <SelectValue placeholder={etapasCarregando ? "Carregando etapas…" : "Escolha a etapa"} />
                </SelectTrigger>
                <SelectContent>
                  {funis.map((funil) => (
                    <SelectGroup key={funil.id}>
                      <SelectLabel>{funil.nome}</SelectLabel>
                      {funil.etapas.map((etapa) => (
                        // O funil vai no TEXTO do item, não só no cabeçalho do
                        // grupo: é o texto do item que vira o nome acessível da
                        // opção e o que o seletor mostra depois de fechado. Sem
                        // isto, escolher entre duas «Em andamento» é adivinhação
                        // — e escolher errado falha calado no motor.
                        <SelectItem key={etapa.stageId} value={etapa.stageId}>
                          {nomeDaEtapa(etapa)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {!etapasCarregando && etapas.length === 0 && (
                <p className="text-xs text-error-fg">
                  {t("Nenhuma etapa ativa encontrada — crie o funil antes de armar este gatilho.")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("O fluxo começa quando um negócio entra nesta etapa, por arrasto no quadro ou por automação. A entrada na fila leva poucos minutos, não é instantânea.")}
              </p>
            </div>
          )}

          {form.kind === "appointment_no_show" && <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("Só começa após falta confirmada pela equipe. Remarcação, cancelamento ou nova resposta interrompem a recuperação. Outro acompanhamento ativo impede o início.")}</p>
            <p className="text-xs">{t("Tipos de compromisso (nenhum selecionado = todos)")}</p>
            {eventTypes.data?.map(type=><label key={type.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.eventTypeIds.includes(type.id)} onChange={e=>setForm(f=>({...f,eventTypeIds:e.target.checked?[...f.eventTypeIds,type.id]:f.eventTypeIds.filter(id=>id!==type.id)}))}/>{type.name}</label>)}
            {eventTypes.isError?<p role="alert">{t("Não foi possível carregar os tipos de compromisso.")}</p>:null}
          </div>}
          {form.kind === "case_opened" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t("O fluxo começa quando o agente abre um caso — o momento em que ele diz que precisa de uma pessoa. Não há o que escolher aqui: vale para qualquer caso desta conta.")}
              </p>
              {/* ⚠️ ESTA FRASE NÃO É DICA, É A DEFESA PRINCIPAL. Abrir um caso não
                  cala o agente: ele continua conversando. Um fluxo que fale no mesmo
                  instante põe duas vozes na mesma conversa. O atraso é do FLUXO, e
                  quem monta precisa saber disso antes de publicar. */}
              <p className="text-xs text-muted-foreground">
                <strong className="font-medium">{t("Comece o fluxo por uma espera.")}</strong> {t("O agente continua conversando depois de abrir o caso — sem espera, o cliente recebe duas mensagens ao mesmo tempo.")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("Se o caso for resolvido antes, o follow-up é cancelado sozinho.")}
              </p>
            </div>
          )}

          {form.kind === "payment_event" && (
            <div className="space-y-2" data-testid="trigger-pagamento">
              <Label htmlFor="trigger-pagamento-evento">{t("Evento da Cakto que inicia o fluxo")}</Label>
              <Select
                value={form.pagamentoEvento}
                onValueChange={(v) => setForm((f) => ({ ...f, pagamentoEvento: v as EventoDaCakto }))}
              >
                <SelectTrigger id="trigger-pagamento-evento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENTOS_DA_CAKTO.map((e) => (
                    <SelectItem key={e} value={e}>
                      {t(ROTULOS_DOS_EVENTOS_DA_CAKTO[e])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label htmlFor="trigger-pagamento-produtos">{t("Produtos (opcional)")}</Label>
              <Input
                id="trigger-pagamento-produtos"
                placeholder={t("ID ou parte do nome, separados por vírgula — vazio = todos")}
                value={form.pagamentoProdutos}
                onChange={(e) => setForm((f) => ({ ...f, pagamentoProdutos: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                {t("O fluxo começa quando a Cakto avisa este evento de uma pessoa que já está no CRM (pelo telefone ou e-mail do checkout). Quem nunca falou com você fica para uma pessoa olhar. O mesmo aviso reenviado não recomeça o fluxo.")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("Em «Compra aprovada», este fluxo passa a ser quem entrega — sem ele, vale o fluxo ativo cujo nome começa com «Entrega».")}
              </p>
            </div>
          )}

          {form.kind === "inbound_message" && (
            <div className="space-y-2" data-testid="trigger-mensagem">
              <Label htmlFor="trigger-msg-match">{t("Quando disparar")}</Label>
              <Select value={form.msgMatch} onValueChange={(v) => setForm((f) => ({ ...f, msgMatch: v as ModoDaMensagem }))}>
                <SelectTrigger id="trigger-msg-match">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t(MODOS_DA_MENSAGEM.any)}</SelectItem>
                  <SelectItem value="first_message">{t(MODOS_DA_MENSAGEM.first_message)}</SelectItem>
                  <SelectItem value="keyword">{t(MODOS_DA_MENSAGEM.keyword)}</SelectItem>
                </SelectContent>
              </Select>
              {form.msgMatch === "keyword" && (
                <>
                  <Label htmlFor="trigger-msg-keywords">{t("Palavras (separadas por vírgula)")}</Label>
                  <Input
                    id="trigger-msg-keywords"
                    placeholder={t("ex: quero, preço, começar")}
                    value={form.msgKeywords}
                    onChange={(e) => setForm((f) => ({ ...f, msgKeywords: e.target.value }))}
                    aria-invalid={palavraInvalid}
                  />
                  <Select
                    value={form.msgKeywordMode}
                    onValueChange={(v) => setForm((f) => ({ ...f, msgKeywordMode: v as ModoDaPalavra }))}
                  >
                    <SelectTrigger id="trigger-msg-mode" aria-label={t("Como casar a palavra")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">{t(MODOS_DA_PALAVRA.contains)}</SelectItem>
                      <SelectItem value="equals">{t(MODOS_DA_PALAVRA.equals)}</SelectItem>
                    </SelectContent>
                  </Select>
                  {palavraInvalid && <p className="text-xs text-error-fg">{t("Informe ao menos uma palavra.")}</p>}
                </>
              )}
              <p className="text-xs text-muted-foreground">
                {t("O fluxo começa quando o cliente escreve e a mensagem casa. Maiúsculas e acentos não importam. Enquanto o fluxo responde, o agente fica em silêncio nessa mensagem — é uma voz só.")}
              </p>
            </div>
          )}

          {form.kind === "lead_created" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t(
                  "O fluxo começa quando um negócio nasce: a primeira mensagem que abre o card, um formulário ou o cadastro manual. Negócios importados por planilha não entram. A entrada na fila leva poucos minutos, não é instantânea.",
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                <strong className="font-medium">{t("Comece o fluxo por uma espera.")}</strong>{" "}
                {t(
                  "Quem escreveu pode receber a resposta do agente no mesmo instante — sem espera, saem duas mensagens juntas.",
                )}
              </p>
            </div>
          )}

          {form.kind === "webhook" && (
            <p className="text-xs text-muted-foreground">
              {t(
                "O fluxo começa quando uma regra em Webhooks usa a ação «Iniciar fluxo de mensagem» apontando para este fluxo publicado.",
              )}
            </p>
          )}

          {form.kind === "inbound_after_silence" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="trigger-retorno-valor">{t("Tempo sem o cliente falar")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="trigger-retorno-valor"
                    type="number"
                    min={1}
                    value={form.thresholdValor}
                    onChange={(e) => setForm((f) => ({ ...f, thresholdValor: Number(e.target.value) }))}
                    aria-invalid={retornoInvalid}
                  />
                  <Select
                    value={form.thresholdUnidade}
                    onValueChange={(v) => setForm((f) => ({ ...f, thresholdUnidade: v as UnidadeDeLimiar }))}
                  >
                    <SelectTrigger id="trigger-retorno-unidade" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIDADES_DE_LIMIAR.map((u) => (
                        <SelectItem key={u} value={u}>
                          {t(u === "minutes" ? "minutos" : u === "hours" ? "horas" : "dias")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {retornoInvalid && (
                  <p className="text-xs text-error-fg">
                    {t("Mínimo de")} 1 {t("hora")}. {t("Máximo de")} 90 {t("dias")}.
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  "O fluxo começa quando o cliente escreve depois de ficar este tempo sem mandar mensagem. Não é o mesmo que silêncio: silêncio avisa enquanto ele some; este avisa quando ele volta.",
                )}
              </p>
              <div className="space-y-2">
                <Label htmlFor="trigger-retorno-segments">{t("Segmentos (tags, opcional)")}</Label>
                <Input
                  id="trigger-retorno-segments"
                  placeholder={t("ex: vip, carrinho-abandonado")}
                  value={form.segments}
                  onChange={(e) => setForm((f) => ({ ...f, segments: e.target.value }))}
                />
              </div>
            </>
          )}

          {form.kind === "silence" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="trigger-threshold">{t("Minutos de silêncio")}</Label>
                <Input
                  id="trigger-threshold"
                  type="number"
                  min={MIN_THRESHOLD_MINUTES}
                  value={form.thresholdMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, thresholdMinutes: Number(e.target.value) }))}
                  aria-invalid={thresholdInvalid}
                />
                {thresholdInvalid && (
                  <p className="text-xs text-error-fg">{t("Mínimo de")} {MIN_THRESHOLD_MINUTES} {t("minutos.")}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="trigger-segments">Segmentos (tags, opcional)</Label>
                <Input
                  id="trigger-segments"
                  placeholder={t("ex: vip, carrinho-abandonado")}
                  value={form.segments}
                  onChange={(e) => setForm((f) => ({ ...f, segments: e.target.value }))}
                />
              </div>
            </>
          )}

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="trigger-cancel-on-reply">{t("Cancelar se o lead responder")}</Label>
            <Switch
              id="trigger-cancel-on-reply"
              checked={form.kind === "appointment_no_show" || form.cancelOnReply}
              disabled={form.kind === "appointment_no_show"}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, cancelOnReply: checked }))}
            />
          </div>

          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={!dirty || thresholdInvalid || stageInvalid || palavraInvalid || update.isPending}
            onClick={onSave}
            data-testid="trigger-config-save"
          >
            {update.isPending ? t("Salvando…") : t("Salvar gatilho")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
