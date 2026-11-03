"use client";
/**
 * A INTERPRETAÇÃO DE SONHOS na área (migration 0952): contar o sonho, ver a lua "lendo" e receber os símbolos — o
 * primeiro aberto de graça, os outros com o nome à vista e a leitura fechada até pagar (créditos com um toque,
 * Pix ali mesmo ou cartão). Mesmo molde da leitura da mão (`_mao.tsx`).
 */
import * as React from "react";

import { Check, Copy, CreditCard, Loader2, Lock, MoonStar, PenLine, QrCode, WalletCards } from "lucide-react";

import { copyToClipboard } from "@/lib/clipboard";
import { EVENTO_DE_VALOR } from "@/lib/area-do-cliente/avisos";
import { RELATO_MAXIMO, RELATO_MINIMO } from "@/lib/area-do-cliente/sonho";

import { anunciarSaldo, useSaldo } from "./_carteira";
import { postarJson } from "./_circulo";
import { type TextosDaArea } from "./_client";
import { BOTAO, SERIF, SOBRETITULO_NOTURNO } from "./_tema";

export interface TextosDoSonho {
  titulo: string;
  chamada: string;
  gratis: string;
  placeholder: string;
  caracteres: string;
  interpretar: string;
  privacidade: string;
  lendo: string;
  lendoDica: string;
  automatica: string;
  seuSonho: string;
  abrirTudo: string;
  abrirTudoTexto: string;
  usarCreditos: string;
  creditos: string;
  seusCreditos: string;
  pagarComPix: string;
  pagarComCartao: string;
  esperandoPagamento: string;
  copiarCodigo: string;
  codigoCopiado: string;
  mensagem: string;
  passo: string;
  outroSonho: string;
  limiteDoDia: string;
}

export interface SonhoNaArea {
  id: string;
  quando: string;
  relato: string;
  paga: boolean;
  simbolos: Array<{ simbolo: string; leitura: string | null }>;
  mensagem: string | null;
  passo: string | null;
}

export interface SonhoInicial {
  preco: string;
  creditos: number;
  /** Com os créditos ligados: o saldo de partida. `null` = só Pix e cartão. */
  saldo: number | null;
  restamHoje: number;
  sonhos: SonhoNaArea[];
}

type Etapa =
  | { tipo: "escrever" }
  | { tipo: "lendo" }
  | { tipo: "leitura"; sonho: SonhoNaArea }
  | { tipo: "pix"; sonho: SonhoNaArea; copiaECola: string; qrPng: string | null };

const ANIMACOES = `
@keyframes sonho-flutua { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
@keyframes sonho-brilha { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
@keyframes sonho-entra { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
.sonho-flutua { animation: sonho-flutua 3.2s ease-in-out infinite }
.sonho-brilha { animation: sonho-brilha 2.4s ease-in-out infinite }
.sonho-entra { animation: sonho-entra .45s ease-out both }
@media (prefers-reduced-motion: reduce) { .sonho-flutua, .sonho-brilha, .sonho-entra { animation: none } }
`;

const CORES = ["#b89cff", "#8fb4ff", "#f3a6bd", "#7fd1a0"];

/** A lua crescente entre nuvens e estrelas; `lendo` faz as estrelas piscarem. */
function LuaDoSonho({ lendo = false }: { lendo?: boolean }) {
  return (
    <svg viewBox="0 0 200 140" className="sonho-flutua mx-auto h-36 w-auto" aria-hidden>
      <defs>
        <radialGradient id="sonho-aura" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#b89cff" stopOpacity=".35" />
          <stop offset="100%" stopColor="#b89cff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="66" rx="92" ry="62" fill="url(#sonho-aura)" />
      {/* O crescente: um disco com outro disco recortado por cima. */}
      <mask id="sonho-crescente">
        <rect width="200" height="140" fill="#fff" />
        <circle cx="122" cy="54" r="36" fill="#000" />
      </mask>
      <circle cx="102" cy="64" r="40" fill="#f0dca8" opacity=".95" mask="url(#sonho-crescente)" />
      <path d="M38 112c6-10 22-12 30-4c6-8 22-8 26 4c8-2 16 4 14 12H34c-4-6-2-12 4-12z" fill="#2a2150" opacity=".9" />
      <path d="M126 104c4-8 16-9 22-3c5-5 15-4 17 4c6-1 11 4 9 9h-50c-3-4-2-9 2-10z" fill="#2a2150" opacity=".8" />
      <g fill="#e8c987" className={lendo ? "sonho-brilha" : undefined}>
        <circle cx="30" cy="30" r="2" />
        <circle cx="168" cy="26" r="1.6" />
        <circle cx="178" cy="70" r="1.2" />
        <circle cx="22" cy="74" r="1.4" />
        <path d="M150 50l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
      </g>
    </svg>
  );
}

export function SonhosNaArea({ slug, cor, tx, ts, inicial }: { slug: string; cor: string; tx: TextosDaArea; ts: TextosDoSonho; inicial: SonhoInicial }) {
  const ultimo = inicial.sonhos[0];
  const [etapa, setEtapa] = React.useState<Etapa>(ultimo ? { tipo: "leitura", sonho: ultimo } : { tipo: "escrever" });
  const [relato, setRelato] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [copiado, setCopiado] = React.useState(false);
  const [restam, setRestam] = React.useState(inicial.restamHoje);
  const saldo = useSaldo(inicial.saldo ?? 0);
  const comCreditos = inicial.saldo !== null;
  const base = `/api/v1/area/publica/${slug}/sonho`;
  const tamanho = relato.trim().length;

  // Pix: pergunta a cada 3 s; pagou, a interpretação inteira abre.
  React.useEffect(() => {
    if (etapa.tipo !== "pix") return;
    const id = etapa.sonho.id;
    const t = window.setInterval(async () => {
      const res = await fetch(`${base}/${id}`, { credentials: "same-origin" }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { data?: SonhoNaArea } | null;
      if (j?.data?.paga) {
        window.clearInterval(t);
        setEtapa({ tipo: "leitura", sonho: j.data });
        window.dispatchEvent(new Event(EVENTO_DE_VALOR));
      }
    }, 3000);
    return () => window.clearInterval(t);
  }, [etapa, base]);

  const contar = async () => {
    setErro(null);
    setEtapa({ tipo: "lendo" });
    const r = await postarJson<SonhoNaArea>(base, { relato }, tx);
    if (r.ok) {
      setRestam((n) => Math.max(0, n - 1));
      setRelato("");
      setEtapa({ tipo: "leitura", sonho: r.data });
      return;
    }
    setErro(r.mensagem);
    setEtapa({ tipo: "escrever" });
  };

  const liberar = async (sonho: SonhoNaArea, forma: "creditos" | "pix" | "cartao") => {
    setEnviando(true);
    setErro(null);
    const r = await postarJson<{ paga: boolean; saldo?: number; sonho?: SonhoNaArea | null; cobranca?: { copiaECola?: string; qrPng?: string | null; url?: string } }>(
      `${base}/${sonho.id}/liberar`,
      { forma },
      tx,
    );
    setEnviando(false);
    if (!r.ok) {
      setErro(r.mensagem);
      return;
    }
    if (r.data.paga) {
      if (typeof r.data.saldo === "number") anunciarSaldo(r.data.saldo);
      if (r.data.sonho) setEtapa({ tipo: "leitura", sonho: r.data.sonho });
      window.dispatchEvent(new Event(EVENTO_DE_VALOR));
      return;
    }
    if (r.data.cobranca?.url) {
      window.location.href = r.data.cobranca.url;
      return;
    }
    setEtapa({ tipo: "pix", sonho, copiaECola: r.data.cobranca?.copiaECola ?? "", qrPng: r.data.cobranca?.qrPng ?? null });
  };

  let conteudo: React.ReactNode;
  if (etapa.tipo === "escrever") {
    conteudo = (
      <div className="sonho-entra space-y-4">
        <LuaDoSonho />
        <p className={`${SERIF} text-center text-[22px] leading-snug`}>{ts.chamada}</p>
        <p className="mx-auto max-w-sm text-center text-sm text-[#cfc6de]">{ts.gratis}</p>
        {restam > 0 ? (
          <>
            <textarea
              value={relato}
              onChange={(e) => setRelato(e.target.value.slice(0, RELATO_MAXIMO))}
              rows={6}
              placeholder={ts.placeholder}
              className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-[15px] leading-relaxed text-[#f6f0e4] placeholder:text-[#8f86a6] focus:border-[#b89cff]/60 focus:outline-none"
              data-testid="area-sonho-relato"
            />
            <p className="-mt-2 text-right text-[11px] text-[#8f86a6]">
              {tamanho}/{RELATO_MAXIMO} {ts.caracteres}
            </p>
            <button
              type="button"
              disabled={tamanho < RELATO_MINIMO}
              onClick={() => void contar()}
              className={`${BOTAO} w-full disabled:opacity-45`}
              style={{ background: cor, color: "#1b1433" }}
              data-testid="area-sonho-interpretar"
            >
              <MoonStar className="size-4" aria-hidden />
              {ts.interpretar}
            </button>
          </>
        ) : (
          <p className="text-center text-sm text-[#f0dca8]">{ts.limiteDoDia}</p>
        )}
        <p className="text-center text-[11px] text-[#8f86a6]">{ts.privacidade}</p>
      </div>
    );
  } else if (etapa.tipo === "lendo") {
    conteudo = (
      <div className="space-y-3 text-center" aria-live="polite" data-testid="area-sonho-lendo">
        <LuaDoSonho lendo />
        <p className={`${SERIF} text-[20px]`}>{ts.lendo}</p>
        <p className="text-sm text-[#b7aecb]">{ts.lendoDica}</p>
      </div>
    );
  } else {
    const sonho = etapa.sonho;
    conteudo = (
      <div className="space-y-4" data-testid="area-sonho-leitura">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] uppercase tracking-wider text-[#8f86a6]">{ts.seuSonho}</p>
          <p className="mt-1 line-clamp-4 text-[14px] italic leading-relaxed text-[#d9d0e6]">“{sonho.relato}”</p>
        </div>
        <p className="text-center text-xs text-[#b7aecb]">{ts.automatica}</p>
        <ol className="space-y-3">
          {sonho.simbolos.map((s, i) => (
            <li
              key={`${s.simbolo}-${i}`}
              className="sonho-entra rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              style={{ animationDelay: `${i * 90}ms`, borderLeft: `3px solid ${CORES[i % CORES.length]}` }}
              data-testid={`area-sonho-simbolo-${i}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={`${SERIF} text-[18px] first-letter:uppercase text-[#f6f0e4]`}>{s.simbolo}</p>
                {s.leitura === null ? <Lock className="size-4 text-[#c9a54e]" aria-hidden /> : null}
              </div>
              {s.leitura !== null ? (
                <p className="mt-2 text-[15px] leading-relaxed text-[#ece6f5]">{s.leitura}</p>
              ) : (
                <div className="mt-2 space-y-1.5" aria-hidden>
                  <div className="h-2.5 w-full rounded-full bg-white/10" />
                  <div className="h-2.5 w-11/12 rounded-full bg-white/10" />
                  <div className="h-2.5 w-3/4 rounded-full bg-white/10" />
                </div>
              )}
            </li>
          ))}
        </ol>

        {sonho.paga ? (
          <div className="space-y-3 rounded-2xl bg-[#241a45] p-4 text-[#f6f0e4]" data-testid="area-sonho-mensagem">
            <p className={SOBRETITULO_NOTURNO}>{ts.mensagem}</p>
            <p className="text-[15px] leading-relaxed">{sonho.mensagem}</p>
            <p className={SOBRETITULO_NOTURNO}>{ts.passo}</p>
            <p className="text-[15px] leading-relaxed">{sonho.passo}</p>
          </div>
        ) : etapa.tipo === "pix" ? (
          <div className="space-y-3 rounded-2xl bg-[#1d1638] p-4 text-[#f6f0e4]" data-testid="area-sonho-pix">
            {etapa.qrPng ? (
              // eslint-disable-next-line @next/next/no-img-element -- QR hospedado pela Stripe
              <img src={etapa.qrPng} alt="QR Pix" className="mx-auto size-44" />
            ) : null}
            <p className="break-all rounded-xl bg-white/[0.06] p-3 font-mono text-xs leading-relaxed">{etapa.copiaECola}</p>
            <button type="button" onClick={async () => setCopiado(await copyToClipboard(etapa.copiaECola))} className={`${BOTAO} w-full`} style={{ background: cor, color: "#1b1433" }}>
              {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copiado ? ts.codigoCopiado : ts.copiarCodigo}
            </button>
            <p className="flex items-center justify-center gap-2 text-sm text-[#c3bad3]">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {ts.esperandoPagamento}
            </p>
          </div>
        ) : (
          <div className="space-y-3 rounded-2xl border border-[#c9a54e]/40 bg-[#1d1638] p-4 text-center" data-testid="area-sonho-liberar">
            <p className={`${SERIF} text-[20px] text-[#f6f0e4]`}>{ts.abrirTudo}</p>
            <p className="text-sm text-[#cfc6de]">
              {ts.abrirTudoTexto} · {inicial.preco}
            </p>
            {comCreditos ? (
              <>
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => void liberar(sonho, "creditos")}
                  className={`${BOTAO} w-full`}
                  style={{ background: cor, color: "#1b1433" }}
                  data-testid="area-sonho-creditos"
                >
                  {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <WalletCards className="size-4" aria-hidden />}
                  {ts.usarCreditos} · {inicial.creditos} {ts.creditos}
                </button>
                <p className="text-xs text-[#b7aecb]">
                  {ts.seusCreditos}: {saldo}
                </p>
              </>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={enviando}
                onClick={() => void liberar(sonho, "pix")}
                className={
                  comCreditos
                    ? "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#c9a54e]/60 px-5 text-sm font-semibold text-[#f0dca8] transition hover:bg-white/5 disabled:opacity-45 sm:flex-1"
                    : `${BOTAO} w-full sm:flex-1`
                }
                style={comCreditos ? undefined : { background: cor, color: "#1b1433" }}
                data-testid="area-sonho-pix-botao"
              >
                <QrCode className="size-4" aria-hidden />
                {ts.pagarComPix}
              </button>
              <button
                type="button"
                disabled={enviando}
                onClick={() => void liberar(sonho, "cartao")}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#c9a54e]/60 px-5 text-sm font-semibold text-[#f0dca8] transition hover:bg-white/5 disabled:opacity-45 sm:flex-1"
              >
                <CreditCard className="size-4" aria-hidden />
                {ts.pagarComCartao}
              </button>
            </div>
          </div>
        )}
        {restam > 0 && etapa.tipo !== "pix" ? (
          <button
            type="button"
            onClick={() => setEtapa({ tipo: "escrever" })}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#c9a54e]/50 px-5 text-sm font-semibold text-[#f0dca8] transition hover:bg-white/5"
            data-testid="area-sonho-outro"
          >
            <PenLine className="size-4" aria-hidden />
            {ts.outroSonho}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-3xl bg-gradient-to-b from-[#1b1433] to-[#140f27] p-5 text-[#f6f0e4] shadow-xl" data-testid="area-sonho">
      <style>{ANIMACOES}</style>
      <p className={SOBRETITULO_NOTURNO}>☾ {ts.titulo}</p>
      {conteudo}
      {erro ? (
        <p role="alert" className="rounded-xl bg-[#3a1f2e] p-3 text-center text-sm text-[#ffd5dc]" data-testid="area-sonho-erro">
          {erro}
        </p>
      ) : null}
    </section>
  );
}
