"use client";
/**
 * A troca de idioma da área (`lib/i18n/area.ts`): grava a escolha no cookie `area_idioma` e recarrega. Sem escolha,
 * vale o idioma do navegador. Os nomes aparecem cada um na própria língua, para quem não lê português achar o seu.
 */
import * as React from "react";

import { Languages } from "lucide-react";

import { IDIOMAS_DA_AREA, type IdiomaDaArea } from "@/lib/i18n/area-idiomas";

const NOMES: Record<IdiomaDaArea, string> = {
  "pt-BR": "Português",
  es: "Español",
  en: "English",
  fr: "Français",
  it: "Italiano",
  de: "Deutsch",
};

export function SeletorDeIdiomaDaArea({ atual }: { atual: IdiomaDaArea }) {
  return (
    <label className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#9d94b2]">
      <Languages className="size-3.5" aria-hidden />
      <span className="sr-only">Idioma / Language</span>
      <select
        value={atual}
        onChange={(e) => {
          document.cookie = `area_idioma=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          window.location.reload();
        }}
        className="rounded-md bg-transparent py-0.5 text-xs text-[#c3bad3] outline-hidden"
        data-testid="area-idioma"
      >
        {IDIOMAS_DA_AREA.map((i) => (
          <option key={i} value={i} className="bg-[#1b1530]">
            {NOMES[i]}
          </option>
        ))}
      </select>
    </label>
  );
}
