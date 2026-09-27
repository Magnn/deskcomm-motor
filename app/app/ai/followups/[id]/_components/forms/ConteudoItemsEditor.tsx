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
  "document",
  "contact",
  "delay",
];

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

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const Icon = ICONE_DO_TIPO[item.type];
        return (
          <div
            key={i}
            className="rounded-md border border-border bg-surface p-3"
            data-testid={`conteudo-item-${i}`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-text">
                <Icon size={16} aria-hidden />
                {t(TIPOS_DE_ITEM_DE_CONTEUDO[item.type])}
                {EM_CONSTRUCAO.has(item.type) ? (
                  <span
                    className="flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-xs font-normal text-warning-fg"
                    title={t("O envio deste tipo ainda não está pronto — o publish vai recusar este item.")}
                  >
                    <Warning size={12} aria-hidden />
                    {t("em breve")}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
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
                  variant="ghost"
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
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-error-fg"
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
        );
      })}

      {items.length < MAX_CONTEUDO_ITEMS && !disabled ? (
        <div className="flex flex-wrap gap-1.5">
          {TIPOS_PARA_ADICIONAR.map((tipo) => {
            const Icon = ICONE_DO_TIPO[tipo];
            return (
              <Button
                key={tipo}
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => adicionar(tipo)}
              >
                <Icon size={14} aria-hidden />
                {t(TIPOS_DE_ITEM_DE_CONTEUDO[tipo])}
                {EM_CONSTRUCAO.has(tipo) ? <span className="text-text-muted">({t("em breve")})</span> : null}
              </Button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-text-muted">{t("Até")} {MAX_CONTEUDO_ITEMS} {t("itens por nó.")}</p>
      )}
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
