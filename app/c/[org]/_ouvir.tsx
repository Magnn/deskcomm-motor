"use client";

/**
 * "Ouvir a leitura" das leituras longas (quiz, sinastria, mão) — `lib/area-do-cliente/narracao.ts`. O áudio é
 * pedido assim que o botão aparece (a primeira vez leva alguns segundos) e o toque só toca: o celular só deixa
 * tocar som dentro do toque. Sem voz no servidor, o botão some e a leitura escrita continua.
 */
import * as React from "react";
import { Loader2, Pause, Play } from "lucide-react";

export interface TextosDoOuvir {
  ouvirLeitura: string;
  pausarLeitura: string;
  preparandoLeitura: string;
}

export function OuvirLeituraLonga({ url, segredo, tx }: { url: string; segredo?: string; tx: TextosDoOuvir }) {
  const [link, setLink] = React.useState<string | null>(null);
  const [falhou, setFalhou] = React.useState(false);
  const [tocando, setTocando] = React.useState(false);
  const audio = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    let vivo = true;
    void fetch(url, { method: "POST", credentials: "same-origin", headers: segredo ? { "x-segredo": segredo } : {} })
      .then((r) => r.json())
      .then((j: { data?: { url?: string } }) => {
        if (!vivo) return;
        if (j.data?.url) setLink(j.data.url);
        else setFalhou(true);
      })
      .catch(() => vivo && setFalhou(true));
    return () => {
      vivo = false;
      audio.current?.pause();
    };
  }, [url, segredo]);

  if (falhou) return null;
  const alternar = () => {
    if (!link) return;
    if (!audio.current) {
      audio.current = new Audio(link);
      audio.current.onended = () => setTocando(false);
    }
    if (tocando) {
      audio.current.pause();
      setTocando(false);
    } else {
      void audio.current.play().then(() => setTocando(true)).catch(() => setFalhou(true));
    }
  };
  return (
    <button
      type="button"
      onClick={alternar}
      disabled={!link}
      className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#c9a54e]/60 bg-[#1b1433] px-4 py-2 text-sm font-semibold text-[#f0dca8] shadow-sm transition active:scale-[0.97] disabled:opacity-70 motion-reduce:transition-none"
      data-testid="ouvir-leitura"
    >
      {!link ? <Loader2 className="size-4 animate-spin" aria-hidden /> : tocando ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
      {!link ? tx.preparandoLeitura : tocando ? tx.pausarLeitura : tx.ouvirLeitura}
    </button>
  );
}
