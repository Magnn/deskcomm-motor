"use client";
/**
 * SUAS LEITURAS — a entrega das leituras pagas dos quizzes DENTRO da área. Quem paga no quiz cai aqui já logada
 * (`?aba=trabalho&leitura=<id>`), com a dela aberta; se a leitura ainda não foi escrita, este cartão pede agora
 * (`/quiz-leituras/[id]`, pela sessão) e mostra quando chegar.
 */
import * as React from "react";

import { Loader2 } from "lucide-react";

import type { LeituraDoQuizNaArea } from "@/lib/area-do-cliente/leitura-do-quiz";

import { TituloDaSecao } from "./_client";
import { CARTAO, DETALHE, SERIF } from "./_tema";

export interface TextosDasLeiturasDoQuiz {
  titulo: string;
  escrevendo: string;
  tentar: string;
}

function TextoDaLeitura({ slug, leitura, tx }: { slug: string; leitura: LeituraDoQuizNaArea; tx: TextosDasLeiturasDoQuiz }) {
  const [texto, setTexto] = React.useState(leitura.texto);
  const [falhou, setFalhou] = React.useState(false);
  const pedindo = React.useRef(false);

  const pedir = React.useCallback(async () => {
    if (pedindo.current) return;
    pedindo.current = true;
    setFalhou(false);
    // A IA leva até um minuto; 429 = a outra aba já está escrevendo — espera e pergunta de novo.
    for (let tentativa = 0; tentativa < 6; tentativa++) {
      try {
        const r = await fetch(`/api/v1/area/publica/${slug}/quiz-leituras/${leitura.id}`, { method: "POST", credentials: "same-origin" });
        if (r.ok) {
          const { data } = (await r.json()) as { data: { texto: string } };
          setTexto(data.texto);
          pedindo.current = false;
          return;
        }
        if (r.status !== 429 && r.status < 500) break;
      } catch {
        /* rede: tenta de novo */
      }
      await new Promise((ok) => setTimeout(ok, 10_000));
    }
    pedindo.current = false;
    setFalhou(true);
  }, [slug, leitura.id]);

  React.useEffect(() => {
    if (!texto) void pedir();
  }, [texto, pedir]);

  if (texto) return <div className="mt-4 space-y-4 whitespace-pre-line text-[16px] leading-relaxed text-[#f6f0e4]">{texto}</div>;
  return (
    <div className="mt-4 flex items-center gap-3 text-[15px] text-[#c3bad3]" aria-live="polite">
      {falhou ? (
        <button type="button" onClick={() => void pedir()} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-white/20">
          {tx.tentar}
        </button>
      ) : (
        <>
          <Loader2 className="size-5 shrink-0 animate-spin text-[#e2c47a]" aria-hidden />
          {tx.escrevendo}
        </>
      )}
    </div>
  );
}

export function LeiturasDoQuiz({
  slug,
  leituras,
  aberta,
  dataCurta,
  tx,
}: {
  slug: string;
  leituras: LeituraDoQuizNaArea[];
  aberta: string | null;
  dataCurta: (iso: string) => string;
  tx: TextosDasLeiturasDoQuiz;
}) {
  const ref = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    if (aberta && leituras.some((l) => l.id === aberta)) ref.current?.scrollIntoView({ block: "start" });
  }, [aberta, leituras]);
  if (leituras.length === 0) return null;
  // Sem leitura indicada, a mais nova vem aberta (é a que ela acabou de comprar).
  const abrir = aberta && leituras.some((l) => l.id === aberta) ? aberta : leituras[0]!.id;
  return (
    <section ref={ref} className={`${CARTAO} scroll-mt-4`} data-testid="area-leituras-do-quiz">
      <TituloDaSecao titulo={tx.titulo} />
      <div className="mt-3 divide-y divide-white/10">
        {leituras.map((l) => (
          <details key={l.id} open={l.id === abrir} className="group py-3.5" data-testid="area-leitura-do-quiz">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className={`${SERIF} block text-[20px] leading-tight text-[#f6e3a8]`}>{l.titulo}</span>
                <span className={DETALHE}>{dataCurta(l.quando)}</span>
              </span>
              <span className="shrink-0 text-[#e2c47a] transition group-open:rotate-45" aria-hidden>
                ＋
              </span>
            </summary>
            <TextoDaLeitura slug={slug} leitura={l} tx={tx} />
          </details>
        ))}
      </div>
    </section>
  );
}
