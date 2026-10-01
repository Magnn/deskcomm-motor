"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MessageTemplate } from "@/hooks/inbox/useMessageTemplates";

/** Estado do slash-menu a partir do texto do composer. Puro (testável). */
export function resolveSlash(text: string): { open: boolean; query: string } {
  if (!text.startsWith("/")) return { open: false, query: "" };
  const rest = text.slice(1);
  if (/\s/.test(rest)) return { open: false, query: "" };
  return { open: true, query: rest };
}

interface Props {
  open: boolean;
  query: string;
  templates: MessageTemplate[];
  onPick: (t: MessageTemplate) => void;
  onClose: () => void;
  activeIndex?: number;
}

export function TemplateMenu({
  open,
  query,
  templates,
  onPick,
  onClose: _onClose,
  activeIndex = 0,
}: Props) {
  const t = useT();
  const listRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    if (activeItemRef.current && typeof activeItemRef.current.scrollIntoView === "function") {
      activeItemRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [open, activeIndex]);

  if (!open) return null;
  const q = query.toLowerCase();
  const filtered = templates.filter(
    (tpl) =>
      tpl.title.toLowerCase().includes(q) ||
      (tpl.shortcut ?? "").toLowerCase().includes(q) ||
      tpl.body.toLowerCase().includes(q),
  );

  return (
    <div
      ref={listRef}
      className="absolute bottom-14 left-3 z-20 max-h-64 w-84 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
      role="listbox"
      aria-label={t("Templates de script")}
    >
      {filtered.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          {t("Nenhum template encontrado. Crie em Respostas Rápidas.")}
        </div>
      ) : (
        filtered.map((tpl, idx) => {
          const isSelected = idx === activeIndex;
          return (
            <button
              key={tpl.id}
              ref={isSelected ? activeItemRef : undefined}
              type="button"
              className={cn(
                "flex w-full flex-col items-start gap-1 rounded-md px-3 py-2 text-left transition-colors",
                isSelected ? "bg-accent/15 text-accent-foreground" : "hover:bg-muted"
              )}
              onClick={() => onPick(tpl)}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-medium">{tpl.title}</span>
                {tpl.shortcut && (
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    /{tpl.shortcut}
                  </Badge>
                )}
              </div>
              <span className="line-clamp-1 text-xs text-muted-foreground">{tpl.body}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
