"use client";
/**
 * O editor de itens do modo `content` do nó Ação ("Conteúdo"): uma lista
 * ORDENADA de texto/mídia/contato/pausa, cada item com seu próprio card.
 *
 * Reordenar é por BOTÃO (cima/baixo), não arrastar — mesmo resultado
 * (mudar a ordem), bem mais simples de fazer acessível e sem depender de uma
 * biblioteca de drag-and-drop só para isto. Trocar por arrastar depois não
 * pede mudança de schema, só de interação.
 *
 * Upload de mídia é POR FLUXO (`useUploadFlowContentMedia`), não por
 * conversa: o arquivo existe antes de qualquer conversa acionar este fluxo.
 */
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUploadFlowContentMedia } from "@/hooks/ai/useUploadFlowContentMedia";
import { useT } from "@/hooks/i18n/useT";
import {
  MAX_CONTEUDO_ITEMS,
  type ConteudoItem,
  type ConteudoItemType,
} from "@/lib/followup/graph-schema";
import { TIPOS_DE_ITEM_DE_CONTEUDO_EM_CONSTRUCAO } from "@/lib/followup/validate-publish";
import { TIPOS_DE_ITEM_DE_CONTEUDO } from "@/lib/followup/vocabulario";
import { CaretDown, CaretUp, Trash, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { ICONES_DE_ITEM_DE_CONTEUDO as ICONE_DO_TIPO } from "../nodes/nodeVisuals";

const EM_CONSTRUCAO = new Set<ConteudoItemType>(TIPOS_DE_ITEM_DE_CONTEUDO_EM_CONSTRUCAO);

const TIPOS_PARA_ADICIONAR: readonly ConteudoItemType[] = [
  "text",
  "image",
  "video",
  "audio",
  "delay",
  "contact",
  "document",
];

/**
 * Uma cor por tipo de item — mesma ideia do `HUES` de `nodeVisuals.ts`, um
 * degrau mais fundo (item DENTRO do nó Conteúdo, não o nó). A faixa lateral
 * colorida é o que faz uma lista de 5 itens ler-se "de relance" — sem ela,
 * cinco cards brancos empilhados são indistinguíveis até alguém ler o rótulo
 * de cada um. Inspirado no `CardList` da AcassIA, ver
 * [[acassia-frontend-fluxos-e-agente]].
 */
/**
 * "Áudio (nota de voz)" não cabe numa coluna de grade (17 chars num botão de
 * ~70px) — quebrava em 3 linhas e vazava por cima do botão vizinho, MEDIDO
 * (`evidence/_visual-proof-redesign/01b-grade-de-tipos.png`, sessão da
 * prova visual do redesenho). O rótulo completo continua no seletor de modo e
 * no cabeçalho de cada item da lista (`TIPOS_DE_ITEM_DE_CONTEUDO`) — só o
 * BOTÃO da grade, que é ícone + uma palavra, ganha o rótulo curto.
 */
const ROTULO_CURTO_DA_GRADE: Partial<Record<ConteudoItemType, string>> = { audio: "Áudio" };

const COR_DO_ITEM: Record<ConteudoItemType, { faixa: string; chip: string }> = {
  text: { faixa: "bg-blue-500", chip: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  image: { faixa: "bg-emerald-500", chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  video: { faixa: "bg-violet-500", chip: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  audio: { faixa: "bg-orange-500", chip: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  document: { faixa: "bg-indigo-500", chip: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
  contact: { faixa: "bg-pink-500", chip: "bg-pink-500/10 text-pink-600 dark:text-pink-400" },
  delay: { faixa: "bg-cyan-500", chip: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" },
};

function itemPadrao(type: ConteudoItemType): ConteudoItem {
  switch (type) {
    case "text":
      return { type: "text", body: "" };
    case "image":
      return { type: "image", storage_path: "", mime: "" };
    case "video":
      return { type: "video", storage_path: "", mime: "" };
    case "audio":
      return { type: "audio", storage_path: "", mime: "" };
    case "document":
      return { type: "document", storage_path: "", mime: "" };
    case "contact":
      return { type: "contact", name: "", phone_number: "" };
    case "delay":
      return { type: "delay", seconds: 3 };
  }
}

interface Props {
  flowId: string;
  items: ConteudoItem[];
  onChange: (items: ConteudoItem[]) => void;
  disabled?: boolean;
}

export function ConteudoItemsEditor({ flowId, items, onChange, disabled }: Props) {
  const t = useT();

  const atualizar = (i: number, item: ConteudoItem) => onChange(items.map((it, idx) => (idx === i ? item : it)));
  const remover = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
    onChange(next);
  };
  const adicionar = (type: ConteudoItemType) => {
    if (items.length >= MAX_CONTEUDO_ITEMS) return;
    onChange([...items, itemPadrao(type)]);
  };

  const atMax = items.length >= MAX_CONTEUDO_ITEMS;

  return (
    <div className="space-y-3">
      {/* Grade de cards de adicionar — um clique por tipo, sem menu escondido.
          Fica no TOPO (como no editor da AcassIA) porque é o que se usa mais vezes
          numa sessão de edição: montar a sequência item a item. Card com ícone em
          círculo colorido + rótulo embaixo, não botão de barra — mesmo padrão
          visual do "Adicionar Conteúdo" da AcassIA, ver
          [[acassia-frontend-fluxos-e-agente]]. */}
      {!disabled && (
        <div className="grid grid-cols-4 gap-2">
          {TIPOS_PARA_ADICIONAR.map((tipo) => {
            const Icon = ICONE_DO_TIPO[tipo];
            const cor = COR_DO_ITEM[tipo];
            return (
              <button
                key={tipo}
                type="button"
                disabled={atMax}
                onClick={() => adicionar(tipo)}
                title={
                  atMax
                    ? `${t("Até")} ${MAX_CONTEUDO_ITEMS} ${t("itens por nó.")}`
                    : t(TIPOS_DE_ITEM_DE_CONTEUDO[tipo])
                }
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface px-1 py-3.5 transition-all",
                  atMax
                    ? "cursor-not-allowed opacity-40"
                    : "hover:-translate-y-px hover:border-solid hover:border-border-strong hover:bg-surface-elevated hover:shadow-sm",
                )}
              >
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", cor.chip)}>
                  <Icon size={18} aria-hidden />
                </span>
                <span className="truncate text-[11px] font-medium text-text">
                  {t(ROTULO_CURTO_DA_GRADE[tipo] ?? TIPOS_DE_ITEM_DE_CONTEUDO[tipo])}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-full bg-accent px-4 py-2.5 text-center text-xs font-semibold text-accent-foreground">
          {t("Nenhum item ainda — escolha um tipo acima para começar.")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item, i) => {
            const cor = COR_DO_ITEM[item.type];
            return (
              <div
                key={i}
                className="relative overflow-hidden rounded-xl border border-border/70 bg-surface pl-4 shadow-sm"
                data-testid={`conteudo-item-${i}`}
              >
                <span aria-hidden className={cn("absolute top-1.5 bottom-1.5 left-0 w-1 rounded-full", cor.faixa)} />
                <div className="p-3">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold tracking-wide text-text-muted uppercase">
                      {t(TIPOS_DE_ITEM_DE_CONTEUDO[item.type])} · {i + 1}
                      {EM_CONSTRUCAO.has(item.type) ? (
                        <span
                          className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[10px] font-normal normal-case text-warning-fg"
                          title={t("O envio deste tipo ainda não está pronto — o publish vai recusar este item.")}
                        >
                          <Warning size={11} aria-hidden />
                          {t("em breve")}
                        </span>
                      ) : null}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={disabled || i === 0}
                        onClick={() => mover(i, -1)}
                        aria-label={t("Mover para cima")}
                      >
                        <CaretUp size={14} aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={disabled || i === items.length - 1}
                        onClick={() => mover(i, 1)}
                        aria-label={t("Mover para baixo")}
                      >
                        <CaretDown size={14} aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 hover:border-error/50 hover:bg-error-bg hover:text-error-fg"
                        disabled={disabled}
                        onClick={() => remover(i)}
                        aria-label={t("Remover item")}
                      >
                        <Trash size={14} aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <ItemFields flowId={flowId} item={item} onChange={(next) => atualizar(i, next)} disabled={disabled} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-[11px] text-text-subtle">
        {items.length} / {MAX_CONTEUDO_ITEMS} {t("itens por nó.")}
      </p>
    </div>
  );
}

function ItemFields({
  flowId,
  item,
  onChange,
  disabled,
}: {
  flowId: string;
  item: ConteudoItem;
  onChange: (item: ConteudoItem) => void;
  disabled?: boolean;
}) {
  const t = useT();

  if (item.type === "text") {
    return (
      <Textarea
        rows={3}
        maxLength={4000}
        placeholder={t("O que este balão diz")}
        value={item.body}
        disabled={disabled}
        onChange={(e) => onChange({ ...item, body: e.target.value })}
      />
    );
  }

  if (item.type === "delay") {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={120}
          className="w-24"
          value={item.seconds}
          disabled={disabled}
          onChange={(e) => {
            const n = Math.round(Number(e.target.value));
            onChange({ ...item, seconds: Number.isFinite(n) ? Math.max(1, Math.min(120, n)) : 1 });
          }}
        />
        <span className="text-sm text-text-muted">{t("segundos (1 a 120) — pausa antes do próximo item")}</span>
      </div>
    );
  }

  if (item.type === "contact") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder={t("Nome")}
          maxLength={120}
          value={item.name}
          disabled={disabled}
          onChange={(e) => onChange({ ...item, name: e.target.value })}
        />
        <Input
          placeholder={t("Telefone, com DDI (ex.: +5511999998888)")}
          maxLength={40}
          value={item.phone_number}
          disabled={disabled}
          onChange={(e) => onChange({ ...item, phone_number: e.target.value })}
        />
      </div>
    );
  }

  // image | video | audio | document — mídia enviada pro Storage do fluxo.
  return <UploadDeMidia flowId={flowId} item={item} onChange={onChange} disabled={disabled} />;
}

function UploadDeMidia({
  flowId,
  item,
  onChange,
  disabled,
}: {
  flowId: string;
  item: Extract<ConteudoItem, { type: "image" | "video" | "audio" | "document" }>;
  onChange: (item: ConteudoItem) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const upload = useUploadFlowContentMedia();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const inputId = React.useId();
  const temArquivo = item.storage_path.trim() !== "";

  const escolherArquivo = async (file: File) => {
    try {
      const r = await upload.mutateAsync({ flowId, file });
      const base = { ...item, storage_path: r.storage_path, mime: r.media_mime };
      onChange(item.type === "document" ? ({ ...base, filename: file.name } as ConteudoItem) : (base as ConteudoItem));
    } catch {
      // showApiError já mostrou o toast no onError do hook.
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="hidden"
        disabled={disabled || upload.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void escolherArquivo(file);
        }}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending
            ? t("Enviando…")
            : temArquivo
              ? t("Trocar arquivo")
              : t("Escolher arquivo")}
        </Button>
        <span className={cn("truncate text-xs", temArquivo ? "text-text" : "text-text-muted")}>
          {temArquivo ? (item.type === "document" ? (item.filename ?? item.mime) : item.mime) : t("Nenhum arquivo ainda")}
        </span>
      </div>
      {item.type === "image" || item.type === "video" || item.type === "document" ? (
        <Input
          placeholder={t("Legenda (opcional)")}
          maxLength={1024}
          value={item.caption ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...item, caption: e.target.value || undefined } as ConteudoItem)}
        />
      ) : null}
    </div>
  );
}
