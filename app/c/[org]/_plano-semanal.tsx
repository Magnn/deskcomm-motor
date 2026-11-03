"use client";
/**
 * O PLANO DA SEMANA na área (migration 0953): o convite com o preço NA MOEDA de quem olha e, para quem está em dia,
 * até quando vale e o que ele dá nesta semana.
 *
 * A moeda é proposta pelo fuso do aparelho (`moeda-do-visitante.ts`) depois de montar a tela — o servidor desenha
 * em reais e o navegador troca, sem diferença entre o HTML do servidor e o do aparelho. O servidor confere o valor
 * de novo na cobrança.
 *
 * No cartão o plano RENOVA SOZINHO toda semana (0954): a tela diz isso ANTES de pagar, mostra a data da próxima
 * cobrança e tem o "Cancelar renovação" de um toque. No Pix, a pessoa paga semana a semana.
 */
import * as React from "react";

import { CalendarHeart, Check, MoonStar, Sparkles } from "lucide-react";

import { moedaDaOferta, precoDaOferta, valorNaMoedaDaPagina, type MoedaDaPagina } from "@/lib/area-do-cliente/moeda-do-visitante";
import type { PrecoInternacional } from "@/lib/preco/tipos";

import { PagarNaArea } from "./_circulo";
import { type TextosDaArea } from "./_client";
import { CARTAO_NOTURNO, SERIF } from "./_tema";

export interface TextosDoPlano {
  convite: string;
  porSemana: string;
  beneficios: readonly string[];
  ativoAte: string;
  nestaSemana: string;
  renovar: string;
  soCartao: string;
  /** Antes de pagar: o cartão renova sozinho toda semana; cancela com um toque. */
  avisoDeRenovacao: string;
  /** Só no Brasil, onde há Pix. */
  avisoDoPix: string;
  renovaEm: string;
  cancelar: string;
  cancelada: string;
  erroAoCancelar: string;
}

export interface PlanoSemanalNaArea {
  nome: string;
  preco_cents: number;
  precos_internacionais: PrecoInternacional[];
  ativo: boolean;
  /** "10/11" — até quando vale, já no fuso da empresa. */
  ate: string | null;
  /** O que a empresa ligou: o plano só promete o que existe (0 = a pergunta da Mesa, 1 = o sonho). */
  temMesa: boolean;
  temSonho: boolean;
  /** O cartão guardado renova sozinho no vencimento (`ate`). */
  renova: boolean;
}

export function PlanoSemanalDoCliente({ slug, cor, tx, tp, plano }: { slug: string; cor: string; tx: TextosDaArea; tp: TextosDoPlano; plano: PlanoSemanalNaArea }) {
  const [moeda, setMoeda] = React.useState<MoedaDaPagina>("BRL");
  React.useEffect(() => {
    try {
      setMoeda(moedaDaOferta(plano, Intl.DateTimeFormat().resolvedOptions().timeZone));
    } catch {
      setMoeda("BRL");
    }
  }, [plano]);
  const [renova, setRenova] = React.useState(plano.renova);
  const [cancelando, setCancelando] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);
  async function cancelarRenovacao() {
    setCancelando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/v1/area/publica/${slug}/plano-semanal`, { method: "DELETE" });
      if (!r.ok) throw new Error(String(r.status));
      setRenova(false);
      setAviso(tp.cancelada);
    } catch {
      setAviso(tp.erroAoCancelar);
    } finally {
      setCancelando(false);
    }
  }
  const valor = precoDaOferta(plano, moeda) ?? plano.preco_cents;
  const preco = valorNaMoedaDaPagina(valor, precoDaOferta(plano, moeda) === null ? "BRL" : moeda);

  const lista = (
    <ul className="mt-4 space-y-2">
      {tp.beneficios.map((b, i) => (i === 0 ? plano.temMesa : plano.temSonho) ? (
        <li key={b} className="flex gap-2.5 text-[15px] leading-snug text-[#e9e1f3]">
          {i === 0 ? <Sparkles className="mt-0.5 size-4 shrink-0 text-[#e2c47a]" aria-hidden /> : <MoonStar className="mt-0.5 size-4 shrink-0 text-[#b89cff]" aria-hidden />}
          {b}
        </li>
      ) : null)}
    </ul>
  );

  if (plano.ativo) {
    return (
      <section className={CARTAO_NOTURNO} data-testid="area-plano-ativo">
        <h3 className={`${SERIF} flex items-center gap-2 text-[24px] leading-tight`}>
          <Check className="size-5 text-[#7fd1a0]" aria-hidden />
          {plano.nome}
        </h3>
        {plano.ate ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-1 text-sm text-[#f0dca8]" data-testid="area-plano-ate">
            <CalendarHeart className="size-4" aria-hidden />
            {renova ? tp.renovaEm : tp.ativoAte} {plano.ate}
          </p>
        ) : null}
        <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[#b7aecb]">{tp.nestaSemana}</p>
        {lista}
        {renova ? (
          <button
            type="button"
            onClick={cancelarRenovacao}
            disabled={cancelando}
            className="mt-5 text-sm text-[#c3bad3] underline underline-offset-4 hover:text-white disabled:opacity-60"
            data-testid="area-plano-cancelar"
          >
            {tp.cancelar}
          </button>
        ) : (
          <>
            <p className="mt-5 text-sm text-[#c3bad3]">{tp.renovar}</p>
            <PagarNaArea endpoint={`/api/v1/area/publica/${slug}/plano-semanal`} corpo={{ moeda }} cor={cor} tx={tx} escuro soCartao={moeda !== "BRL"} />
          </>
        )}
        {aviso ? (
          <p className="mt-3 text-sm text-[#f0dca8]" role="status">
            {aviso}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className={CARTAO_NOTURNO} data-testid="area-plano-oferta">
      <span className="pointer-events-none absolute -left-16 -top-16 size-48 rounded-full bg-[radial-gradient(circle,rgba(184,156,255,0.35),transparent_70%)]" />
      <h3 className={`${SERIF} text-[26px] leading-tight`}>{plano.nome}</h3>
      <p className="mt-3 text-[15px] leading-relaxed text-[#d9d0e6]">{tp.convite}</p>
      {lista}
      <p className="mt-5 flex items-baseline gap-2">
        <span className={`${SERIF} text-3xl text-[#f0dca8]`} data-testid="area-plano-preco">
          {preco}
        </span>
        <span className="text-sm text-[#b7aecb]">{tp.porSemana}</span>
      </p>
      {moeda !== "BRL" ? <p className="mt-1 text-xs text-[#b7aecb]">{tp.soCartao}</p> : null}
      <p className="mt-3 rounded-xl bg-white/[0.06] px-3 py-2 text-xs leading-relaxed text-[#d9d0e6]" data-testid="area-plano-aviso-renovacao">
        {tp.avisoDeRenovacao}
        {moeda === "BRL" ? ` ${tp.avisoDoPix}` : null}
      </p>
      <PagarNaArea endpoint={`/api/v1/area/publica/${slug}/plano-semanal`} corpo={{ moeda }} cor={cor} tx={tx} escuro soCartao={moeda !== "BRL"} />
    </section>
  );
}
