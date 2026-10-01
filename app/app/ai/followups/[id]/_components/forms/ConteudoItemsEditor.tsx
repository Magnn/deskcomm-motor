"use client";
/**
 * Editor de itens do nó "Conteúdo" com paridade visual 100% fiel ao AcassIA / Lalla.
 * Grade 3x2 de botões com gradientes sutis e inset highlight,
 * divisor "Conteúdos", pill badge azul de estado vazio,
 * cards com faixa colorida lateral, barra de ferramentas superior (Mover/Duplicar/Excluir),
 * upload zone com limites oficiais e controles refinados.
 */
import * as React from "react";
import { CloudUpload, Image as LucideImage, Move, Video as LucideVideo } from "lucide-react";

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
  Gear,
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
  border: "border-[#3b82f6] dark:border-blue-700",
};

const TYPE_COLORS: Record<string, { btnText: string; btnIcon: string; strip: string; border: string }> = {
  text:     { btnText: "text-[#2563eb]", btnIcon: "text-[#2563eb]", strip: "bg-[#3b82f6]", border: "border-[#3b82f6] dark:border-blue-700" },
  image:    { btnText: "text-[#ea580c]", btnIcon: "text-[#ea580c]", strip: "bg-[#f97316]", border: "border-[#f97316] dark:border-orange-600" },
  audio:    { btnText: "text-[#9333ea]", btnIcon: "text-[#9333ea]", strip: "bg-[#a855f7]", border: "border-[#a855f7] dark:border-purple-600" },
  video:    { btnText: "text-[#16a34a]", btnIcon: "text-[#16a34a]", strip: "bg-[#22c55e]", border: "border-[#22c55e] dark:border-green-600" },
  document: { btnText: "text-[#1e3a8a]", btnIcon: "text-[#1e40af]", strip: "bg-[#3b82f6]", border: "border-[#3b82f6] dark:border-blue-700" },
  delay:    { btnText: "text-[#db2777]", btnIcon: "text-[#e11d48]", strip: "bg-[#ec4899]", border: "border-[#f43f5e] dark:border-pink-600" },
  contact:  { btnText: "text-[#db2777]", btnIcon: "text-[#db2777]", strip: "bg-[#ec4899]", border: "border-[#ec4899] dark:border-pink-600" },
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
        "relative rounded-xl border bg-white dark:bg-zinc-900 overflow-hidden shadow-xs transition-all duration-200",
        tc.border,
      )}
      style={{ padding: "12px 14px" }}
      data-testid={`conteudo-item-${index}`}
    >
      {/* Top Header: apenas para Texto, Delay e Contato */}
      {(item.type === "text" || item.type === "delay" || item.type === "contact") && (
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-[12px] font-bold text-slate-800 dark:text-zinc-100">
            {item.type === "text"
              ? t("Texto a ser enviado")
              : item.type === "delay"
                ? `${t("Delay")} (${item.seconds} ${t("segundos")})`
                : labelPorTipo(item.type)}
          </span>

          {item.type === "text" && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:underline focus:outline-hidden cursor-pointer"
                >
                  <Gear size={13} aria-hidden />
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
                    className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors text-left cursor-pointer"
                  >
                    <span>{c.label}</span>
                    <code className="text-[10px] text-sky-600 bg-sky-50 dark:bg-sky-950/60 px-1 py-0.5 rounded-md">
                      {c.tag}
                    </code>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}

      {/* Card Content body */}
      {item.type === "text" && (
        <div>
          <textarea
            value={item.body}
            disabled={disabled}
            onChange={(e) => onUpdate({ ...item, body: e.target.value })}
            rows={4}
            placeholder={t("Digite seu texto aqui")}
            className="w-full rounded-[10px] border border-[#e2e8f0] dark:border-zinc-800 bg-[#f8fafc] dark:bg-zinc-950 px-2.5 py-2 text-[13px] text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-hidden focus:border-[#2563eb] focus:bg-white dark:focus:bg-zinc-900 transition-colors resize-y min-h-[88px] max-h-[260px] leading-[1.45]"
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-[10px] text-[#94a3b8]">
              Use <code className="bg-[#f1f5f9] dark:bg-zinc-800 px-1 rounded-md text-[9px] font-mono">{"{{variavel}}"}</code> {t("para inserir variáveis.")}
            </p>
          </div>
        </div>
      )}

      {item.type === "delay" && (
        <div className="flex flex-col gap-2 py-1">
          <input
            type="range"
            min={1}
            max={120}
            step={1}
            value={item.seconds}
            disabled={disabled}
            onChange={(e) => onUpdate({ ...item, seconds: Number(e.target.value) })}
            className="w-full cursor-pointer accent-[#9333ea]"
          />
        </div>
      )}

      {item.type === "audio" && (
        <AudioCardBody
          flowId={flowId}
          item={item}
          disabled={disabled}
          onChange={onUpdate}
        />
      )}

      {(item.type === "image" || item.type === "video" || item.type === "document") && (
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
            className="h-8 text-xs rounded-md"
          />
          <Input
            placeholder={t("Telefone com DDI (+55...)")}
            maxLength={40}
            value={item.phone_number}
            disabled={disabled}
            onChange={(e) => onUpdate({ ...item, phone_number: e.target.value })}
            className="h-8 text-xs rounded-md"
          />
        </div>
      )}

      {/* Bottom Footer: Pill + Action buttons */}
      <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-slate-100 dark:border-zinc-800/80">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-bold text-white shadow-2xs",
            item.type === "text" && "bg-[#0284c7]",
            item.type === "delay" && "bg-[#e11d48]",
            item.type === "audio" && "bg-[#9333ea]",
            item.type === "image" && "bg-[#ea580c]",
            item.type === "video" && "bg-[#16a34a]",
            item.type === "document" && "bg-[#1d4ed8]",
            item.type === "contact" && "bg-[#ec4899]",
          )}
        >
          {item.type === "text" && <span className="font-serif font-bold text-xs leading-none">T</span>}
          {item.type === "delay" && <Clock size={12} className="text-white" />}
          {item.type === "audio" && <Microphone size={12} className="text-white" />}
          {item.type === "image" && <ImageIcon size={12} className="text-white" />}
          {item.type === "video" && <VideoCamera size={12} className="text-white" />}
          {item.type === "document" && <FileText size={12} className="text-white" />}
          <span>{item.type === "video" ? "Video" : labelPorTipo(item.type)}</span>
        </span>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onDuplicate}
            disabled={disabled}
            className="w-6 h-6 rounded-md border border-[#e2e8f0] dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-[#6366f1] hover:bg-[#f1f5f9] dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors cursor-pointer"
            title={t("Duplicar / Mover")}
          >
            <Move size={13} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="w-6 h-6 rounded-md border border-[#e2e8f0] dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-rose-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-30 transition-colors cursor-pointer"
            title={t("Remover")}
          >
            <Trash size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AudioCardBody({
  flowId,
  item,
  disabled,
  onChange,
}: {
  flowId: string;
  item: Extract<ConteudoItem, { type: "audio" }>;
  disabled?: boolean;
  onChange: (c: ConteudoItem) => void;
}) {
  const t = useT();
  const upload = useUploadFlowContentMedia();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [enviarComoGravado, setEnviarComoGravado] = React.useState(true);
  const [transcricao, setTranscricao] = React.useState("");

  const onPick = async (file: File) => {
    try {
      const r = await upload.mutateAsync({ flowId, file });
      onChange({ ...item, storage_path: r.storage_path, mime: r.media_mime });
    } catch {
      // tratado pelo hook
    }
  };

  const temArquivo = item.storage_path.trim() !== "";
  const audioSrc = temArquivo ? `/api/v1/messages/media?path=${encodeURIComponent(item.storage_path)}` : undefined;

  return (
    <div className="space-y-2.5">
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        disabled={disabled || upload.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onPick(file);
        }}
      />

      {/* Player de áudio estilo AcassIA */}
      <div className="flex items-center gap-2 p-1.5 rounded-lg border border-[#e2e8f0] dark:border-zinc-800 bg-[#f8fafc] dark:bg-zinc-950">
        <audio controls className="w-full h-8 accent-[#9333ea]" src={audioSrc} preload="none">
          <track kind="captions" />
        </audio>
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-400 dark:text-zinc-500">
          {temArquivo ? t("Áudio pronto") : t("Nenhum arquivo enviado")}
        </span>
        <button
          type="button"
          disabled={disabled || upload.isPending}
          onClick={() => inputRef.current?.click()}
          className="font-semibold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer disabled:opacity-50"
        >
          {upload.isPending ? t("Enviando…") : temArquivo ? t("Trocar áudio") : t("Enviar áudio")}
        </button>
      </div>

      {/* Switch: Enviar como áudio gravado? */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[12px] font-medium text-slate-700 dark:text-zinc-300">
          {t("Enviar como áudio gravado?")}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enviarComoGravado}
          disabled={disabled}
          onClick={() => setEnviarComoGravado(!enviarComoGravado)}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
            enviarComoGravado ? "bg-[#9333ea]" : "bg-slate-300 dark:bg-zinc-700",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out",
              enviarComoGravado ? "translate-x-4" : "translate-x-0",
            )}
          />
        </button>
      </div>

      {/* Seção Transcrição */}
      <div className="space-y-1 pt-1">
        <label className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200 block">
          {t("Transcrição")}
        </label>
        <textarea
          rows={2}
          value={transcricao}
          disabled={disabled}
          onChange={(e) => setTranscricao(e.target.value)}
          placeholder={t("A transcrição do áudio aparecerá aqui")}
          className="w-full rounded-[10px] border border-[#e2e8f0] dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2.5 py-2 text-[12px] text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-hidden focus:border-[#a855f7] transition-colors resize-none leading-relaxed"
        />
      </div>
    </div>
  );
}

function MediaSection({
  flowId,
  item,
  disabled,
  onChange,
}: {
  flowId: string;
  item: Extract<ConteudoItem, { type: "image" | "video" | "document" }>;
  disabled?: boolean;
  onChange: (c: ConteudoItem) => void;
}) {
  const t = useT();
  const upload = useUploadFlowContentMedia();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const temArquivo = item.storage_path.trim() !== "";

  // Abas para Documento (Anexar | Link) e Imagem (Arquivo anexado | Campo de fluxo)
  const [docTab, setDocTab] = React.useState<"anexar" | "link">("anexar");
  const [imgTab, setImgTab] = React.useState<"anexado" | "campo">("anexado");
  const [linkUrl, setLinkUrl] = React.useState("");
  const [campoFluxo, setCampoFluxo] = React.useState("");

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

  const accept =
    item.type === "image"
      ? "image/svg+xml,image/png,image/jpeg,image/webp"
      : item.type === "video"
        ? "video/mp4,video/mkv,video/avi,video/quicktime,video/3gpp"
        : ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf";

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled || upload.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onPick(file);
        }}
      />

      {/* Segmented control para Documento (Anexar | Link) */}
      {item.type === "document" && (
        <div className="flex rounded-full bg-[#f1f5f9] dark:bg-zinc-800 p-0.5 mb-2.5">
          <button
            type="button"
            onClick={() => setDocTab("anexar")}
            className={cn(
              "flex-1 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer",
              docTab === "anexar"
                ? "bg-[#2563eb] text-white shadow-xs"
                : "text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200",
            )}
          >
            {t("Anexar")}
          </button>
          <button
            type="button"
            onClick={() => setDocTab("link")}
            className={cn(
              "flex-1 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer",
              docTab === "link"
                ? "bg-[#2563eb] text-white shadow-xs"
                : "text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200",
            )}
          >
            {t("Link")}
          </button>
        </div>
      )}

      {/* Segmented control para Imagem (Arquivo anexado | Campo de fluxo) */}
      {item.type === "image" && (
        <div className="flex rounded-full bg-[#f1f5f9] dark:bg-zinc-800 p-0.5 mb-2.5">
          <button
            type="button"
            onClick={() => setImgTab("anexado")}
            className={cn(
              "flex-1 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer",
              imgTab === "anexado"
                ? "bg-[#ea580c] text-white shadow-xs"
                : "text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200",
            )}
          >
            {t("Arquivo anexado")}
          </button>
          <button
            type="button"
            onClick={() => setImgTab("campo")}
            className={cn(
              "flex-1 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer",
              imgTab === "campo"
                ? "bg-[#ea580c] text-white shadow-xs"
                : "text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200",
            )}
          >
            {t("Campo de fluxo")}
          </button>
        </div>
      )}

      {/* Corpo do Documento com aba Link */}
      {item.type === "document" && docTab === "link" ? (
        <div className="space-y-1.5 py-1">
          <Input
            placeholder="https://…/documento.pdf"
            value={linkUrl}
            disabled={disabled}
            onChange={(e) => {
              setLinkUrl(e.target.value);
              onChange({ ...item, storage_path: e.target.value, mime: "application/pdf" });
            }}
            className="h-9 text-xs rounded-lg border-[#e2e8f0] dark:border-zinc-800 bg-[#f8fafc] dark:bg-zinc-950"
          />
          <p className="text-[10px] text-slate-400">
            {t("Insira o link público do documento que deseja enviar.")}
          </p>
        </div>
      ) : item.type === "image" && imgTab === "campo" ? (
        <div className="space-y-1.5 py-1">
          <Input
            placeholder="{{url_imagem_lead}}"
            value={campoFluxo}
            disabled={disabled}
            onChange={(e) => {
              setCampoFluxo(e.target.value);
              onChange({ ...item, storage_path: e.target.value, mime: "image/jpeg" });
            }}
            className="h-9 text-xs rounded-lg border-[#e2e8f0] dark:border-zinc-800 bg-[#f8fafc] dark:bg-zinc-950"
          />
          <p className="text-[10px] text-slate-400">
            {t("Use a variável que contém a URL da imagem.")}
          </p>
        </div>
      ) : !temArquivo ? (
        <button
          type="button"
          disabled={disabled || upload.isPending}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-1 w-full py-6 px-4",
            "border border-dashed rounded-lg bg-transparent text-[#64748b] cursor-pointer text-center",
            "transition-all hover:border-slate-400 hover:bg-slate-50/70 dark:hover:bg-zinc-900/50 border-[#cbd5e1] dark:border-zinc-700",
            upload.isPending && "opacity-50 pointer-events-none",
          )}
        >
          {item.type === "document" && (
            <>
              <CloudUpload size={38} className="text-[#94a3b8] mb-1" strokeWidth={1.5} />
              <span className="text-[13px] font-semibold text-slate-700 dark:text-zinc-200">
                {upload.isPending ? t("Enviando…") : t("Clique para enviar um documento")}
              </span>
              <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                {t("Arquivos de documentos (máx. 25 MB)")}
              </span>
            </>
          )}

          {item.type === "image" && (
            <>
              <LucideImage size={38} className="text-[#94a3b8] mb-1" strokeWidth={1.5} />
              <span className="text-[13px] font-semibold text-slate-700 dark:text-zinc-200">
                {upload.isPending ? t("Enviando…") : t("Selecionar arquivo")}
              </span>
              <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                SVG, PNG, JPG
              </span>
            </>
          )}

          {item.type === "video" && (
            <>
              <LucideVideo size={38} className="text-[#94a3b8] mb-1" strokeWidth={1.5} />
              <span className="text-[13px] font-semibold text-slate-700 dark:text-zinc-200">
                {upload.isPending ? t("Enviando…") : t("Clique para enviar um video")}
              </span>
              <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                {t("mp4,mkv,avi,mov,3gp (máx. 50 MB)")}
              </span>
            </>
          )}
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
            className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            {t("Trocar arquivo")}
          </button>
        </div>
      )}
    </div>
  );
}
