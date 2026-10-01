"use client";

import { useState } from "react";
import { Sparkle, Check, X } from "@/lib/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/hooks/i18n/useT";
import { PERSONAS_PRESETS, type PersonaPreset } from "@/lib/identidade/personas";

interface Props {
  onSelectPersona: (persona: PersonaPreset) => void;
  disabled?: boolean;
}

export function CarregarPersonaDialog({ onSelectPersona, disabled }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(PERSONAS_PRESETS[0]!.id);

  const current = PERSONAS_PRESETS.find((p) => p.id === selectedId) || PERSONAS_PRESETS[0]!;

  const handleApply = () => {
    onSelectPersona(current);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 border-purple-200 bg-purple-50/70 text-purple-700 hover:bg-purple-100 hover:text-purple-800 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-300 dark:hover:bg-purple-900/40 text-xs font-semibold cursor-pointer shadow-2xs"
        >
          <Sparkle size={14} weight="fill" className="text-purple-600 dark:text-purple-400" />
          <span>{t("Carregar Persona")}</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
            <Sparkle size={20} weight="fill" />
            <DialogTitle className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              {t("Escolha uma Persona Pré-configurada")}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-neutral-500 dark:text-neutral-400">
            {t(
              "Selecione um molde de personalidade profissional. Você poderá revisar e ajustar os dados antes de salvar."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2">
          {PERSONAS_PRESETS.map((p) => {
            const isSelected = p.id === selectedId;
            return (
              <div
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`relative flex flex-col justify-between rounded-xl border p-3 cursor-pointer transition-all ${
                  isSelected
                    ? "border-purple-500 bg-purple-50/50 dark:border-purple-600 dark:bg-purple-950/30 shadow-xs ring-1 ring-purple-500/20"
                    : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="flex items-center gap-1.5 font-bold text-sm text-neutral-900 dark:text-neutral-100">
                      <span className="text-base">{p.icone}</span>
                      <span>{p.nome}</span>
                    </span>
                    {isSelected && (
                      <span className="rounded-full bg-purple-600 p-0.5 text-white">
                        <Check size={12} weight="bold" />
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-medium text-purple-700 dark:text-purple-300 mb-1">
                    {p.titulo}
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-3 leading-relaxed">
                    {p.descricao}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1 mt-3 pt-2 border-t border-neutral-100 dark:border-neutral-800/80">
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                    Tom: {p.sugestao.tom}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                    {t("Tratamento:")} {p.sugestao.tratamento === "voce" ? t("Você") : t("Senhor(a)")}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                    Mensagens: {p.sugestao.mensagens}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>

        {/* Prévia da Seleção */}
        <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-900/50 space-y-1.5">
          <div className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
            <span>{current.icone}</span>
            <span>{t("Apresentação Sugerida:")}</span>
          </div>
          <p className="text-[11px] italic text-neutral-600 dark:text-neutral-300 bg-white dark:bg-neutral-800 p-2 rounded-lg border border-neutral-200/80 dark:border-neutral-700/60">
            &ldquo;{current.sugestao.apresentacao}&rdquo;
          </p>
          <div className="flex items-center gap-2 pt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            <span>Palavras da casa:</span>
            <div className="flex flex-wrap gap-1">
              {current.sugestao.palavrasDaCasa.slice(0, 3).map((w) => (
                <span key={w} className="rounded-md bg-emerald-50 px-1 text-emerald-700 font-mono text-[10px] dark:bg-emerald-950/40 dark:text-emerald-300">
                  +{w}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            {t("Cancelar")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold"
          >
            {t("Aplicar Persona")} ({current.nome})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
