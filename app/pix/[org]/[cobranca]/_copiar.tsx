"use client";

import * as React from "react";

import { copyToClipboard } from "@/lib/clipboard";

/** O botão grande de copiar e, embaixo, o código à vista para quem prefere selecionar à mão. */
export function CopiarCodigo({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = React.useState<boolean | null>(null);
  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={async () => setCopiado(await copyToClipboard(codigo))}
        className="w-full rounded-2xl bg-[#3b2551] px-5 py-4 text-lg font-semibold text-white shadow-md active:scale-[0.99]"
      >
        {copiado ? "Código copiado ✓" : "Copiar código Pix"}
      </button>
      <p role="status" className="mt-2 min-h-5 text-center text-sm text-[#3b2551]">
        {copiado === true ? "Agora é só colar no app do banco, em Pix Copia e Cola." : copiado === false ? "Não deu para copiar sozinho: segure o código abaixo e escolha Copiar." : ""}
      </p>
      <p className="mt-2 break-all rounded-xl bg-[#f6f3ee] p-3 font-mono text-xs leading-relaxed text-[#4a3d55] select-all">{codigo}</p>
    </div>
  );
}
