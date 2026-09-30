"use client";
/**
 * Editor de itens do nó "Conteúdo" com paridade visual 100% fiel ao AcassIA / Lalla.
 * Grade 3x2 de botões com gradientes sutis e inset highlight,
 * divisor "Conteúdos", pill badge azul de estado vazio,
 * cards com faixa colorida lateral, barra de ferramentas superior (Mover/Duplicar/Excluir),
 * upload zone com limites oficiais e controles refinados.
 */
import * as React from "react";

import { Input } from "@/components/ui/input";
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
import {
  CaretDown,
  CaretUp,
  Clock,
  DotsSixVertical,
  Eye,
  FileText,
  ImageIcon,
  Microphone,
  Plus,
  Trash,
  VideoCamera,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  flowId: string;
  items: ConteudoItem[];
  onChange: (items: ConteudoItem[]) => void;
  disabled?: boolean;
}

const DEFAULT_TC = {
  btnText: "text-[#2563eb]",
  btnIcon: "text-[#2563eb]",
  strip: "bg-[#3b82f6]",
  border: "border-[rgba(37,99,235,0.28)]",
};

const TYPE_COLORS: Record<string, { btnText: string; btnIcon: string; strip: string; border: string }> = {
  text:     { btnText: "text-[#2563eb]", btnIcon: "text-[#2563eb]", strip: "bg-[#3b82f6]", border: "border-[rgba(37,99,235,0.28)]" },
  image:    { btnText: "text-[#ea580c]", btnIcon: "text-[#ea580c]", strip: "bg-[#f97316]", border: "border-[rgba(234,88,12,0.38)]" },
  audio:    { btnText: "text-[#9333ea]", btnIcon: "text-[#9333ea]", strip: "bg-[#a855f7]", border: "border-[rgba(147,51,234,0.32)]" },
  video:    { btnText: "text-[#16a34a]", btnIcon: "text-[#16a34a]", strip: "bg-[#22c55e]", border: "border-[rgba(22,163,74,0.32)]" },
  document: { btnText: "text-[#1e3a8a]", btnIcon: "text-[#1e40af]", strip: "bg-[#3b82f6]", border: "border-[rgba(59,130,246,0.35)]" },
  delay:    { btnText: "text-[#db2777]", btnIcon: "text-[#e11d48]", strip: "bg-[#ec4899]", border: "border-[rgba(236,72,153,0.38)]" },
  contact:  { btnText: "text-[#db2777]", btnIcon: "text-[#db2777]", strip: "bg-[#ec4899]", border: "border-[rgba(236,72,153,0.38)]" },
};

function labelPorTipo(t: string): string {
  const m: Record<string, string> = {
    text: "Texto",
    image: "Imagem",
    audio: "Áudio",
    video: "Vídeo",
    document: "Documento",
    delay: "Delay",
    contact: "Contato",
  };
  return m[t] || t;
}

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
      return { type: "delay", seconds: 3 };
  }
}

const ALL_KINDS: Array<{
  type: ConteudoItemType;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { type: "text", label: "Texto", Icon: ({ className }) => <span className={cn("font-serif text-[17px] font-bold leading-none", className)}>T</span> },
  { type: "image", label: "Imagem", Icon: ({ className }) => <ImageIcon size={17} className={className} /> },
  { type: "audio", label: "Áudio", Icon: ({ className }) => <Microphone size={17} className={className} /> },
  { type: "video", label: "Vídeo", Icon: ({ className }) => <VideoCamera size={17} className={className} /> },
  { type: "document", label: "Documento", Icon: ({ className }) => <FileText size={17} className={className} /> },
  { type: "delay", label: "Delay", Icon: ({ className }) => <Clock size={17} className={className} /> },
];

export function ConteudoItemsEditor({ flowId, items, onChange, disabled }: Props) {
  const t = useT();

  const atualizar = (i: number, item: ConteudoItem) =>
    onChange(items.map((it, idx) => (idx === i ? item : it)));

  const remover = (i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    onChange(next);
  };

  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    const temp = next[i];
    const target = next[j];
    if (!temp || !target) return;
    next[i] = target;
    next[j] = temp;
    onChange(next);
  };

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
    <div className="flow-content-builder font-sans">
      {/* ── Content Type Buttons — 3×2 grid (AcassIA / Lalla) ── */}
      {!disabled && (
        <div className="grid grid-cols-3 gap-2 mb-0.5">
          {ALL_KINDS.map((k) => {
            const tc = TYPE_COLORS[k.type] ?? DEFAULT_TC;
            return (
              <button
                key={k.type}
                type="button"
                disabled={atMax}
                onClick={() => adicionar(k.type)}
                className={cn(
                  "flex flex-col items-center justify-center gap-[5px] px-1.5 py-[11px]",
                  "rounded-[10px] border border-[#e8eaee] bg-[#f3f4f6]",
                  "text-[11px] font-bold cursor-pointer transition-all",
                  !atMax && "hover:bg-[#eceff2] hover:border-[#dde1e8] hover:shadow-sm hover:-translate-y-px",
                  atMax && "opacity-45 cursor-not-allowed",
                  tc.btnText,
                )}
                style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.8) inset" }}
                title={atMax ? `Limite de ${MAX_CONTEUDO_ITEMS} passos atingido.` : `Adicionar ${k.label}`}
              >
                <k.Icon className={tc.btnIcon} />
                <span>{k.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Divider "Conteúdos" ── */}
      <div className="flex items-center gap-3 mt-4 mb-2.5">
        <div className="flex-1 h-px bg-[#e2e8f0] dark:bg-zinc-800" />
        <span className="text-[11px] font-semibold text-[#94a3b8] tracking-wide">{t("Conteúdos")}</span>
        <div className="flex-1 h-px bg-[#e2e8f0] dark:bg-zinc-800" />
      </div>

      {/* ── Empty state or card list ── */}
      <div className="min-h-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl text-center bg-zinc-50/50 dark:bg-zinc-800/30 my-1">
            <p className="text-xs text-zinc-400 font-normal leading-relaxed">
              {t("Nenhum conteúdo adicionado. Clique nos botões acima para começar.")}
            </p>
          </div>
        ) : (
          <div id="flow-content-list" className="flex flex-col gap-[14px] mt-0.5">
            {items.map((item, i) => (
              <ItemCard
                key={i}
                index={i}
                total={items.length}
                flowId={flowId}
                item={item}
                disabled={disabled}
                onUpdate={(next) => atualizar(i, next)}
                onMove={(dir) => mover(i, dir)}
                onDuplicate={() => duplicar(i)}
                onRemove={() => remover(i)}
              />
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && items.length < MAX_CONTEUDO_ITEMS && (
        <p className="text-[10px] text-[#94a3b8] mt-3 text-center">
          <span className="opacity-60">{t("0–120s · pausa antes do próximo passo")}</span>
        </p>
      )}
    </div>
  );
}

function ItemCard({
  index,
  total,
  flowId,
  item,
  disabled,
  onUpdate,
  onMove,
  onDuplicate,
  onRemove,
}: {
  index: number;
  total: number;
  flowId: string;
  item: ConteudoItem;
  disabled?: boolean;
  onUpdate: (item: ConteudoItem) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const tc = TYPE_COLORS[item.type] ?? DEFAULT_TC;

  return (
    <div
      className={cn(
        "relative rounded-xl border bg-white dark:bg-zinc-900 overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition-all duration-200",
        tc.border,
      )}
      style={{ padding: "12px 12px 12px 16px" }}
      data-testid={`conteudo-item-${index}`}
    >
      {/* Color strip on left edge */}
      <div className={cn("absolute left-0 top-[6px] bottom-[6px] w-1 rounded-[4px]", tc.strip)} />

      {/* Toolbar: Badge + actions */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-flex items-center justify-center w-5 h-5 text-[#94a3b8]">
            <DotsSixVertical size={14} />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#64748b]">
            {labelPorTipo(item.type)} · {index + 1}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={disabled || index === 0}
            className="w-7 h-7 rounded-lg border border-[#e2e8f0] dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-[#64748b] hover:bg-[#f1f5f9] dark:hover:bg-zinc-800 hover:text-[#4338ca] disabled:opacity-30 transition-colors"
            title={t("Mover para cima")}
          >
            <CaretUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={disabled || index === total - 1}
            className="w-7 h-7 rounded-lg border border-[#e2e8f0] dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-[#64748b] hover:bg-[#f1f5f9] dark:hover:bg-zinc-800 hover:text-[#4338ca] disabled:opacity-30 transition-colors"
            title={t("Mover para baixo")}
          >
            <CaretDown size={14} />
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            disabled={disabled}
            className="w-7 h-7 rounded-lg border border-[#e2e8f0] dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-[#64748b] hover:bg-[#f1f5f9] dark:hover:bg-zinc-800 hover:text-[#4338ca] disabled:opacity-30 transition-colors"
            title={t("Duplicar")}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="w-7 h-7 rounded-lg border border-[#e2e8f0] dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-[#64748b] hover:text-[#e11d48] hover:border-[#fecdd3] hover:bg-[#fff1f2] dark:hover:bg-rose-950/40 disabled:opacity-30 transition-colors"
            title={t("Remover")}
          >
            <Trash size={14} />
          </button>
        </div>
      </div>

      {/* Card Content body */}
      {item.type === "text" && (
        <div>
          <textarea
            value={item.body}
            disabled={disabled}
            onChange={(e) => onUpdate({ ...item, body: e.target.value })}
            rows={4}
            placeholder={t("Digite seu texto aqui")}
            className="w-full rounded-[10px] border border-[#e2e8f0] dark:border-zinc-800 bg-[#f1f5f9] dark:bg-zinc-950 px-2.5 py-2 text-[13px] text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-hidden focus:border-[#6366f1] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.14)] focus:bg-white dark:focus:bg-zinc-900 transition-colors resize-y min-h-[88px] max-h-[260px] leading-[1.45]"
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-[10px] text-[#94a3b8]">
              Use <code className="bg-[#f1f5f9] dark:bg-zinc-800 px-1 rounded-md text-[9px] font-mono">{"{{variavel}}"}</code> para inserir variáveis.
            </p>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:underline focus:outline-hidden"
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
                    <code className="text-[10px] text-sky-600 bg-sky-50 dark:bg-sky-950/60 px-1 py-0.5 rounded-md">
                      {c.tag}
                    </code>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

      {item.type === "delay" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={120}
              value={item.seconds}
              disabled={disabled}
              onChange={(e) => {
                const val = Math.round(Number(e.target.value));
                onUpdate({ ...item, seconds: Number.isFinite(val) ? Math.max(1, Math.min(120, val)) : 1 });
              }}
              className="w-[70px] rounded-lg border border-[#e2e8f0] dark:border-zinc-800 bg-[#f1f5f9] dark:bg-zinc-950 px-2 py-1 text-[13px] text-center font-semibold text-[#475569] dark:text-zinc-200 focus:outline-hidden focus:border-[#6366f1] focus:ring-[2px] focus:ring-[rgba(99,102,241,0.14)] focus:bg-white"
            />
            <span className="text-[12px] font-medium text-[#94a3b8]">{t("segundos")}</span>
          </div>
          <input
            type="range"
            min={1}
            max={120}
            step={1}
            value={item.seconds}
            disabled={disabled}
            onChange={(e) => onUpdate({ ...item, seconds: Number(e.target.value) })}
            className="w-full"
            style={{ accentColor: "#6366f1" }}
          />
          <span className="text-[10px] text-[#94a3b8]">0–120s · pausa antes do próximo passo</span>
        </div>
      )}

      {(item.type === "image" || item.type === "video" || item.type === "audio" || item.type === "document") && (
        <MediaSection
          flowId={flowId}
          item={item}
          disabled={disabled}
          onChange={onUpdate}
        />
      )}

      {item.type === "contact" && (
        <div className="grid gap-2">
          <Input
            placeholder={t("Nome do contato")}
            maxLength={120}
            value={item.name}
            disabled={disabled}
            onChange={(e) => onUpdate({ ...item, name: e.target.value })}
            className="h-8 text-xs"
          />
          <Input
            placeholder={t("Telefone com DDI (+55...)")}
            maxLength={40}
            value={item.phone_number}
            disabled={disabled}
            onChange={(e) => onUpdate({ ...item, phone_number: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
      )}
    </div>
  );
}

const DEFAULT_UPLOAD_COPY = { title: "Clique para enviar uma imagem", formats: "JPEG, PNG (máx. 5 MB)" };

const UPLOAD_COPY: Record<string, { title: string; formats: string }> = {
  image:    { title: "Clique para enviar uma imagem", formats: "JPEG, PNG (máx. 5 MB)" },
  video:    { title: "Clique para enviar um vídeo",  formats: "MP4, 3GP (máx. 16 MB)" },
  audio:    { title: "Clique para enviar um áudio",  formats: "MP3, AAC, OGG, OPUS (máx. 16 MB)" },
  document: { title: "Clique para enviar um documento", formats: "PDF, DOC, DOCX, XLS, PPT, TXT (máx. 100 MB)" },
};

function MediaSection({
  flowId,
  item,
  disabled,
  onChange,
}: {
  flowId: string;
  item: Extract<ConteudoItem, { type: "image" | "video" | "audio" | "document" }>;
  disabled?: boolean;
  onChange: (c: ConteudoItem) => void;
}) {
  const t = useT();
  const upload = useUploadFlowContentMedia();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const temArquivo = item.storage_path.trim() !== "";
  const copy = UPLOAD_COPY[item.type] ?? DEFAULT_UPLOAD_COPY;

  const onPick = async (file: File) => {
    try {
      const r = await upload.mutateAsync({ flowId, file });
      const base = { ...item, storage_path: r.storage_path, mime: r.media_mime };
      onChange(item.type === "document" ? ({ ...base, filename: file.name } as ConteudoItem) : (base as ConteudoItem));
    } catch {
      // tratado pelo hook
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer?.files?.[0];
    if (f) void onPick(f);
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        disabled={disabled || upload.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onPick(file);
        }}
      />

      {!temArquivo ? (
        <button
          type="button"
          disabled={disabled || upload.isPending}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-2 w-full py-5 px-3.5",
            "border-2 border-dashed rounded-xl bg-[#f8fafc] dark:bg-zinc-950 text-[#64748b] cursor-pointer text-center",
            "transition-all hover:border-[#94a3b8] hover:bg-[#f1f5f9] dark:hover:bg-zinc-900 hover:text-[#475569] border-[#cbd5e1] dark:border-zinc-800",
            upload.isPending && "opacity-50 pointer-events-none",
          )}
        >
          {item.type === "image" && <ImageIcon size={28} className="opacity-90" />}
          {item.type === "video" && <VideoCamera size={28} className="opacity-90" />}
          {item.type === "audio" && <Microphone size={28} className="opacity-90" />}
          {item.type === "document" && <FileText size={28} className="opacity-90" />}
          <span className="text-[13px] font-semibold text-[#334155] dark:text-zinc-200 leading-tight">
            {upload.isPending ? t("Enviando…") : t(copy.title)}
          </span>
          <span className="text-[11px] font-medium text-[#94a3b8] tracking-wide">
            {copy.formats}
          </span>
        </button>
      ) : (
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-[#e2e8f0] dark:border-zinc-800 bg-[#f8fafc] dark:bg-zinc-950">
          <span className="truncate text-xs font-medium text-neutral-800 dark:text-neutral-200 max-w-[200px]">
            {item.type === "document" ? item.filename || item.mime : item.mime || "Arquivo enviado"}
          </span>
          <button
            type="button"
            disabled={disabled || upload.isPending}
            onClick={() => inputRef.current?.click()}
            className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t("Trocar arquivo")}
          </button>
        </div>
      )}

      {/* Voice Toggle informativo para áudio gravado (AcassIA parity) */}
      {item.type === "audio" && (
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-[#e8ecf1] dark:border-zinc-800 bg-white dark:bg-zinc-900 mt-1">
          <span className="text-[12px] font-medium text-[#334155] dark:text-zinc-300">
            {t("Enviar como áudio gravado?")}
          </span>
          <span className="text-[11px] font-semibold text-purple-600 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-full">
            {t("Sim (PTT)")}
          </span>
        </div>
      )}

      {item.type !== "audio" && (
        <Input
          placeholder={t("Legenda (opcional)")}
          maxLength={1024}
          value={(item as Extract<ConteudoItem, { caption?: string }>).caption ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...item, caption: e.target.value || undefined } as ConteudoItem)}
          className="h-8 text-xs rounded-lg border-[#e2e8f0] dark:border-zinc-800 bg-[#f8fafc] dark:bg-zinc-950"
        />
      )}
    </div>
  );
}
