"use client";

import { useState } from "react";
import { Cpu, ChevronDown, Plus, X, Move, Trash2, Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  apiCallConfigSchema,
  HTTP_METHODS,
  type ApiCallHeader,
  type HttpMethod,
} from "@/lib/followup/graph-schema";
import { parseCurl, ehHostBloqueadoPorSsrf } from "@/lib/followup/api-call";
import { camposDoFunil } from "@/lib/leads/campos-do-funil";
import { usePipelines } from "@/hooks/webhooks/useWebhookSources";
import { useAgentsList } from "@/hooks/ai/useAgents";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

import type { ConfigOf } from "./shared";

export type ActionItemType =
  | "update_contact"
  | "add_tag"
  | "remove_tag"
  | "add_follower"
  | "remove_follower"
  | "move_chat_open"
  | "move_chat_closed"
  | "assign_agent"
  | "remove_agent"
  | "start_flow"
  | "end_flow"
  | "update_workspace_var";

export interface ActionItemData {
  id: string;
  type: ActionItemType;
  label: string;
  field?: string;
  source_type?: "flow_field" | "webhook_path";
  value?: string;
  tags?: string[];
  user_id?: string;
  agent_id?: string;
  flow_id?: string;
  var_key?: string;
  var_value?: string;
}

const ACTION_OPTIONS: Array<{ type: ActionItemType; label: string }> = [
  { type: "update_contact", label: "Atualizar contato" },
  { type: "add_tag", label: "Adicionar Etiqueta" },
  { type: "remove_tag", label: "Remover Etiqueta" },
  { type: "add_follower", label: "Adicionar Seguidor ao contato" },
  { type: "remove_follower", label: "Remover Seguidor do contato" },
  { type: "move_chat_open", label: "Mover chat para abertas" },
  { type: "move_chat_closed", label: "Mover chat para fechadas" },
  { type: "assign_agent", label: "Atribuir atendente ao chat" },
  { type: "remove_agent", label: "Remover atendente ao chat" },
  { type: "start_flow", label: "Iniciar Fluxo" },
  { type: "end_flow", label: "Finalizar Fluxo" },
  { type: "update_workspace_var", label: "Atualizar variável de workspace" },
];

export function ApiCallForm({
  config,
  onChange,
}: {
  config: ConfigOf<"api_call">;
  onChange: (c: ConfigOf<"api_call">) => void;
}) {
  const t = useT();

  // Ações do nó
  const [actions, setActions] = useState<ActionItemData[]>(
    ((config.actions as ActionItemData[]) || []).map((a, idx) => ({
      ...a,
      id: a.id || `act_${idx}_${Date.now()}`,
    }))
  );

  // Estados legados / cURL Webhook
  const [method, setMethod] = useState<HttpMethod>(config.method || "POST");
  const [url, setUrl] = useState(config.url || "https://example.com/webhook");
  const [headers, setHeaders] = useState<ApiCallHeader[]>(config.headers || []);
  const [body, setBody] = useState(config.body ?? "");
  const [showWebhookConfig, setShowWebhookConfig] = useState(false);
  const [curlText, setCurlText] = useState("");
  const [curlError, setCurlError] = useState<string | null>(null);

  // Modais e Popovers
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [tagPopoverIndex, setTagPopoverIndex] = useState<number | null>(null);
  const [isNewTagModalOpen, setIsNewTagModalOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [customTags, setCustomTags] = useState<string[]>([
    "Entrou 1 vez Funil VS",
    "Lead Qualificado",
    "Cliente VIP",
    "Aguardando Resposta",
  ]);

  const [error, setError] = useState<string | null>(null);

  const pipelines = usePipelines();
  const campos = (pipelines.data?.data ?? []).flatMap((p) => camposDoFunil(p.settings));
  const camposUnicos = [...new Map(campos.map((c) => [c.key, c])).values()];
  const { data: agentes = [] } = useAgentsList();

  const commit = (patch: {
    actions?: ActionItemData[];
    method?: HttpMethod;
    url?: string;
    headers?: ApiCallHeader[];
    body?: string;
  }) => {
    const nextActions = patch.actions !== undefined ? patch.actions : actions;
    const nextMethod = patch.method !== undefined ? patch.method : method;
    const nextUrl = patch.url !== undefined ? patch.url : url;
    const nextHeaders = patch.headers !== undefined ? patch.headers : headers;
    const nextBody = patch.body !== undefined ? patch.body : body;

    const candidate = {
      method: nextMethod,
      url: nextUrl,
      headers: nextHeaders,
      ...(nextBody.trim() ? { body: nextBody } : {}),
      actions: nextActions as unknown as Record<string, unknown>[],
    };

    const parsed = apiCallConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const handleAddAction = (type: ActionItemType) => {
    const option = ACTION_OPTIONS.find((o) => o.type === type);
    const newAction: ActionItemData = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type,
      label: option?.label || "Ação",
      source_type: "flow_field",
      tags: type === "add_tag" ? ["Entrou 1 vez Funil VS"] : [],
    };
    const next = [...actions, newAction];
    setActions(next);
    commit({ actions: next });
    setIsAddMenuOpen(false);
  };

  const updateAction = (index: number, patch: Partial<ActionItemData>) => {
    const next = actions.map((act, i) => (i === index ? { ...act, ...patch } : act));
    setActions(next);
    commit({ actions: next });
  };

  const removeAction = (index: number) => {
    const next = actions.filter((_, i) => i !== index);
    setActions(next);
    commit({ actions: next });
  };

  const moveAction = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= actions.length) return;
    const next = [...actions];
    const item = next[index];
    const target = next[targetIndex];
    if (item && target) {
      next[index] = target;
      next[targetIndex] = item;
      setActions(next);
      commit({ actions: next });
    }
  };

  const addTagToAction = (actionIndex: number, tag: string) => {
    const act = actions[actionIndex];
    if (!act) return;
    const currentTags = act.tags || [];
    if (!currentTags.includes(tag)) {
      updateAction(actionIndex, { tags: [...currentTags, tag] });
    }
    setTagPopoverIndex(null);
  };

  const removeTagFromAction = (actionIndex: number, tag: string) => {
    const act = actions[actionIndex];
    if (!act) return;
    const currentTags = act.tags || [];
    updateAction(actionIndex, { tags: currentTags.filter((t) => t !== tag) });
  };

  const handleCreateNewTag = () => {
    if (!newTagName.trim()) return;
    const tagName = newTagName.trim();
    if (!customTags.includes(tagName)) {
      setCustomTags((prev) => [tagName, ...prev]);
    }
    if (tagPopoverIndex !== null) {
      addTagToAction(tagPopoverIndex, tagName);
    }
    setNewTagName("");
    setIsNewTagModalOpen(false);
  };

  const aplicarCurl = () => {
    const resultado = parseCurl(curlText);
    if (!resultado) {
      setCurlError(t("Não consegui ler este cURL — confira se ele tem uma URL http:// ou https://."));
      return;
    }
    setCurlError(null);
    setMethod(resultado.method);
    setUrl(resultado.url);
    setHeaders(resultado.headers);
    setBody(resultado.body ?? "");
    commit({
      method: resultado.method,
      url: resultado.url,
      headers: resultado.headers,
      body: resultado.body ?? "",
    });
  };

  const urlBloqueada = url.trim() !== "" && ehHostBloqueadoPorSsrf(url);

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* 1. Botão Adicionar uma nova ação */}
      <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 shadow-2xs">
        <Popover open={isAddMenuOpen} onOpenChange={setIsAddMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center gap-3 text-left group cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#2563eb] dark:text-blue-400 shrink-0 border border-blue-100 dark:border-blue-900/50">
                <Cpu size={18} />
              </div>
              <div className="h-5 w-[1px] bg-slate-200 dark:bg-zinc-800" />
              <span className="text-xs font-semibold text-[#2563eb] hover:text-[#1d4ed8] dark:text-blue-400 transition-colors">
                {t("Adicionar uma nova ação")}
              </span>
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            className="w-64 p-0 rounded-xl overflow-hidden shadow-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
          >
            <div className="py-1">
              {ACTION_OPTIONS.map((action) => (
                <button
                  key={action.type}
                  type="button"
                  onClick={() => handleAddAction(action.type)}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800/60 border-b last:border-b-0 border-slate-100 dark:border-zinc-800 transition-colors cursor-pointer font-medium"
                >
                  {t(action.label)}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* 2. Divisor Ações */}
      <div className="relative flex items-center justify-center py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200 dark:border-zinc-800" />
        </div>
        <span className="relative bg-white dark:bg-zinc-950 px-3 text-[11.5px] text-slate-400 font-medium">
          {t("Ações")}
        </span>
      </div>

      {/* 3. Empty State ou Lista de Ações */}
      {actions.length === 0 ? (
        <div className="flex justify-center py-1">
          <div className="w-full text-center py-2 px-4 rounded-full bg-[#5b5df4] text-white text-xs font-semibold shadow-xs">
            {t("Nenhum conteudo foi adicionado.")}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {actions.map((act, index) => (
            <div
              key={act.id}
              className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3.5 space-y-3 shadow-2xs"
            >
              {/* Card: Atualizar contato */}
              {act.type === "update_contact" && (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-[12px] font-bold text-slate-800 dark:text-zinc-200">
                      {t("Campo a ser atualizado")}
                    </label>
                    <div className="relative">
                      <select
                        value={act.field ?? ""}
                        onChange={(e) => updateAction(index, { field: e.target.value })}
                        className="w-full h-10 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 pr-8 text-xs text-slate-700 dark:text-zinc-200 focus:outline-hidden appearance-none cursor-pointer"
                      >
                        <option value="">{t("Selecione um campo")}</option>
                        <optgroup label={t("Contato")}>
                          <option value="name">{t("Nome")}</option>
                          <option value="phone">{t("Telefone")}</option>
                          <option value="email">{t("E-mail")}</option>
                        </optgroup>
                        <optgroup label={t("Campos Personalizados")}>
                          {camposUnicos.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.label}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      <ChevronDown
                        size={15}
                        className="absolute right-3 top-3 text-slate-400 pointer-events-none"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-600 dark:text-zinc-400 text-center font-medium pt-0.5">
                    {t("Atualize o contato utilizando informações salvas em")}
                  </p>

                  <div className="flex items-center rounded-full border border-slate-200 dark:border-zinc-800 p-0.5 bg-slate-50 dark:bg-zinc-900">
                    <button
                      type="button"
                      onClick={() => updateAction(index, { source_type: "flow_field" })}
                      className={cn(
                        "flex-1 py-1.5 px-3 rounded-full text-xs transition-all cursor-pointer text-center",
                        act.source_type !== "webhook_path"
                          ? "bg-[#9333ea] text-white shadow-xs font-semibold"
                          : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 font-medium"
                      )}
                    >
                      {t("Campo de fluxo")}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateAction(index, { source_type: "webhook_path" })}
                      className={cn(
                        "flex-1 py-1.5 px-3 rounded-full text-xs transition-all cursor-pointer text-center",
                        act.source_type === "webhook_path"
                          ? "bg-[#9333ea] text-white shadow-xs font-semibold"
                          : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 font-medium"
                      )}
                    >
                      {t("Caminho de webhook")}
                    </button>
                  </div>

                  <Input
                    value={act.value ?? ""}
                    onChange={(e) => updateAction(index, { value: e.target.value })}
                    placeholder="Ex: {{resposta_gpt_email}}"
                    className="h-10 rounded-lg border-slate-200 dark:border-zinc-800 text-xs placeholder:text-slate-400"
                  />
                </>
              )}

              {/* Card: Adicionar Etiqueta ou Remover Etiqueta */}
              {(act.type === "add_tag" || act.type === "remove_tag") && (
                <div className="space-y-1.5">
                  <label className="block text-[12px] font-bold text-slate-800 dark:text-zinc-200">
                    {t("Etiqueta")}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 min-h-[40px] rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 flex flex-wrap items-center gap-1.5">
                      {(act.tags || []).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 bg-[#2563eb] text-white px-2.5 py-1 rounded-full text-xs font-semibold shadow-xs"
                        >
                          <span>{tag}</span>
                          <button
                            type="button"
                            onClick={() => removeTagFromAction(index, tag)}
                            className="hover:text-blue-200 cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}

                      <Popover
                        open={tagPopoverIndex === index}
                        onOpenChange={(open) => setTagPopoverIndex(open ? index : null)}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex-1 text-left text-xs text-slate-400 min-w-[120px] flex items-center justify-between py-1 cursor-pointer"
                          >
                            <span>{act.tags?.length ? "" : t("Selecione uma etiqueta")}</span>
                            <ChevronDown size={14} className="text-slate-400" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-60 p-1.5 space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-2 py-1">
                            {t("Escolher etiqueta")}
                          </span>
                          <div className="max-h-48 overflow-y-auto space-y-0.5">
                            {customTags.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => addTagToAction(index, tag)}
                                className="w-full text-left px-2 py-1.5 text-xs text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-md transition-colors cursor-pointer"
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setTagPopoverIndex(index);
                        setIsNewTagModalOpen(true);
                      }}
                      className="w-10 h-10 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex items-center justify-center text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
                      title={t("Criar nova etiqueta")}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* Card: Seguidor */}
              {(act.type === "add_follower" || act.type === "remove_follower") && (
                <div className="space-y-1.5">
                  <label className="block text-[12px] font-bold text-slate-800 dark:text-zinc-200">
                    {t("Seguidor")}
                  </label>
                  <div className="relative">
                    <select
                      value={act.user_id ?? ""}
                      onChange={(e) => updateAction(index, { user_id: e.target.value })}
                      className="w-full h-10 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 pr-8 text-xs text-slate-700 dark:text-zinc-200 focus:outline-hidden appearance-none cursor-pointer"
                    >
                      <option value="">{t("Selecione um usuário")}</option>
                      {(agentes ?? []).map((agente: { id: string; name: string }) => (
                        <option key={agente.id} value={agente.id}>
                          {agente.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={15}
                      className="absolute right-3 top-3 text-slate-400 pointer-events-none"
                    />
                  </div>
                </div>
              )}

              {/* Card: Chat Aberto/Fechado */}
              {(act.type === "move_chat_open" || act.type === "move_chat_closed") && (
                <p className="text-xs text-slate-600 dark:text-zinc-400">
                  {act.type === "move_chat_open"
                    ? t("O chat será movido para conversas abertas ao passar por esta ação.")
                    : t("O chat será movido para conversas fechadas ao passar por esta ação.")}
                </p>
              )}

              {/* Card: Atendente */}
              {(act.type === "assign_agent" || act.type === "remove_agent") && (
                <>
                  {act.type === "assign_agent" ? (
                    <div className="space-y-1.5">
                      <label className="block text-[12px] font-bold text-slate-800 dark:text-zinc-200">
                        {t("Atendente")}
                      </label>
                      <div className="relative">
                        <select
                          value={act.agent_id ?? ""}
                          onChange={(e) => updateAction(index, { agent_id: e.target.value })}
                          className="w-full h-10 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 pr-8 text-xs text-slate-700 dark:text-zinc-200 focus:outline-hidden appearance-none cursor-pointer"
                        >
                          <option value="">{t("Selecione um atendente")}</option>
                          {(agentes ?? []).map((agente: { id: string; name: string }) => (
                            <option key={agente.id} value={agente.id}>
                              {agente.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={15}
                          className="absolute right-3 top-3 text-slate-400 pointer-events-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 dark:text-zinc-400">
                      {t("O atendente atual será desvinculado do chat ao passar por esta ação.")}
                    </p>
                  )}
                </>
              )}

              {/* Card: Iniciar / Finalizar Fluxo */}
              {(act.type === "start_flow" || act.type === "end_flow") && (
                <>
                  {act.type === "start_flow" ? (
                    <div className="space-y-1.5">
                      <label className="block text-[12px] font-bold text-slate-800 dark:text-zinc-200">
                        {t("Fluxo a ser iniciado")}
                      </label>
                      <Input
                        value={act.flow_id ?? ""}
                        onChange={(e) => updateAction(index, { flow_id: e.target.value })}
                        placeholder="ID ou nome do fluxo"
                        className="h-10 rounded-lg border-slate-200 dark:border-zinc-800 text-xs placeholder:text-slate-400"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 dark:text-zinc-400">
                      {t("O fluxo atual será encerrado para este contato.")}
                    </p>
                  )}
                </>
              )}

              {/* Card: Atualizar variável de workspace */}
              {act.type === "update_workspace_var" && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="block text-[12px] font-bold text-slate-800 dark:text-zinc-200">
                      {t("Nome da variável")}
                    </label>
                    <Input
                      value={act.var_key ?? ""}
                      onChange={(e) => updateAction(index, { var_key: e.target.value })}
                      placeholder="Ex: status_lead"
                      className="h-10 rounded-lg border-slate-200 dark:border-zinc-800 text-xs placeholder:text-slate-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[12px] font-bold text-slate-800 dark:text-zinc-200">
                      {t("Valor")}
                    </label>
                    <Input
                      value={act.var_value ?? ""}
                      onChange={(e) => updateAction(index, { var_value: e.target.value })}
                      placeholder="Ex: ativo"
                      className="h-10 rounded-lg border-slate-200 dark:border-zinc-800 text-xs placeholder:text-slate-400"
                    />
                  </div>
                </div>
              )}

              {/* Footer do Card com nome da ação + Move / Trash */}
              <div className="border-t border-slate-100 dark:border-zinc-800 pt-2.5 flex items-center justify-between">
                <span className="text-xs text-slate-700 dark:text-zinc-300 font-medium">
                  {t(act.label)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => moveAction(index, -1)}
                    disabled={index === 0}
                    className="text-[#9333ea] hover:text-purple-700 disabled:opacity-30 cursor-pointer p-0.5"
                    title={t("Mover")}
                  >
                    <Move size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAction(index)}
                    className="text-red-500 hover:text-red-700 cursor-pointer p-0.5"
                    title={t("Excluir")}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Seção Opcional: Chamar Webhook / API Externa */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowWebhookConfig(!showWebhookConfig)}
          className="text-[11.5px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Globe size={13} />
          <span>{t("Configuração de Webhook / API Externa (Opcional)")}</span>
        </button>

        {showWebhookConfig && (
          <div className="mt-3 space-y-3 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50">
            <div className="space-y-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2.5">
              <Label htmlFor="api-call-curl" className="text-xs">
                {t("Colar cURL")}
              </Label>
              <Textarea
                id="api-call-curl"
                rows={2}
                value={curlText}
                onChange={(e) => setCurlText(e.target.value)}
                placeholder='curl -X POST https://example.com/webhook -d "..."'
                className="text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={aplicarCurl}
                disabled={!curlText.trim()}
                className="text-xs h-7"
              >
                {t("Preencher via cURL")}
              </Button>
              {curlError && <p className="text-xs text-red-500">{curlError}</p>}
            </div>

            <div className="flex gap-2">
              <div className="w-24 space-y-1">
                <Label htmlFor="api-call-method" className="text-xs">
                  {t("Método")}
                </Label>
                <select
                  id="api-call-method"
                  value={method}
                  onChange={(e) => {
                    const next = e.target.value as HttpMethod;
                    setMethod(next);
                    commit({ method: next });
                  }}
                  className="w-full h-8 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2 text-xs"
                >
                  {HTTP_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="api-call-url" className="text-xs">
                  {t("URL")}
                </Label>
                <Input
                  id="api-call-url"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    commit({ url: e.target.value });
                  }}
                  placeholder="https://"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {urlBloqueada && (
              <p className="text-xs text-red-500">
                {t("Esta URL aponta para um endereço local/privado.")}
              </p>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}

      {/* Modal Criar Nova Etiqueta */}
      <Dialog open={isNewTagModalOpen} onOpenChange={setIsNewTagModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Criar nova etiqueta")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="new-tag-name">{t("Nome da etiqueta")}</Label>
              <Input
                id="new-tag-name"
                placeholder="Ex: Cliente VIP"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsNewTagModalOpen(false)}
            >
              {t("Cancelar")}
            </Button>
            <Button
              type="button"
              onClick={handleCreateNewTag}
              disabled={!newTagName.trim()}
              className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white"
            >
              {t("Criar etiqueta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
