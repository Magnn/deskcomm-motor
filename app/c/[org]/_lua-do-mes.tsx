"use client";
/**
 * "SUA LUA DO MÊS" na área (`lib/area-do-cliente/lua-do-mes.ts`): a prévia da imagem e o botão de compartilhar.
 * No celular, o compartilhamento do aparelho com a imagem (WhatsApp, status, Instagram); onde ele não existe, a
 * imagem é baixada. A imagem vem de `/c/[org]/lua-do-mes`, que só responde com a sessão dela.
 */
import * as React from "react";
import { Moon, Share2 } from "lucide-react";

import { TituloDaSecao } from "./_client";
import { BOTAO, CARTAO, TEXTO_SUAVE } from "./_tema";

export interface TextosDaLuaDoMes {
  titulo: string;
  convite: string;
  compartilhar: string;
  preparando: string;
  baixada: string;
  naoDeu: string;
  textoDoCompartilhar: string;
}

export function LuaDoMes({ slug, cor, versao, tl }: { slug: string; cor: string; versao: string; tl: TextosDaLuaDoMes }) {
  const [estado, setEstado] = React.useState<"parado" | "preparando" | "baixada" | "erro">("parado");
  const src = `/c/${slug}/lua-do-mes?v=${encodeURIComponent(versao)}`;

  const compartilhar = async () => {
    setEstado("preparando");
    try {
      const res = await fetch(src, { credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const arquivo = new File([await res.blob()], "minha-lua-do-mes.png", { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], text: tl.textoDoCompartilhar });
        setEstado("parado");
        return;
      }
      const url = URL.createObjectURL(arquivo);
      const a = document.createElement("a");
      a.href = url;
      a.download = arquivo.name;
      a.click();
      URL.revokeObjectURL(url);
      setEstado("baixada");
    } catch (err) {
      // Cancelar o compartilhamento não é erro.
      setEstado(err instanceof DOMException && err.name === "AbortError" ? "parado" : "erro");
    }
  };

  return (
    <section className={CARTAO} data-testid="area-lua-do-mes">
      <TituloDaSecao titulo={tl.titulo} icone={<Moon className="size-5" />} />
      <p className={`mt-2 ${TEXTO_SUAVE}`}>{tl.convite}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- imagem gerada na hora pela própria área, com a sessão dela */}
      <img src={src} alt={tl.titulo} loading="lazy" className="mx-auto mt-4 w-full max-w-[260px] rounded-2xl shadow-md" />
      <button
        type="button"
        onClick={() => void compartilhar()}
        disabled={estado === "preparando"}
        className={`${BOTAO} mt-4 w-full`}
        style={{ background: cor }}
        data-testid="area-lua-compartilhar"
      >
        <Share2 className="size-4" aria-hidden />
        {estado === "preparando" ? tl.preparando : tl.compartilhar}
      </button>
      {estado === "baixada" ? <p className="mt-2 text-center text-sm text-[#2f7a4f]">{tl.baixada}</p> : null}
      {estado === "erro" ? (
        <p role="alert" className="mt-2 text-center text-sm text-[#a5361f]">
          {tl.naoDeu}
        </p>
      ) : null}
    </section>
  );
}
