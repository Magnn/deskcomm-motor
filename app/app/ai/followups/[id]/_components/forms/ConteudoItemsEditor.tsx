"use client";
/**
 * Editor de itens do nó "Conteúdo" no padrão visual da referência Lalla.
 * Grade 2x3 de tipos no topo, divisor "Conteúdos", lista de cards
 * com controle de slider (Delay), Campos Personalizados (Texto), upload de mídia,
 * pill badges coloridos no rodapé de cada card e ações de duplicar (+) e excluir (lixeira).
 */
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUploadFlowContentMedia } from "@/hooks/ai/useUploadFlowContentMedia";
import { useT } from "@/hooks/i18n/useT";
import {
  MAX_CONTEUDO_ITEMS,
  type ConteudoItem,
  type ConteudoItemType,
} from "@/lib/followup/graph-schema";
import { TIPOS_DE_ITEM_DE_CONTEUDO_EM_CONSTRUCAO } from "@/lib/followup/validate-publish";
import {
  Clock,
  Eye,
  FileText,
  ImageIcon,
  Microphone,
  Plus,
  Trash,
  VideoCamera,
  Warning,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

const EM_CONSTRUCAO = new Set<ConteudoItemType>(TIPOS_DE_ITEM_DE_CONTEUDO_EM_CONSTRUCAO);

const GRADE_LALLA = [
  {
    type: "text" as const,
    label: "Texto",
    color: "#0284c7",
    textColor: "text-sky-600 dark:text-sky-400",
    icon: (
      <span className="flex h-5 w-5 items-center justify-center font-serif text-lg font-bold leading-none text-sky-600 dark:text-sky-400">
        T
      </span>
    ),
  },
  {
    type: "image" as const,
    label: "Imagem",
    color: "#f97316",
    textColor: "text-orange-600 dark:text-orange-400",
    icon: <ImageIcon size={20} className="text-orange-500" weight="bold" aria-hidden />,
  },
  {
    type: "audio" as const,
    label: "Áudio",
    color: "#9333ea",
    textColor: "text-purple-600 dark:text-purple-400",
    icon: <Microphone size={20} className="text-purple-600" weight="bold" aria-hidden />,
  },
  {
    type: "video" as const,
    label: "Vídeo",
    color: "#16a34a",
    textColor: "text-emerald-600 dark:text-emerald-400",
    icon: <VideoCamera size={20} className="text-emerald-600" weight="bold" aria-hidden />,
  },
  {
    type: "document" as const,
    label: "Documento",
    color: "#2563eb",
    textColor: "text-blue-600 dark:text-blue-400",
    icon: <FileText size={20} className="text-blue-600" weight="bold" aria-hidden />,
  },
  {
    type: "delay" as const,
    label: "Delay",
    color: "#e11d48",
    textColor: "text-rose-600 dark:text-rose-400",
    icon: <Clock size={20} className="text-rose-500" weight="bold" aria-hidden />,
  },
] as const;

const CAMPOS_PERSONALIZADOS = [
  { tag: "{{nome}}", label: "Nome do Contato" },
  { tag: "{{primeiro_nome}}", label: "Primeiro Nome" },
  { tag: "{{telefone}}", label: "Telefone" },
  { tag: "{{email}}", label: "E-mail" },
  { tag: "{{etapa}}", label: "Etapa Atual" },
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
      return { type: "delay", seconds: 2 };
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

  const atualizar = (i: number, item: ConteudoItem) =>
    onChange(items.map((it, idx) => (idx === i ? item : it)));

  const remover = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  const duplicar = (i: number) => {
    if (items.length >= MAX_CONTEUDO_ITEMS) return;
    const next = [...items];
    const clone = JSON.parse(JSON.stringify(items[i])) as ConteudoItem;
    next.splice(i + 1, 0, clone);
    onChange(next);
  };

  const adicionar = (type: ConteudoItemType) => {
    if (items.length >= MAX_CONTEUDO_ITEMS) return;
    onChange([...items, itemPadrao(type)]);
  };

  const atMax = items.length >= MAX_CONTEUDO_ITEMS;

  return (
    <div className="space-y-3 font-sans">
      {/* Grade 2x3 de Adicionar Tipos (estilo Lalla) */}
      {!disabled && (
        <div className="grid grid-cols-3 gap-2">
          {GRADE_LALLA.map((g) => (
            <button
              key={g.type}
              type="button"
              disabled={atMax}
              onClick={() => adicionar(g.type)}
              title={atMax ? `${t("Até")} ${MAX_CONTEUDO_ITEMS} ${t("itens.")}` : t(g.label)}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700/80 bg-neutral-50/60 dark:bg-neutral-800/40 py-2.5 px-2 transition-all select-none",
                atMax
                  ? "cursor-not-allowed opacity-40"
                  : "hover:bg-white dark:hover:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600 hover:shadow-xs active:scale-[0.98]",
              )}
            >
              {g.icon}
              <span className={cn("text-[11px] font-semibold leading-tight", g.textColor)}>
                {t(g.label)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Divisor "Conteúdos" */}
      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
        <span className="text-[11px] font-medium tracking-wide text-neutral-400 dark:text-neutral-500">
          {t("Conteúdos")}
        </span>
        <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
      </div>

      {/* Lista dos cards de Conteúdo */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center text-xs text-neutral-400">
          {t("Nenhum conteúdo adicionado. Clique nos botões acima para começar.")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item, i) => (
            <ItemCard
              key={i}
              index={i}
              flowId={flowId}
              item={item}
              disabled={disabled}
              onUpdate={(next) => atualizar(i, next)}
              onDuplicate={() => duplicar(i)}
              onRemove={() => remover(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ItemCard({
  index,
  flowId,
  item,
  disabled,
  onUpdate,
  onDuplicate,
  onRemove,
}: {
  index: number;
  flowId: string;
  item: ConteudoItem;
  disabled?: boolean;
  onUpdate: (item: ConteudoItem) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const t = useT();

  // 1. DELAY CARD
  if (item.type === "delay") {
    return (
      <div
        className="rounded-xl border border-rose-300 dark:border-rose-900/60 bg-white dark:bg-neutral-900 p-3 shadow-xs space-y-3"
        data-testid={`conteudo-item-${index}`}
      >
        <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
          {t("Delay")} ({item.seconds} {t("segundos")})
        </div>

        <div className="flex items-center gap-3 px-1 py-1">
          <input
            type="range"
            min={1}
            max={120}
            value={item.seconds}
            disabled={disabled}
            onChange={(e) => {
              const val = Math.round(Number(e.target.value));
              onUpdate({ ...item, seconds: Number.isFinite(val) ? Math.max(1, Math.min(120, val)) : 1 });
            }}
            className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-purple-600 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-neutral-100 dark:border-neutral-800">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500 text-white shadow-xs">
            <Clock size={11} weight="bold" aria-hidden />
            {t("Delay")}
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDuplicate}
              disabled={disabled}
              title={t("Duplicar")}
              className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
            >
              <Plus size={15} weight="bold" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              title={t("Remover")}
              className="p-1 text-rose-500 hover:text-rose-700 transition-colors"
            >
              <Trash size={15} weight="bold" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. TEXTO CARD
  if (item.type === "text") {
    return (
      <div
        className="rounded-xl border border-sky-300 dark:border-sky-900/60 bg-white dark:bg-neutral-900 p-3 shadow-xs space-y-2.5"
        data-testid={`conteudo-item-${index}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            {t("Texto a ser enviado")}
          </span>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:underline focus:outline-none"
              >
                <Eye size={13} aria-hidden />
                {t("Campos Personalizados")}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2 space-y-1">
              <p className="text-[10px] font-bold text-neutral-400 uppercase px-2 py-1">
                {t("Inserir variável")}
              </p>
              {CAMPOS_PERSONALIZADOS.map((c) => (
                <button
                  key={c.tag}
                  type="button"
                  onClick={() => {
                    const current = item.body;
                    const next = current ? `${current} ${c.tag}` : c.tag;
                    onUpdate({ ...item, body: next });
                  }}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors text-left"
                >
                  <span>{c.label}</span>
                  <code className="text-[10px] text-sky-600 bg-sky-50 dark:bg-sky-950/60 px-1 py-0.5 rounded">
                    {c.tag}
                  </code>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        <Textarea
          rows={3}
          maxLength={4000}
          placeholder={t("Digite a mensagem...")}
          value={item.body}
          disabled={disabled}
          onChange={(e) => onUpdate({ ...item, body: e.target.value })}
          className="w-full text-xs text-neutral-800 dark:text-neutral-100 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/40 p-2.5 resize-none focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
        />

        <div className="flex items-center justify-between pt-1 border-t border-neutral-100 dark:border-neutral-800">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-sky-600 text-white shadow-xs">
            <span className="font-serif font-bold text-xs leading-none">T</span>
            {t("Texto")}
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDuplicate}
              disabled={disabled}
              title={t("Duplicar")}
              className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
            >
              <Plus size={15} weight="bold" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              title={t("Remover")}
              className="p-1 text-rose-500 hover:text-rose-700 transition-colors"
            >
              <Trash size={15} weight="bold" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. MEDIA CARDS (image | video | audio | document)
  const isMedia =
    item.type === "image" ||
    item.type === "video" ||
    item.type === "audio" ||
    item.type === "document";

  if (isMedia) {
    const configMap = {
      image: { label: "Imagem", border: "border-orange-300 dark:border-orange-900/60", badgeBg: "bg-orange-500", Icon: ImageIcon },
      video: { label: "Vídeo", border: "border-emerald-300 dark:border-emerald-900/60", badgeBg: "bg-emerald-600", Icon: VideoCamera },
      audio: { label: "Áudio", border: "border-purple-300 dark:border-purple-900/60", badgeBg: "bg-purple-600", Icon: Microphone },
      document: { label: "Documento", border: "border-blue-300 dark:border-blue-900/60", badgeBg: "bg-blue-600", Icon: FileText },
    }[item.type];

    const Icon = configMap.Icon;

    return (
      <div
        className={cn("rounded-xl border bg-white dark:bg-neutral-900 p-3 shadow-xs space-y-2.5", configMap.border)}
        data-testid={`conteudo-item-${index}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            {t(configMap.label)}
          </span>
          {EM_CONSTRUCAO.has(item.type) && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
              <Warning size={11} aria-hidden />
              {t("em breve")}
            </span>
          )}
        </div>

        <UploadDeMidia flowId={flowId} item={item} onChange={onUpdate} disabled={disabled} />

        <div className="flex items-center justify-between pt-1 border-t border-neutral-100 dark:border-neutral-800">
          <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-white shadow-xs", configMap.badgeBg)}>
            <Icon size={11} weight="bold" aria-hidden />
            {t(configMap.label)}
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDuplicate}
              disabled={disabled}
              title={t("Duplicar")}
              className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
            >
              <Plus size={15} weight="bold" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              title={t("Remover")}
              className="p-1 text-rose-500 hover:text-rose-700 transition-colors"
            >
              <Trash size={15} weight="bold" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. CONTATO CARD
  return (
    <div
      className="rounded-xl border border-pink-300 dark:border-pink-900/60 bg-white dark:bg-neutral-900 p-3 shadow-xs space-y-2.5"
      data-testid={`conteudo-item-${index}`}
    >
      <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
        {t("Contato")}
      </div>

      <div className="grid gap-2">
        <Input
          placeholder={t("Nome do contato")}
          maxLength={120}
          value={(item as Extract<ConteudoItem, { type: "contact" }>).name}
          disabled={disabled}
          onChange={(e) => onUpdate({ ...item, name: e.target.value } as ConteudoItem)}
          className="h-8 text-xs"
        />
        <Input
          placeholder={t("Telefone com DDI (+55...)")}
          maxLength={40}
          value={(item as Extract<ConteudoItem, { type: "contact" }>).phone_number}
          disabled={disabled}
          onChange={(e) => onUpdate({ ...item, phone_number: e.target.value } as ConteudoItem)}
          className="h-8 text-xs"
        />
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-neutral-100 dark:border-neutral-800">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-pink-600 text-white shadow-xs">
          {t("Contato")}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDuplicate}
            disabled={disabled}
            title={t("Duplicar")}
            className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
          >
            <Plus size={15} weight="bold" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            title={t("Remover")}
            className="p-1 text-rose-500 hover:text-rose-700 transition-colors"
          >
            <Trash size={15} weight="bold" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
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
      // showApiError já tratou o toast
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
          className="h-8 text-xs font-medium"
        >
          {upload.isPending
            ? t("Enviando…")
            : temArquivo
              ? t("Trocar arquivo")
              : t("Escolher arquivo")}
        </Button>
        <span className={cn("truncate text-xs", temArquivo ? "text-neutral-800 dark:text-neutral-200" : "text-neutral-400")}>
          {temArquivo
            ? item.type === "document"
              ? item.filename ?? item.mime
              : item.mime
            : t("Nenhum arquivo")}
        </span>
      </div>
      {(item.type === "image" || item.type === "video" || item.type === "document") && (
        <Input
          placeholder={t("Legenda (opcional)")}
          maxLength={1024}
          value={item.caption ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...item, caption: e.target.value || undefined } as ConteudoItem)}
          className="h-8 text-xs"
        />
      )}
    </div>
  );
}
