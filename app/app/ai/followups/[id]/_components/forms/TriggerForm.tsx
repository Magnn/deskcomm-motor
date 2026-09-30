"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useUpdateTriggerConfig } from "@/hooks/followup/useFollowupFlow";
import { useT } from "@/hooks/i18n/useT";
import { gatilhoDaEscolha, palavrasDe } from "@/lib/followup/gatilho-da-criacao";
import { EVENTOS_DA_CAKTO, ROTULOS_DOS_EVENTOS_DA_CAKTO } from "@/lib/pagamentos/eventos-da-cakto";
import { useGatilhoDoFluxo } from "../GatilhoDoFluxo";

/**
 * O painel do nó Gatilho edita o `trigger_config` REAL do fluxo — o mesmo que o botão
 * «Gatilho» da barra e o diálogo de novo fluxo, e o que o motor lê.
 *
 * Antes ele gravava `{integration, event, keyword}` na configuração do PRÓPRIO nó, cujo
 * schema é `strictObject({})`: nenhum motor lia aquilo e o rascunho salvo com esses campos
 * seria recusado na validação. Agora a escolha vira gatilho (persistido, executado).
 *
 * Provedores além do WhatsApp e da Cakto entram por «Webhooks» (uma regra usa a ação
 * «Iniciar fluxo de mensagem»): o evento escolhido ali é rótulo de quem montou, e o painel
 * diz isso em vez de prometer um filtro que não existe.
 */

type Integracao = "whatsapp" | "cakto" | "hotmart" | "kiwify" | "asaas" | "stripe";

const EVENTOS_DO_WHATSAPP = [
  { value: "mensagem_recebida", label: "Qualquer mensagem" },
  { value: "inicio_conversa", label: "Primeira mensagem do contato" },
  { value: "palavra_chave", label: "Palavra-chave" },
] as const;

function estadoInicial(cfg: Record<string, unknown> | null): { integracao: Integracao; evento: string; palavras: string; produtos: string } {
  const kind = cfg?.kind;
  const params = (cfg?.params ?? {}) as { match?: string; keywords?: string[]; event?: string; products?: string[] };
  if (kind === "payment_event") {
    return { integracao: "cakto", evento: params.event ?? "purchase_approved", palavras: "", produtos: (params.products ?? []).join(", ") };
  }
  if (kind === "inbound_message") {
    const evento =
      params.match === "keyword" ? "palavra_chave" : params.match === "first_message" ? "inicio_conversa" : "mensagem_recebida";
    return { integracao: "whatsapp", evento, palavras: (params.keywords ?? []).join(", "), produtos: "" };
  }
  return { integracao: "whatsapp", evento: "mensagem_recebida", palavras: "", produtos: "" };
}

export function TriggerForm({ flowId }: { flowId: string }) {
  const t = useT();
  const atual = useGatilhoDoFluxo();
  const update = useUpdateTriggerConfig(flowId);
  const inicial = estadoInicial(atual);
  const [integracao, setIntegracao] = useState<Integracao>(inicial.integracao);
  const [evento, setEvento] = useState(inicial.evento);
  const [palavras, setPalavras] = useState(inicial.palavras);
  const [produtos, setProdutos] = useState(inicial.produtos);

  // O gatilho salvo chega (ou muda em outra aba): o formulário acompanha, sem pisar numa edição em curso.
  const chave = JSON.stringify(atual);
  useEffect(() => {
    const e = estadoInicial(atual);
    setIntegracao(e.integracao);
    setEvento(e.evento);
    setPalavras(e.palavras);
    setProdutos(e.produtos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  const gatilho = gatilhoDaEscolha({ provider: integracao, event: evento, keyword: palavras, produtos });
  const incompleto = gatilho === null;
  const entraPorWebhooks = integracao !== "whatsapp" && integracao !== "cakto";
  const sujo = JSON.stringify(gatilho) !== JSON.stringify(atual === null ? null : { ...atual, cancel_on_reply: undefined });

  const aoTrocarIntegracao = (v: Integracao) => {
    setIntegracao(v);
    setEvento(v === "whatsapp" ? "mensagem_recebida" : v === "cakto" ? "purchase_approved" : "pagamento_aprovado");
  };

  const classeCampo =
    "w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-slate-800 dark:text-zinc-100 outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs";

  return (
    <div className="space-y-4 font-sans text-xs" data-testid="trigger-form">
      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">
        {t("O nó de gatilho determina a porta de entrada dos contatos no funil. Escolha a integração e o evento disparador.")}
      </p>

      <div className="space-y-1.5">
        <label className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200" htmlFor="gatilho-integracao">
          {t("Integração")}
        </label>
        <select
          id="gatilho-integracao"
          value={integracao}
          onChange={(e) => aoTrocarIntegracao(e.target.value as Integracao)}
          className={classeCampo}
        >
          <option value="whatsapp">WhatsApp (Oficial / Não Oficial)</option>
          <option value="cakto">Cakto</option>
          <option value="hotmart">Hotmart</option>
          <option value="kiwify">Kiwify</option>
          <option value="asaas">Asaas</option>
          <option value="stripe">Stripe</option>
        </select>
      </div>

      {!entraPorWebhooks && (
        <div className="space-y-1.5">
          <label className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200" htmlFor="gatilho-evento">
            {t("Evento")}
          </label>
          <select id="gatilho-evento" value={evento} onChange={(e) => setEvento(e.target.value)} className={classeCampo}>
            {integracao === "whatsapp"
              ? EVENTOS_DO_WHATSAPP.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.label)}
                  </option>
                ))
              : EVENTOS_DA_CAKTO.map((e) => (
                  <option key={e} value={e}>
                    {t(ROTULOS_DOS_EVENTOS_DA_CAKTO[e])}
                  </option>
                ))}
          </select>
        </div>
      )}

      {integracao === "whatsapp" && evento === "palavra_chave" && (
        <div className="space-y-1.5">
          <label className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200" htmlFor="gatilho-palavras">
            {t("Palavras (separadas por vírgula)")}
          </label>
          <input
            id="gatilho-palavras"
            type="text"
            value={palavras}
            onChange={(e) => setPalavras(e.target.value)}
            placeholder={t("ex: quero, preço, começar")}
            className={classeCampo}
            aria-invalid={incompleto}
          />
          {incompleto && <p className="text-[11px] text-error-fg">{t("Informe ao menos uma palavra.")}</p>}
        </div>
      )}

      {integracao === "cakto" && (
        <div className="space-y-1.5">
          <label className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200" htmlFor="gatilho-produtos">
            {t("Produtos (opcional)")}
          </label>
          <input
            id="gatilho-produtos"
            type="text"
            value={produtos}
            onChange={(e) => setProdutos(e.target.value)}
            placeholder={t("ID ou parte do nome, separados por vírgula — vazio = todos")}
            className={classeCampo}
          />
        </div>
      )}

      {entraPorWebhooks && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          {t("Este provedor entra por Webhooks: uma regra usa a ação «Iniciar fluxo de mensagem» apontando para este fluxo. O evento não filtra — quem decide é a regra.")}
        </p>
      )}

      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={incompleto || !sujo || update.isPending}
        onClick={() => {
          if (gatilho !== null) update.mutate({ ...gatilho, ...(atual?.cancel_on_reply === true ? { cancel_on_reply: true } : {}) });
        }}
        data-testid="trigger-form-save"
      >
        {update.isPending ? t("Salvando…") : t("Salvar gatilho")}
      </Button>
    </div>
  );
}
