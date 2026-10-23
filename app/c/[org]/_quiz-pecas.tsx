"use client";

/**
 * As peças dos quizzes da página, as mesmas nos três (sinastria, prosperidade, caminhos):
 *
 * - `Progresso`: a barra do alto, que mede telas de verdade (não anda sozinha).
 * - `SeletorDeData`: a data de nascimento por TOQUE — mês, dia, década e ano —, sem teclado nem máscara. No
 *   celular, digitar "07/02/1984" é onde mais gente desiste; tocar quatro vezes não é.
 * - `Interludio`: a frase da guia entre um capítulo e outro.
 * - `TelaDeCalculo`: o "calculando" que mostra a conta REAL, linha a linha. Cada linha é um passo que de fato
 *   aconteceu (o signo saiu da data, a soma foi feita); nenhuma é teatro.
 *
 * - `FotoDaGuia` e `VideoDaGuia`: a guia (a personagem que conduz) em várias telas, e os vídeos dela no meio do
 *   quiz e na prévia — a forma dos funis que escalam. Sem foto ou sem vídeo configurado, nada aparece.
 *
 * Os textos chegam prontos do servidor (passados pelo dicionário); aqui não há string de tela.
 */
import { useEffect, useState } from "react";

import { CARTAO, SERIF, SOBRETITULO } from "./_tema";

/** A foto redonda da guia, com o fio dourado; `pulsando` na tela de cálculo. */
export function FotoDaGuia(props: { url: string | null; nome?: string | null; tamanho?: number; pulsando?: boolean }) {
  if (!props.url) return null;
  const t = props.tamanho ?? 64;
  return (
    <span className="relative inline-block shrink-0" style={{ width: t, height: t }}>
      {props.pulsando ? <span className="absolute inset-0 animate-ping rounded-full bg-[#e2c47a]/30" /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Storage da instalação, tamanho fixo */}
      <img src={props.url} alt={props.nome ?? ""} width={t} height={t} className="relative h-full w-full rounded-full object-cover ring-2 ring-[#e2c47a]/70" />
    </span>
  );
}

/** O vídeo vertical da guia, tocando na própria página (sem tela cheia no celular), com a foto como capa. */
export function VideoDaGuia(props: { url: string | null; capa?: string | null }) {
  if (!props.url) return null;
  return (
    <div className="mx-auto mb-4 w-full max-w-[280px] overflow-hidden rounded-2xl border border-[#c9a54e]/25 bg-black shadow-[0_18px_40px_-24px_rgba(0,0,0,0.8)]">
      <video src={props.url} poster={props.capa ?? undefined} controls playsInline preload="metadata" className="aspect-[9/16] w-full object-cover" />
    </div>
  );
}

/** Um depoimento real de cliente, já com a URL do vídeo montada (ou `null`). */
export interface Depoimento {
  nome: string;
  texto: string;
  cidade?: string;
  video: string | null;
}

/** Outro quiz ativo da mesma área, para quem acabou de comprar continuar (o "upsell" dos funis que escalam). */
export interface OutraLeitura {
  titulo: string;
  chamada: string;
  href: string;
}

export function OutrasLeituras(props: { titulo: string; botao: string; itens: OutraLeitura[]; cor: string }) {
  if (props.itens.length === 0) return null;
  return (
    <section className={`${CARTAO} mt-5`}>
      <p className={SOBRETITULO}>{props.titulo}</p>
      <div className="mt-4 space-y-3">
        {props.itens.map((o) => (
          <a key={o.href} href={o.href} className="block rounded-2xl border border-[#c9a54e]/20 bg-[#120d22] p-4 hover:border-[#e2c47a]">
            <span className={`${SERIF} block text-lg text-[#f6e3a8]`}>{o.titulo}</span>
            <span className="mt-1 block text-[14px] text-[#c3bad3]">{o.chamada}</span>
            <span className="mt-3 inline-block rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ background: props.cor }}>
              {props.botao} →
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

/** Uma pergunta de quiz (`PerguntaDeQuiz` em `lib/area-do-cliente/quizzes.ts`), na forma que a tela recebe. */
export interface PerguntaNaTela {
  id: string;
  capitulo: string;
  texto: string;
  opcoes: string[];
  tipo?: "unica" | "multipla" | "escala";
  apoio?: string;
  rotulos?: [string, string];
  mecanismoAntes?: boolean;
}

const OPCAO = "w-full rounded-2xl border px-4 py-3 text-left text-base text-[#f6f0e4] transition";

/**
 * A pergunta nos três tipos: `unica` responde no toque; `multipla` marca várias (a opção "Nenhuma…" desmarca as
 * outras) e confirma no botão; `escala` são cinco toques de 1 a 5 com o rótulo das pontas. A resposta vai como
 * TEXTO — as opções marcadas juntas por "; " na múltipla, "N de 5" na escala —, porque é texto que a leitura lê.
 */
export function PerguntaDoQuiz(props: { p: PerguntaNaTela; cor: string; continuar: string; aoResponder: (valor: string) => void }) {
  const { p } = props;
  const [marcadas, setMarcadas] = useState<string[]>([]);
  if (p.tipo === "escala") {
    return (
      <div className="mt-6">
        <div className="grid grid-cols-5 gap-2">
          {p.opcoes.map((o) => (
            <button key={o} className={`${OPCAO} border-[#c9a54e]/25 bg-[#120d22] py-4 text-center text-xl hover:border-[#e2c47a]`} onClick={() => props.aoResponder(`${o} de ${p.opcoes.length}`)}>
              {o}
            </button>
          ))}
        </div>
        {p.rotulos ? (
          <div className="mt-2 flex justify-between text-xs text-[#9d94b2]">
            <span>{p.rotulos[0]}</span>
            <span>{p.rotulos[1]}</span>
          </div>
        ) : null}
      </div>
    );
  }
  if (p.tipo === "multipla") {
    const nenhuma = p.opcoes[p.opcoes.length - 1]!;
    const alternar = (o: string) =>
      setMarcadas((m) => (o === nenhuma ? (m.includes(o) ? [] : [o]) : m.includes(o) ? m.filter((x) => x !== o) : [...m.filter((x) => x !== nenhuma), o]));
    return (
      <div className="mt-5 space-y-3">
        {p.opcoes.map((o) => {
          const on = marcadas.includes(o);
          return (
            <button key={o} className={`${OPCAO} flex items-center justify-between gap-3 ${on ? "border-[#e2c47a] bg-[#2a1f3d]" : "border-[#c9a54e]/25 bg-[#120d22]"}`} onClick={() => alternar(o)} aria-pressed={on}>
              <span>{o}</span>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${on ? "border-[#e2c47a] bg-[#e2c47a] text-[#1a1430]" : "border-[#9d94b2]"}`}>{on ? "✓" : ""}</span>
            </button>
          );
        })}
        <button className="mt-2 w-full rounded-full px-6 py-4 text-base font-semibold text-white disabled:opacity-50" style={{ background: props.cor }} disabled={marcadas.length === 0} onClick={() => props.aoResponder(marcadas.join("; "))}>
          {props.continuar}
        </button>
      </div>
    );
  }
  return (
    <div className="mt-5 space-y-3">
      {p.opcoes.map((o) => (
        <button key={o} className={`${OPCAO} border-[#c9a54e]/25 bg-[#120d22] hover:border-[#e2c47a]`} onClick={() => props.aoResponder(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function Progresso(props: { atual: number; total: number; cor: string }) {
  const pct = Math.max(4, Math.min(100, Math.round((props.atual / Math.max(1, props.total)) * 100)));
  return (
    <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-[#2a2245]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: props.cor }} />
    </div>
  );
}

export interface TextosDaData {
  mes: string;
  dia: string;
  ano: string;
  decada: string;
  meses: string[];
}

const BOTAO_GRADE = "rounded-xl border border-[#c9a54e]/25 bg-[#120d22] py-3 text-center text-[15px] text-[#f6f0e4] hover:border-[#e2c47a]";

/** Devolve "AAAA-MM-DD" quando a pessoa termina de tocar; cada etapa tem o seu "voltar". */
export function SeletorDeData(props: { titulo: string; tx: TextosDaData; aoEscolher: (iso: string) => void }) {
  const [mes, setMes] = useState<number | null>(null);
  const [dia, setDia] = useState<number | null>(null);
  const [decada, setDecada] = useState<number | null>(null);
  const anoAtual = new Date().getFullYear();
  const decadas: number[] = [];
  for (let d = 1940; d <= anoAtual - 14; d += 10) decadas.push(d);
  const diasNoMes = mes === 2 ? 29 : mes === 4 || mes === 6 || mes === 9 || mes === 11 ? 30 : 31;

  return (
    <div>
      <h2 className={`${SERIF} text-2xl text-[#f6e3a8]`}>{props.titulo}</h2>
      {mes === null ? (
        <>
          <p className="mt-3 text-sm text-[#c3bad3]">{props.tx.mes}</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {props.tx.meses.map((m, i) => (
              <button key={m} className={BOTAO_GRADE} onClick={() => setMes(i + 1)}>
                {m}
              </button>
            ))}
          </div>
        </>
      ) : dia === null ? (
        <>
          <p className="mt-3 text-sm text-[#c3bad3]">
            {props.tx.meses[mes - 1]} · {props.tx.dia}
          </p>
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {Array.from({ length: diasNoMes }, (_, i) => i + 1).map((d) => (
              <button key={d} className={`${BOTAO_GRADE} py-2.5 text-sm`} onClick={() => setDia(d)}>
                {d}
              </button>
            ))}
          </div>
          <button className="mt-3 text-sm text-[#e2c47a] underline" onClick={() => setMes(null)}>
            ← {props.tx.mes}
          </button>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-[#c3bad3]">
            {dia} {props.tx.meses[mes - 1]} · {props.tx.decada}
          </p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {decadas.map((d) => (
              <button key={d} className={`${BOTAO_GRADE} ${decada === d ? "border-[#e2c47a]" : ""}`} onClick={() => setDecada(d)}>
                {d}
              </button>
            ))}
          </div>
          {decada !== null && (
            <>
              <p className="mt-4 text-sm text-[#c3bad3]">{props.tx.ano}</p>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {Array.from({ length: 10 }, (_, i) => decada + i)
                  .filter((a) => a <= anoAtual - 14)
                  .map((a) => (
                    <button
                      key={a}
                      className={BOTAO_GRADE}
                      onClick={() => {
                        // 29/02 num ano que não é bissexto vira 28/02: melhor do que travar a pessoa.
                        const bissexto = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
                        const d = mes === 2 && dia === 29 && !bissexto ? 28 : dia;
                        props.aoEscolher(`${a}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
                      }}
                    >
                      {a}
                    </button>
                  ))}
              </div>
            </>
          )}
          <button className="mt-3 text-sm text-[#e2c47a] underline" onClick={() => setDia(null)}>
            ← {props.tx.dia}
          </button>
        </>
      )}
    </div>
  );
}

export function Interludio(props: { frase: string; assinatura: string; botao: string; cor: string; aoContinuar: () => void; foto?: string | null }) {
  return (
    <div className={`${CARTAO} text-center`}>
      {props.foto ? (
        <div className="mb-4 flex justify-center">
          <FotoDaGuia url={props.foto} nome={props.assinatura} tamanho={72} />
        </div>
      ) : null}
      <p className={`${SERIF} text-xl leading-relaxed text-[#f6e3a8]`}>“{props.frase}”</p>
      <p className="mt-3 text-sm text-[#c9a54e]">— {props.assinatura}</p>
      <button className="mt-6 w-full rounded-full px-6 py-4 text-base font-semibold text-white shadow-lg" style={{ background: props.cor }} onClick={props.aoContinuar}>
        {props.botao}
      </button>
    </div>
  );
}

/**
 * Mostra as linhas uma a uma (~0,9 s cada) e chama `aoTerminar` depois da última. As linhas são o cálculo
 * que já foi feito — a espera é só o ritmo de leitura, para a pessoa VER o que foi cruzado.
 */
export function TelaDeCalculo(props: { titulo: string; linhas: string[]; aoTerminar: () => void; foto?: string | null }) {
  const [vistas, setVistas] = useState(0);
  const { linhas, aoTerminar } = props;
  useEffect(() => {
    if (vistas >= linhas.length) {
      const t = setTimeout(aoTerminar, 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVistas((v) => v + 1), 900);
    return () => clearTimeout(t);
  }, [vistas, linhas.length, aoTerminar]);
  return (
    <div className={CARTAO}>
      {props.foto ? (
        <div className="mb-4 flex justify-center">
          <FotoDaGuia url={props.foto} tamanho={84} pulsando />
        </div>
      ) : null}
      <p className={SOBRETITULO}>{props.titulo}</p>
      <ul className="mt-4 space-y-3">
        {linhas.slice(0, vistas).map((l) => (
          <li key={l} className="flex gap-2 border-b border-[#c9a54e]/10 pb-2 text-[15px] text-[#f6f0e4]">
            <span className="text-[#7fd1a0]">✓</span>
            <span>{l}</span>
          </li>
        ))}
        {vistas < linhas.length && <li className="animate-pulse text-[15px] text-[#9d94b2]">…</li>}
      </ul>
    </div>
  );
}
