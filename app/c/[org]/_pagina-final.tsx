"use client";

/**
 * A PÁGINA FINAL dos quizzes (prévia + oferta), a mesma para os três (22/10/2026). Modelada na forma das páginas
 * que escalam no Meta — título com o nome da pessoa, grade com os DADOS DELA, o que está na leitura completa, a
 * oferta como entregáveis com a palavra-chave em negrito, a objeção no fim repetindo o botão — com o nosso limite:
 *
 * - o "travado" é o que a leitura completa TRAZ (as partes, cada uma ligada a um dado já calculado), nunca um texto
 *   borrado que finge já existir nem uma pessoa "destinada" que não está nos dados;
 * - sem âncora de preço inventada, sem timer, sem "fura-fila";
 * - perguntas frequentes honestas (inclusive que o texto é escrito por IA a partir da conta).
 *
 * A barra fixa de pagamento aparece no celular quando o cartão da oferta sai da tela. Os textos chegam prontos.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

import { CARTAO, SERIF, SOBRETITULO } from "./_tema";

export interface DadoDaPessoa {
  rotulo: string;
  valor: string;
}

export interface ParteDaLeitura {
  titulo: string;
  /** O dado calculado a que a parte se liga ("ligado ao que você contou: tempo e atenção"). */
  gancho?: string;
}

export interface TextosDaPaginaFinal {
  oQueTraz: string;
  naLeituraCompleta: string;
  ofertaSobretitulo: string;
  ofertaTitulo: string;
  pagamentoUnico: string;
  seguro: string;
  garantiaTitulo: string;
  garantiaTexto: string;
  comoFunciona: string;
  passos: string[];
  perguntas: string;
  faq: { p: string; r: string }[];
  fecharTitulo: string;
  fecharTexto: string;
  pagarPix: string;
  prefiroCartao: string;
  pagarCartao: string;
  gerando: string;
  noBanco: string;
}

const BOTAO =
  "w-full rounded-full px-6 py-4 text-[17px] font-bold text-white shadow-[0_10px_30px_-8px_var(--cor)] ring-1 ring-white/15 transition hover:brightness-110 disabled:opacity-50";

export function PaginaFinal(props: {
  cor: string;
  sobretitulo: string;
  titulo: string;
  subtitulo: string;
  dados: DadoDaPessoa[];
  /** O cartão do resultado (ponto forte, atenção, espelho, ponte), montado por cada quiz. */
  resultado: ReactNode;
  partes: ParteDaLeitura[];
  /** Entregáveis: [palavra-chave em negrito, resto da frase]. */
  itens: [string, string][];
  preco: string;
  brasil: boolean;
  enviando: boolean;
  erro: string | null;
  aoPagar: (forma: "pix" | "cartao") => void;
  tx: TextosDaPaginaFinal;
}) {
  const { cor, tx, brasil, enviando } = props;
  const ofertaRef = useRef<HTMLDivElement>(null);
  const [ofertaFora, setOfertaFora] = useState(false);
  const [passouDoTopo, setPassouDoTopo] = useState(false);
  const [aberta, setAberta] = useState<number | null>(null);

  useEffect(() => {
    const alvo = ofertaRef.current;
    if (!alvo || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOfertaFora(!e!.isIntersecting), { threshold: 0.05 });
    io.observe(alvo);
    const rolar = () => setPassouDoTopo(window.scrollY > 380);
    window.addEventListener("scroll", rolar, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", rolar);
    };
  }, []);

  const pagarPrincipal = () => props.aoPagar(brasil ? "pix" : "cartao");
  const botoes = (
    <>
      <button className={BOTAO} style={{ background: cor, ["--cor" as string]: cor }} disabled={enviando} onClick={pagarPrincipal}>
        {enviando ? tx.gerando : brasil ? tx.pagarPix : tx.pagarCartao} →
      </button>
      {brasil ? (
        <button className="mt-3 w-full text-sm text-[#e2c47a] underline disabled:opacity-50" disabled={enviando} onClick={() => props.aoPagar("cartao")}>
          {tx.prefiroCartao}
        </button>
      ) : null}
    </>
  );

  return (
    <div className="space-y-5 pb-24">
      <header className="pt-2 text-center">
        <p className={SOBRETITULO}>{props.sobretitulo}</p>
        <h2 className={`${SERIF} mt-2 text-[28px] leading-tight text-[#f6e3a8]`}>{props.titulo}</h2>
        <p className="mt-2 text-[15px] text-[#c3bad3]">{props.subtitulo}</p>
      </header>

      {props.dados.length > 0 && (
        <div className={`${CARTAO} grid grid-cols-2 gap-px overflow-hidden p-0`}>
          {props.dados.map((d, i) => (
            <div
              key={d.rotulo}
              className={`bg-[#1a1430] px-4 py-3 ${props.dados.length % 2 === 1 && i === props.dados.length - 1 ? "col-span-2" : ""}`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9d94b2]">{d.rotulo}</p>
              <p className={`${SERIF} mt-1 text-lg text-[#f6e3a8]`}>{d.valor}</p>
            </div>
          ))}
        </div>
      )}

      {props.resultado}

      <section className={CARTAO}>
        <p className={SOBRETITULO}>{tx.oQueTraz}</p>
        <ol className="mt-4 space-y-3">
          {props.partes.map((p, i) => (
            <li key={p.titulo} className="flex gap-3 rounded-2xl border border-[#c9a54e]/15 bg-[#120d22] px-4 py-3">
              <span className={`${SERIF} mt-0.5 text-lg text-[#c9a54e]`}>{i + 1}</span>
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-[#f6f0e4]">{p.titulo}</span>
                {p.gancho ? <span className="mt-0.5 block text-[13px] text-[#9d94b2]">{p.gancho}</span> : null}
              </span>
              <span className="mt-0.5 text-[13px] text-[#9d94b2]" aria-label={tx.naLeituraCompleta} title={tx.naLeituraCompleta}>
                🔒
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section
        ref={ofertaRef}
        className={`${CARTAO} border-[#e2c47a]/40 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(226,196,122,0.12),transparent_60%),#1a1430] shadow-[0_0_0_1px_rgba(226,196,122,0.15),0_24px_60px_-30px_rgba(226,196,122,0.45)]`}
      >
        <p className={`${SOBRETITULO} text-center`}>{tx.ofertaSobretitulo}</p>
        <h3 className={`${SERIF} mt-2 text-center text-2xl leading-snug text-[#f6e3a8]`}>{tx.ofertaTitulo}</h3>
        <ul className="mt-5 space-y-3">
          {props.itens.map(([forte, resto]) => (
            <li key={forte} className="flex gap-2.5 text-[15px] leading-snug text-[#c3bad3]">
              <span className="text-[#e2c47a]">✦</span>
              <span>
                <strong className="font-semibold text-[#f6f0e4]">{forte}</strong> {resto}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-6 text-center">
          <p className="text-[40px] font-bold leading-none text-[#f6e3a8]">{props.preco}</p>
          <p className="mt-1 text-xs text-[#9d94b2]">{tx.pagamentoUnico}</p>
        </div>
        {props.erro && <p className="mt-3 text-center text-sm text-[#f3a3c0]">{props.erro}</p>}
        <div className="mt-5">{botoes}</div>
        <p className="mt-3 text-center text-[12px] text-[#9d94b2]">{tx.seguro}</p>
        {brasil ? <p className="mt-1 text-center text-[11px] text-[#7d7495]">{tx.noBanco}</p> : null}
        <div className="mt-5 flex gap-3 rounded-2xl border border-[#7fd1a0]/25 bg-[#7fd1a0]/[0.06] p-4">
          <span className="text-xl">🛡️</span>
          <div>
            <p className="text-sm font-semibold text-[#f6f0e4]">{tx.garantiaTitulo}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-[#c3bad3]">{tx.garantiaTexto}</p>
          </div>
        </div>
      </section>

      <section className={CARTAO}>
        <p className={SOBRETITULO}>{tx.comoFunciona}</p>
        <ol className="mt-4 space-y-3">
          {tx.passos.map((p, i) => (
            <li key={p} className="flex items-start gap-3 text-[15px] text-[#c3bad3]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: cor }}>
                {i + 1}
              </span>
              <span className="pt-0.5">{p}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={CARTAO}>
        <p className={SOBRETITULO}>{tx.perguntas}</p>
        <div className="mt-3 divide-y divide-[#c9a54e]/10">
          {tx.faq.map((f, i) => (
            <div key={f.p}>
              <button className="flex w-full items-center justify-between gap-3 py-3 text-left text-[15px] text-[#f6f0e4]" onClick={() => setAberta(aberta === i ? null : i)} aria-expanded={aberta === i}>
                <span>{f.p}</span>
                <span className="text-[#e2c47a]">{aberta === i ? "−" : "+"}</span>
              </button>
              {aberta === i && <p className="pb-3 text-[14px] leading-relaxed text-[#c3bad3]">{f.r}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className={CARTAO}>
        <h3 className={`${SERIF} text-xl text-[#f6e3a8]`}>{tx.fecharTitulo}</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-[#c3bad3]">{tx.fecharTexto}</p>
        <div className="mt-5">{botoes}</div>
      </section>

      {ofertaFora && passouDoTopo && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#c9a54e]/20 bg-[#110c20]/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <div className="shrink-0">
              <p className="text-lg font-bold leading-none text-[#f6e3a8]">{props.preco}</p>
              <p className="text-[10px] text-[#9d94b2]">{tx.pagamentoUnico.split(".")[0]}</p>
            </div>
            <button
              className="flex-1 rounded-full px-4 py-3 text-[15px] font-bold text-white disabled:opacity-50"
              style={{ background: cor }}
              disabled={enviando}
              onClick={pagarPrincipal}
            >
              {enviando ? tx.gerando : brasil ? tx.pagarPix : tx.pagarCartao}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
