"use client";
/**
 * O GRIMÓRIO na área do cliente (`lib/area-do-cliente/grimorio.ts`): as cartas que já saíram para ela, numa grade.
 * Tocar abre o sentido de base e a última pergunta em que a carta apareceu. Memória, não coleção: nada aqui conta o
 * que falta.
 */
import * as React from "react";
import { BookOpen } from "lucide-react";

import { TituloDaSecao } from "./_client";
import { CARTAO, SERIF, TEXTO_SUAVE } from "./_tema";

export interface TextosDoGrimorio {
  titulo: string;
  convite: string;
  saiuVezes: string;
  ultimaPergunta: string;
  verTodas: string;
  verMenos: string;
}

export interface CartaNoGrimorio {
  chave: string;
  nome: string;
  modalidade: string;
  sentido: string;
  vezes: number;
  ultimaPergunta: string;
  ultimaVez: string;
  foto: string | null;
}

const VISIVEIS = 6;

export function GrimorioDaArea({ cartas, tg }: { cartas: CartaNoGrimorio[]; tg: TextosDoGrimorio }) {
  const [aberta, setAberta] = React.useState<string | null>(null);
  const [todas, setTodas] = React.useState(false);
  if (cartas.length === 0) return null;
  const lista = todas ? cartas : cartas.slice(0, VISIVEIS);
  const escolhida = cartas.find((c) => c.chave === aberta) ?? null;

  return (
    <section className={CARTAO} data-testid="area-grimorio">
      <TituloDaSecao titulo={tg.titulo} icone={<BookOpen className="size-5" />} />
      <p className={`mt-2 ${TEXTO_SUAVE}`}>{tg.convite}</p>

      <ul className="mt-4 grid grid-cols-3 gap-3">
        {lista.map((c) => (
          <li key={c.chave}>
            <button
              type="button"
              onClick={() => setAberta(aberta === c.chave ? null : c.chave)}
              aria-expanded={aberta === c.chave}
              className={`flex w-full flex-col items-center gap-1.5 rounded-2xl border p-2 text-center transition ${
                aberta === c.chave ? "border-[#c9a54e] bg-[#fdf9ef]" : "border-[#ebe3d3] bg-[#fdfbf7]"
              }`}
              data-testid="area-grimorio-carta"
            >
              {c.foto ? (
                // eslint-disable-next-line @next/next/no-img-element -- foto da carta no storage da empresa (URL assinada)
                <img src={c.foto} alt="" className="aspect-[2/3] w-full rounded-lg object-cover" />
              ) : (
                <span className="flex aspect-[2/3] w-full items-center justify-center rounded-lg bg-[#241f31] text-2xl text-[#f0dca8]" aria-hidden>
                  ✦
                </span>
              )}
              <span className="text-[13px] font-semibold leading-tight text-[#241f31]">{c.nome}</span>
              {c.vezes > 1 ? (
                <span className="text-[11px] text-[#a8842f]">
                  {tg.saiuVezes.replace("{n}", String(c.vezes))}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      {escolhida ? (
        <div className="mt-4 rounded-2xl bg-[#fdf9ef] p-4" data-testid="area-grimorio-detalhe">
          <p className={`${SERIF} text-[20px] leading-snug`}>{escolhida.nome}</p>
          <p className="text-xs uppercase tracking-[0.18em] text-[#a8842f]">{escolhida.modalidade}</p>
          <p className={`mt-2 ${TEXTO_SUAVE}`}>{escolhida.sentido}</p>
          <p className="mt-3 text-sm text-[#6f6880]">
            <span className="font-semibold">{tg.ultimaPergunta}</span> “{escolhida.ultimaPergunta}” · {escolhida.ultimaVez}
          </p>
        </div>
      ) : null}

      {cartas.length > VISIVEIS ? (
        <button type="button" onClick={() => setTodas((v) => !v)} className="mt-4 text-sm font-semibold text-[#a8842f] underline underline-offset-4">
          {todas ? tg.verMenos : `${tg.verTodas} (${cartas.length})`}
        </button>
      ) : null}
    </section>
  );
}
