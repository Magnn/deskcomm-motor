"use client";
/**
 * O símbolo da área, em traço, para o topo da página: dois círculos que se cruzam (duas pessoas) e só a
 * interseção acesa, com a estrela-guia dentro. É o mesmo desenho do ícone do app (`icone/route.tsx`),
 * sem o ladrilho de fundo: anéis dourados suaves e a interseção acesa.
 */
import * as React from "react";

export function SimboloDaArea({ className }: { className?: string }) {
  const corte = React.useId();
  return (
    <svg viewBox="3.6 3.6 24.8 24.8" className={className} aria-hidden="true">
      <defs>
        <clipPath id={corte}>
          <circle cx="12.25" cy="16" r="7.75" />
        </clipPath>
      </defs>
      <g fill="none" stroke="#e8c574" strokeOpacity={0.75} strokeWidth={1.7}>
        <circle cx="12.25" cy="16" r="7.75" />
        <circle cx="19.75" cy="16" r="7.75" />
      </g>
      <circle cx="19.75" cy="16" r="8.6" fill="#e9c77b" clipPath={`url(#${corte})`} />
      <path d="M16 12.3l1 2.7 2.7 1-2.7 1-1 2.7-1-2.7-2.7-1 2.7-1z" fill="#1a1030" />
    </svg>
  );
}
