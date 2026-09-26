"use client";
/**
 * Uma lista curta de textos como chips: digita e aperta Enter (ou vírgula) para adicionar, clica no × para
 * tirar. Usada pelas abas estruturadas do agente (palavras da casa, o que o produto inclui, o que a empresa
 * não oferece…).
 *
 * A tela não deixa entrar o que o servidor recusaria: aspas duplas e quebra de linha (os itens costumam ir
 * entre aspas no prompt e a aspa fecharia o trecho) e os outros caracteres que a aba declarar proibidos,
 * texto acima do teto, item repetido e mais itens que o máximo. O servidor valida de novo; aqui é só para o
 * dono não digitar algo que some em silêncio.
 */
import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  id: string;
  rotulo: string;
  dica: string;
  itens: string[];
  aoMudar: (itens: string[]) => void;
  placeholder: string;
  desabilitado?: boolean;
  /** Quantos itens cabem. Default 10. */
  max?: number;
  /** Tamanho máximo de cada item. Default 40. */
  tamanhoMax?: number;
  /** Caracteres que o servidor recusa neste campo. Default: aspas duplas e quebra de linha. */
  proibidos?: readonly string[];
}

export function ListaDeChips({
  id,
  rotulo,
  dica,
  itens,
  aoMudar,
  placeholder,
  desabilitado,
  max = 10,
  tamanhoMax = 40,
  proibidos = ['"', "\n"],
}: Props) {
  const t = useT();
  const [texto, setTexto] = React.useState("");

  const adicionar = () => {
    const nova = texto.trim().replace(/,+$/, "").trim();
    if (nova === "" || proibidos.some((c) => nova.includes(c)) || nova.length > tamanhoMax) return;
    if (itens.includes(nova) || itens.length >= max) return;
    aoMudar([...itens, nova]);
    setTexto("");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <div className="flex flex-wrap gap-1.5" data-testid={`${id}-chips`}>
        {itens.map((p) => (
          <span
            key={p}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated py-0.5 pl-2.5 pr-1 text-sm"
          >
            {p}
            <button
              type="button"
              aria-label={`${t("Remover")} ${p}`}
              disabled={desabilitado}
              onClick={() => aoMudar(itens.filter((i) => i !== p))}
              className="flex h-5 w-5 items-center justify-center rounded-full text-text-muted hover:bg-border"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <Input
        id={id}
        value={texto}
        placeholder={placeholder}
        disabled={desabilitado || itens.length >= max}
        maxLength={tamanhoMax}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            adicionar();
          }
        }}
        onBlur={adicionar}
      />
      <p className="text-xs text-text-muted">{dica}</p>
    </div>
  );
}
