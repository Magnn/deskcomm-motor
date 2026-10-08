"use client";

import { useEffect, useMemo, useState } from "react";
import { ChatCircle, FileText } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { rotaDeTemplates, type FonteDeTemplates } from "@/lib/channels/templates-fonte";
import { whatsappTemplateConfigSchema } from "@/lib/followup/graph-schema";
import type { ConfigOf } from "./shared";

interface Props {
  config: ConfigOf<"whatsapp_template">;
  onChange: (c: ConfigOf<"whatsapp_template">) => void;
}

/** O que a tela precisa de cada modelo — o mesmo contrato derivado que o inbox usa (slots por `valueKey`). */
interface Modelo {
  name: string;
  language: string;
  status: string;
  slots: Array<{ key: string; expects: string; onde: string; valueKey: string }>;
  previews: Array<{ onde: string; text: string }>;
  savedValues?: Record<string, string>;
}

const FONTES: FonteDeTemplates[] = ["oficial", "parceiro", "graph"];

/** Só o que o motor resolve na hora do envio (`lib/followup/variaveis-do-contato.ts`). */
const VARIAVEIS = ["{primeiro_nome}", "{nome_completo}", "{telefone}"];

const EH_MIDIA = new Set(["image", "video", "document"]);

export function WhatsappTemplateForm({ config, onChange }: Props) {
  const t = useT();
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(config.values ?? {});

  useEffect(() => {
    let vivo = true;
    (async () => {
      const respostas = await Promise.allSettled(
        FONTES.map((f) => apiClient.get<{ data: { templates?: Modelo[] } | null }>(rotaDeTemplates(f))),
      );
      if (!vivo) return;
      const todos: Modelo[] = [];
      let algumaOk = false;
      for (const r of respostas) {
        if (r.status !== "fulfilled") continue;
        algumaOk = true;
        for (const m of r.value?.data?.templates ?? []) {
          if (!todos.some((x) => x.name === m.name && x.language === m.language)) todos.push(m);
        }
      }
      setFalhou(!algumaOk);
      setModelos(todos);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const aprovados = useMemo(() => (modelos ?? []).filter((m) => m.status === "APPROVED"), [modelos]);
  const escolhidoKey = config.template_name ? `${config.template_name}|${config.language ?? "pt_BR"}` : "";
  const escolhido = aprovados.find((m) => `${m.name}|${m.language}` === escolhidoKey) ?? null;

  const salvar = (patch: Partial<ConfigOf<"whatsapp_template">>) => {
    const parsed = whatsappTemplateConfigSchema.safeParse({ ...config, ...patch });
    if (parsed.success) onChange(parsed.data);
  };

  const escolher = (chave: string) => {
    if (chave === "") {
      setValues({});
      salvar({ template_name: "", language: undefined, values: {} });
      return;
    }
    const m = aprovados.find((x) => `${x.name}|${x.language}` === chave);
    if (!m) return;
    // Links de mídia já salvos para o modelo pré-preenchem o que é mídia; o resto começa vazio.
    const inicial: Record<string, string> = {};
    for (const s of m.slots) if (m.savedValues?.[s.valueKey]) inicial[s.valueKey] = m.savedValues[s.valueKey]!;
    setValues(inicial);
    salvar({ template_name: m.name, language: m.language, values: inicial });
  };

  const definir = (valueKey: string, valor: string) => {
    const next = { ...values, [valueKey]: valor };
    setValues(next);
    salvar({ values: next });
  };

  const semEscolhaNaLista = config.template_name !== "" && modelos !== null && escolhido === null;

  return (
    <div className="space-y-4 font-sans text-xs">
      <div className="flex items-center gap-2.5 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-200">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2563eb] text-white shadow-2xs">
          <ChatCircle size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text">{t("Editar")}</h3>
          <p className="text-[11px] text-text-muted">{t("Template WhatsApp Oficial")}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1 font-semibold text-text">
        <FileText size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="text-sm">{t("Template WhatsApp (Meta)")}</span>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="tpl-modelo" className="block text-[11px] font-semibold text-text-muted">
          {t("Template aprovado")}
        </label>
        <select
          id="tpl-modelo"
          value={escolhido ? escolhidoKey : ""}
          disabled={modelos === null}
          onChange={(e) => escolher(e.target.value)}
          className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs text-text shadow-2xs outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
        >
          <option value="">{modelos === null ? t("Carregando modelos…") : t("Selecione um template")}</option>
          {aprovados.map((m) => (
            <option key={`${m.name}|${m.language}`} value={`${m.name}|${m.language}`}>
              {m.name} ({m.language})
            </option>
          ))}
        </select>
        {modelos !== null && aprovados.length === 0 && (
          <p role="status" className="text-[11px] text-amber-700 dark:text-amber-400">
            {falhou
              ? t("Não foi possível carregar os modelos agora.")
              : t("Nenhum modelo aprovado encontrado. Conecte o canal oficial e sincronize os modelos em Conexões.")}
          </p>
        )}
        {semEscolhaNaLista && (
          <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">
            {t("O modelo salvo nesta caixa não está entre os aprovados desta conta — escolha outro.")}
          </p>
        )}
        <p className="text-[11px] text-text-muted">
          {t("Selecione o modelo aprovado na sua conta da Meta (WhatsApp Cloud API).")}
        </p>
      </div>

      {escolhido && escolhido.previews.length > 0 && (
        <div className="space-y-1 rounded-lg border border-border bg-surface-elevated p-2.5">
          {escolhido.previews.map((p) => (
            <p key={p.onde} className="whitespace-pre-wrap text-[11px] text-text-muted">
              <span className="font-semibold">{p.onde}: </span>
              {p.text}
            </p>
          ))}
        </div>
      )}

      {escolhido && escolhido.slots.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] text-text-muted">
            {t("Preencha cada campo variável do modelo. Use as variáveis do contato para personalizar.")}
          </p>
          {escolhido.slots.map((s) => {
            const midia = EH_MIDIA.has(s.expects);
            return (
              <div key={s.valueKey} className="space-y-1">
                <label htmlFor={`tpl-${s.valueKey}`} className="block text-[11px] font-semibold text-text-muted">
                  {s.onde} · {`{{${s.key}}}`}
                  {midia ? ` (${t("link da mídia")})` : ""}
                </label>
                <input
                  id={`tpl-${s.valueKey}`}
                  type="text"
                  value={values[s.valueKey] ?? ""}
                  onChange={(e) => definir(s.valueKey, e.target.value)}
                  placeholder={midia ? "https://…" : "{primeiro_nome}"}
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs text-text shadow-2xs outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
                {!midia && (
                  <div className="flex flex-wrap gap-1">
                    {VARIAVEIS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => definir(s.valueKey, `${values[s.valueKey] ?? ""}${v}`)}
                        className="rounded-full border border-border-strong px-2 py-0.5 text-[10px] text-text-muted hover:border-blue-500 hover:text-blue-600"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-text-muted">
        {t("O modelo é enviado na hora e o fluxo segue para a próxima caixa. Para esperar a resposta, use a caixa Aguardar.")}
      </p>
    </div>
  );
}
