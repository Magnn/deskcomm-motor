"use client";

/**
 * A MEDITAÇÃO DA SEMANA no Hoje (`lib/area-do-cliente/meditacao.ts`): o player, o que a fez ser dela (Sol, Lua,
 * fase da lua) e o texto para quem prefere ler. O áudio é pedido assim que o cartão aparece (a primeira vez na
 * semana leva alguns segundos) e o toque só toca — o celular só deixa tocar som dentro do toque.
 */
import * as React from "react";
import { Headphones, Loader2, Pause, Play } from "lucide-react";

import { CARTAO, DETALHE, SERIF, SOBRETITULO } from "./_tema";

export interface TextosDaMeditacao {
  sobretitulo: string;
  minutos: string;
  ouvir: string;
  pausar: string;
  preparando: string;
  semVoz: string;
  lerTexto: string;
  novaToda: string;
}

export interface MeditacaoNaArea {
  titulo: string;
  feitaCom: string;
  minutos: number;
  trechos: string[];
  url: string;
}

export function MeditacaoDaSemana({ m, tx }: { m: MeditacaoNaArea; tx: TextosDaMeditacao }) {
  const [link, setLink] = React.useState<string | null>(null);
  const [falhou, setFalhou] = React.useState(false);
  const [tocando, setTocando] = React.useState(false);
  const [progresso, setProgresso] = React.useState(0);
  const audio = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    let vivo = true;
    void fetch(m.url, { method: "POST", credentials: "same-origin" })
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
  }, [m.url]);

  const alternar = () => {
    if (!link) return;
    if (!audio.current) {
      const a = new Audio(link);
      a.onended = () => {
        setTocando(false);
        setProgresso(1);
      };
      a.ontimeupdate = () => a.duration && setProgresso(a.currentTime / a.duration);
      audio.current = a;
    }
    if (tocando) {
      audio.current.pause();
      setTocando(false);
    } else {
      void audio.current.play().then(() => setTocando(true)).catch(() => setFalhou(true));
    }
  };

  return (
    <section className={`${CARTAO} relative overflow-hidden`} data-testid="area-meditacao">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-[#7b5bd6]/25 blur-3xl" />
      <p className={SOBRETITULO}>
        <Headphones className="mr-1.5 inline size-3.5 align-[-2px]" aria-hidden />
        {tx.sobretitulo} · {tx.minutos.replace("{n}", String(m.minutos))}
      </p>
      <h3 className={`${SERIF} mt-2 text-[24px] leading-tight text-[#f6e3a8]`}>{m.titulo}</h3>
      <p className={`mt-1 ${DETALHE}`}>{m.feitaCom}</p>

      {falhou ? (
        <p className={`mt-4 ${DETALHE}`}>{tx.semVoz}</p>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={alternar}
            disabled={!link}
            aria-label={!link ? tx.preparando : tocando ? tx.pausar : tx.ouvir}
            className="grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#f4e2b4] to-[#d8b66a] text-[#1b1433] shadow-[0_10px_30px_-10px_#e2c47a] transition active:scale-95 disabled:opacity-70 motion-reduce:transition-none"
            data-testid="area-meditacao-tocar"
          >
            {!link ? <Loader2 className="size-5 animate-spin" aria-hidden /> : tocando ? <Pause className="size-5" aria-hidden /> : <Play className="ml-0.5 size-5" aria-hidden />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#efe7f7]">{!link ? tx.preparando : tocando ? tx.pausar : tx.ouvir}</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#e2c47a] transition-[width] duration-500" style={{ width: `${Math.round(progresso * 100)}%` }} />
            </div>
          </div>
        </div>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-[#e2c47a]">{tx.lerTexto}</summary>
        <div className="mt-3 space-y-2 text-[15px] leading-relaxed text-[#c3bad3]">
          {m.trechos.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
        </div>
      </details>
      <p className={`mt-3 ${DETALHE}`}>{tx.novaToda}</p>
    </section>
  );
}
