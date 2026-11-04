"use client";

import * as React from "react";
import { BookOpen, LockKeyhole } from "lucide-react";

import { EVENTO_DIARIO_SALVO } from "@/lib/area-do-cliente/ritual";

import { CARTAO, SERIF, SOBRETITULO } from "./_tema";

interface Memoria { id: string; texto: string; quando: string }

/** Usa o diário já carregado, sem segunda consulta. Uma anotação aceita aparece também na aba Você. */
export function MemoriasDaArea({ entradas, tag, fuso, titulo, recentes, vazio }: {
  entradas: Memoria[]; tag: string; fuso: string; titulo: string; recentes: string; vazio: string;
}) {
  const [lista, setLista] = React.useState(entradas);
  React.useEffect(() => {
    const aoSalvar = (evento: Event) => {
      const nova = (evento as CustomEvent<Memoria>).detail;
      if (!nova?.id || typeof nova.texto !== "string" || !Number.isFinite(Date.parse(nova.quando))) return;
      setLista((atual) => [nova, ...atual.filter((m) => m.id !== nova.id)].slice(0, 10));
    };
    window.addEventListener(EVENTO_DIARIO_SALVO, aoSalvar);
    return () => window.removeEventListener(EVENTO_DIARIO_SALVO, aoSalvar);
  }, []);
  return (
    <section className={CARTAO} data-testid="area-memorias">
      <div className="flex items-center justify-between gap-3">
        <p className={SOBRETITULO}>{recentes}</p>
        <LockKeyhole className="size-4 text-[#b89cff]" aria-hidden />
      </div>
      <h2 className={`${SERIF} mt-2 flex items-center gap-3 text-[27px]`}><BookOpen className="size-5 text-[#b89cff]" aria-hidden />{titulo}</h2>
      {lista.length ? (
        <ol className="mt-5 space-y-4">
          {lista.map((m) => <li key={m.id} className="relative border-l border-[#b89cff]/30 pl-4">
            <span aria-hidden className="absolute -left-[3px] top-2 size-[5px] rounded-full bg-[#b89cff]" />
            <time dateTime={m.quando} className="text-xs text-[#baadca]">{new Intl.DateTimeFormat(tag, { timeZone: fuso, day: "numeric", month: "long" }).format(new Date(m.quando))}</time>
            <p className={`${SERIF} mt-1 whitespace-pre-line text-[18px] leading-relaxed text-[#e9e1f3] [overflow-wrap:anywhere]`}>{m.texto}</p>
          </li>)}
        </ol>
      ) : <p className="mt-3 text-[15px] leading-relaxed text-[#c3bad3]">{vazio}</p>}
    </section>
  );
}
