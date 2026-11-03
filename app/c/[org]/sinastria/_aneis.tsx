/**
 * Os anéis de afinidade da prévia da sinastria (`aneisDeAfinidade`, em `lib/area-do-cliente/sinastria.ts`): o
 * total grande no meio e quatro anéis menores. Os anéis se enchem quando aparecem na tela.
 */
"use client";

import { useEffect, useState } from "react";

import type { AneisDeAfinidade as Aneis } from "@/lib/area-do-cliente/sinastria";

import { SERIF } from "../_tema";

interface TextosDosAneis {
  afinidade: string;
  anelAmor: string;
  anelConversa: string;
  anelQuimica: string;
  anelConfianca: string;
  afinidadeNota: string;
}

function Anel({ valor, cor, tamanho, espessura, cheio }: { valor: number; cor: string; tamanho: number; espessura: number; cheio: boolean }) {
  const r = (tamanho - espessura) / 2;
  const volta = 2 * Math.PI * r;
  return (
    <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} className="-rotate-90" aria-hidden>
      <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="#ffffff14" strokeWidth={espessura} />
      <circle
        cx={tamanho / 2}
        cy={tamanho / 2}
        r={r}
        fill="none"
        stroke={cor}
        strokeWidth={espessura}
        strokeLinecap="round"
        strokeDasharray={volta}
        strokeDashoffset={cheio ? volta * (1 - valor / 100) : volta}
        style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(.2,.8,.2,1)" }}
      />
    </svg>
  );
}

export function AneisDeAfinidade({ aneis, tx }: { aneis: Aneis; tx: TextosDosAneis }) {
  const [cheio, setCheio] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setCheio(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const itens = [
    { rotulo: tx.anelAmor, valor: aneis.amor, cor: "#f3a6bd" },
    { rotulo: tx.anelConversa, valor: aneis.conversa, cor: "#8fb4ff" },
    { rotulo: tx.anelQuimica, valor: aneis.quimica, cor: "#f0a35c" },
    { rotulo: tx.anelConfianca, valor: aneis.confianca, cor: "#7fd1a0" },
  ];
  return (
    <div className="mb-6" data-testid="sinastria-aneis">
      <p className="text-center text-xs uppercase tracking-[0.2em] text-[#e8c987]">{tx.afinidade}</p>
      <div className="relative mx-auto mt-3 grid size-[150px] place-items-center">
        <div className="absolute inset-0">
          <Anel valor={aneis.total} cor="#e8c987" tamanho={150} espessura={10} cheio={cheio} />
        </div>
        <p className={`${SERIF} text-[44px] leading-none text-[#f6f0e4]`} data-testid="sinastria-afinidade-total">
          {aneis.total}
          <span className="text-[22px] text-[#c3bad3]">%</span>
        </p>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-2">
        {itens.map((i) => (
          <div key={i.rotulo} className="flex flex-col items-center">
            <div className="relative grid size-[62px] place-items-center">
              <div className="absolute inset-0">
                <Anel valor={i.valor} cor={i.cor} tamanho={62} espessura={6} cheio={cheio} />
              </div>
              <span className="text-[14px] font-semibold text-[#f6f0e4]">{i.valor}%</span>
            </div>
            <span className="mt-1.5 text-center text-[12px] leading-tight text-[#c3bad3]">{i.rotulo}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-[12px] leading-snug text-[#9d94b2]">{tx.afinidadeNota}</p>
    </div>
  );
}
