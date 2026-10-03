"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { lerConteudo } from "@/lib/channels/template-conteudo";
import { fonteDeTemplates, rotaDeTemplates } from "@/lib/channels/templates-fonte";

export type TipoDeConteudo = "text" | "template" | "flow";

export interface ConteudoEscolhido {
  kind: TipoDeConteudo;
  templateName: string;
  templateLanguage: string;
  templateValues: Record<string, string>;
  /** O texto do modelo escolhido — é o que a conversa mostra depois do envio. */
  templatePreview: string;
  flowPointerId: string;
}

export const CONTEUDO_VAZIO: ConteudoEscolhido = {
  kind: "text",
  templateName: "",
  templateLanguage: "",
  templateValues: {},
  templatePreview: "",
  flowPointerId: "",
};

interface Slot {
  key: string;
  onde: string;
  expects: string;
  valueKey: string;
}

interface ModeloAprovado {
  name: string;
  language: string;
  status: string;
  slots?: Slot[];
  components?: unknown[];
  savedValues?: Record<string, string>;
}

/** O conteúdo está completo o bastante para salvar o rascunho? (O texto é conferido por quem usa.) */
export function conteudoPreenchido(c: ConteudoEscolhido, slots: number): boolean {
  if (c.kind === "template") {
    return c.templateName !== "" && Object.values(c.templateValues).filter((v) => v.trim() !== "").length >= slots;
  }
  if (c.kind === "flow") return c.flowPointerId !== "";
  return true;
}

/** Os campos de conteúdo como a API os espera. `texto` é o corpo livre (só no tipo texto). */
export function conteudoParaApi(c: ConteudoEscolhido, texto: string): Record<string, unknown> {
  if (c.kind === "template") {
    return {
      content_kind: "template",
      template_name: c.templateName,
      template_language: c.templateLanguage,
      template_values: c.templateValues,
      // A prévia do modelo vai em `message_body`: é o que a conversa mostra.
      message_body: c.templatePreview || c.templateName,
      flow_pointer_id: null,
    };
  }
  if (c.kind === "flow") {
    return { content_kind: "flow", flow_pointer_id: c.flowPointerId, template_name: null, template_language: null, template_values: {}, message_body: null };
  }
  return { content_kind: "text", message_body: texto.trim(), template_name: null, template_language: null, template_values: {}, flow_pointer_id: null };
}

/**
 * O que a campanha manda: texto, modelo aprovado ou fluxo.
 *
 * O bloco de TEXTO é de quem usa este componente (`children`), porque os dois
 * formulários já tinham o seu, com as variáveis e a contagem. Aqui moram a
 * escolha do tipo e os dois tipos novos.
 */
export function ConteudoDaCampanha({
  valor,
  onChange,
  provider,
  children,
}: {
  valor: ConteudoEscolhido;
  onChange: (proximo: ConteudoEscolhido) => void;
  /** O canal do número PRINCIPAL — decide de onde vêm os modelos. A tela não interpreta o valor. */
  provider: string | null;
  children: React.ReactNode;
}) {
  const t = useT();
  const fonte = fonteDeTemplates(provider);

  const modelos = useQuery({
    queryKey: ["templates-da-campanha", fonte],
    enabled: valor.kind === "template" && fonte !== null,
    queryFn: async () => apiClient.get<{ data: { templates: ModeloAprovado[] } }>(rotaDeTemplates(fonte!)),
    staleTime: 30_000,
  });
  const aprovados = useMemo(
    () => (modelos.data?.data.templates ?? []).filter((m) => m.status?.toUpperCase() === "APPROVED"),
    [modelos.data],
  );
  const atual = aprovados.find((m) => m.name === valor.templateName && m.language === valor.templateLanguage) ?? null;
  const slots = atual?.slots ?? [];

  const fluxos = useQuery({
    queryKey: ["fluxos-para-campanha"],
    enabled: valor.kind === "flow",
    queryFn: async () => apiClient.get<{ data: { id: string; name: string; status: string }[] }>("/api/v1/ai/followup-flows"),
    staleTime: 30_000,
  });
  const fluxoEscolhido = (fluxos.data?.data ?? []).find((f) => f.id === valor.flowPointerId) ?? null;

  function escolherModelo(chave: string) {
    const m = aprovados.find((x) => `${x.name}|${x.language}` === chave);
    onChange({
      ...valor,
      templateName: m?.name ?? "",
      templateLanguage: m?.language ?? "",
      templateValues: { ...(m?.savedValues ?? {}) },
      templatePreview: m ? lerConteudo(m.components ?? []).body?.trim() || m.name : "",
    });
  }

  const OPCOES: { kind: TipoDeConteudo; titulo: string; explica: string }[] = [
    { kind: "text", titulo: "Mensagem de texto", explica: "Um texto com o nome da pessoa. Bom para números conectados por QR code." },
    { kind: "template", titulo: "Modelo aprovado (API oficial)", explica: "O único jeito de a API oficial falar com quem não escreveu nas últimas 24 horas." },
    { kind: "flow", titulo: "Iniciar um fluxo", explica: "A pessoa entra num fluxo publicado: imagens, botões, perguntas e sequência ficam por conta dele." },
  ];

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("O que esta campanha manda")}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {OPCOES.map((o) => (
            <label
              key={o.kind}
              className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm ${valor.kind === o.kind ? "border-primary bg-primary/5" : ""}`}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="tipo-de-conteudo"
                  checked={valor.kind === o.kind}
                  onChange={() => onChange({ ...valor, kind: o.kind })}
                  data-testid={`conteudo-${o.kind}`}
                />
                {t(o.titulo)}
              </span>
              <span className="text-xs text-muted-foreground">{t(o.explica)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {valor.kind === "text" && children}

      {valor.kind === "template" && (
        <div className="space-y-3">
          {fonte === null ? (
            <p className="text-sm text-amber-700 dark:text-amber-500">
              {t("O número escolhido não trabalha com modelo aprovado. Escolha um número da API oficial, ou mude o conteúdo para texto ou fluxo.")}
            </p>
          ) : modelos.isPending ? (
            <p className="text-sm text-muted-foreground">{t("Carregando os modelos…")}</p>
          ) : aprovados.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("Nenhum modelo aprovado nesta conta. Crie e aprove um modelo em Conexões antes de montar a campanha.")}
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="modelo-da-campanha">{t("Modelo aprovado")}</Label>
              <select
                id="modelo-da-campanha"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={atual ? `${atual.name}|${atual.language}` : ""}
                onChange={(e) => escolherModelo(e.target.value)}
              >
                <option value="">{t("Escolha um modelo")}</option>
                {aprovados.map((m) => (
                  <option key={`${m.name}|${m.language}`} value={`${m.name}|${m.language}`}>
                    {m.name} · {m.language}
                  </option>
                ))}
              </select>
            </div>
          )}

          {atual && (
            <>
              <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">{valor.templatePreview}</p>
              {slots.map((s) => (
                <div key={s.valueKey} className="space-y-1.5">
                  <Label htmlFor={`slot-${s.valueKey}`}>
                    {t(s.onde)} · {`{{${s.key}}}`}
                  </Label>
                  <Input
                    id={`slot-${s.valueKey}`}
                    value={valor.templateValues[s.valueKey] ?? ""}
                    onChange={(e) => onChange({ ...valor, templateValues: { ...valor.templateValues, [s.valueKey]: e.target.value } })}
                  />
                </div>
              ))}
              {slots.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("Nos espaços do modelo você pode usar {{nome}} para o nome de cada pessoa.")}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {valor.kind === "flow" && (
        <div className="space-y-1.5">
          <Label htmlFor="fluxo-da-campanha">{t("Fluxo")}</Label>
          {fluxos.isPending ? (
            <p className="text-sm text-muted-foreground">{t("Carregando os fluxos…")}</p>
          ) : (
            <select
              id="fluxo-da-campanha"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={valor.flowPointerId}
              onChange={(e) => onChange({ ...valor, flowPointerId: e.target.value })}
            >
              <option value="">{t("Escolha um fluxo")}</option>
              {(fluxos.data?.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.status !== "active" ? ` — ${t("não publicado")}` : ""}
                </option>
              ))}
            </select>
          )}
          {fluxoEscolhido && fluxoEscolhido.status !== "active" && (
            <p className="text-sm text-amber-700 dark:text-amber-500">
              {t("Este fluxo ainda não está publicado. Publique-o antes de iniciar a campanha, senão ninguém entra nele.")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t("Cada pessoa do público entra no fluxo pelo número que a campanha escolher. Quem já está em outro fluxo ativo não entra neste.")}
          </p>
        </div>
      )}
    </div>
  );
}

/** Quantos espaços o modelo escolhido tem — para o formulário saber se pode salvar. */
export function useEspacosDoModelo(valor: ConteudoEscolhido, provider: string | null): number {
  const fonte = fonteDeTemplates(provider);
  const modelos = useQuery({
    queryKey: ["templates-da-campanha", fonte],
    enabled: valor.kind === "template" && fonte !== null,
    queryFn: async () => apiClient.get<{ data: { templates: ModeloAprovado[] } }>(rotaDeTemplates(fonte!)),
    staleTime: 30_000,
  });
  const atual = (modelos.data?.data.templates ?? []).find((m) => m.name === valor.templateName && m.language === valor.templateLanguage);
  return atual?.slots?.length ?? 0;
}
