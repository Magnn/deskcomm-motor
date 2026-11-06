"use client";
/**
 * A LEITURA DO MAPA na área (migration 0959), embaixo do mapa grátis (`_mapa.tsx`): um toque pede a leitura do mapa
 * que está na tela; o Sol abre de graça e Lua, Ascendente, Vênus e Marte mostram só a posição, com a leitura, a
 * síntese e o passo fechados até pagar (créditos com um toque, Pix ali mesmo ou cartão). Mesmo molde da mão.
 */
import * as React from "react";

import { Check, Copy, CreditCard, Loader2, Lock, QrCode, Sparkles, WalletCards } from "lucide-react";

import { EVENTO_DE_VALOR } from "@/lib/area-do-cliente/avisos";
import type { ParteDoMapa } from "@/lib/area-do-cliente/leitura-do-mapa";
import { copyToClipboard } from "@/lib/clipboard";

import { anunciarSaldo, useSaldo } from "./_carteira";
import { postarJson } from "./_circulo";
import { type TextosDaArea } from "./_client";
import { BOTAO, SERIF, SOBRETITULO_NOTURNO } from "./_tema";

export interface TextosDaLeituraDoMapa {
  titulo: string;
  chamada: string;
  gratis: string;
  pedir: string;
  lendo: string;
  automatica: string;
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
  sintese: string;
  passo: string;
  em: string;
  casa: string;
  nomes: Record<ParteDoMapa, string>;
  temas: Record<ParteDoMapa, string>;
}

export interface Nascimento {
  data: string;
  hora: string | null;
  cidade_id: number;
}

export interface LeituraDoMapaNaArea {
  id: string;
  paga: boolean;
  nascimento: Nascimento;
  partes: Array<{ parte: ParteDoMapa; signo: string; grau: number; casa: number | null; leitura: string | null }>;
  sintese: string | null;
  passo: string | null;
}

export interface LeituraDoMapaInicial {
  preco: string;
  creditos: number;
  /** Com os créditos ligados: o saldo de partida. `null` = só Pix e cartão. */
  saldo: number | null;
  ultima: LeituraDoMapaNaArea | null;
}

const mesmoNascimento = (a: Nascimento, b: Nascimento) => a.data === b.data && (a.hora ?? null) === (b.hora ?? null) && a.cidade_id === b.cidade_id;

type Etapa = { tipo: "pedir" } | { tipo: "lendo" } | { tipo: "leitura"; l: LeituraDoMapaNaArea } | { tipo: "pix"; l: LeituraDoMapaNaArea; copiaECola: string; qrPng: string | null };

export function LeituraDoMapa({
  slug,
  cor,
  tx,
  tl,
  nomes,
  nascimento,
  inicial,
}: {
  slug: string;
  cor: string;
  tx: TextosDaArea;
  tl: TextosDaLeituraDoMapa;
  /** Os nomes dos signos já traduzidos (chave = o nome em português), os mesmos do mapa. */
  nomes: Record<string, string>;
  nascimento: Nascimento;
  inicial: LeituraDoMapaInicial;
}) {
  const daqui = inicial.ultima && mesmoNascimento(inicial.ultima.nascimento, nascimento) ? inicial.ultima : null;
  const [etapa, setEtapa] = React.useState<Etapa>(daqui ? { tipo: "leitura", l: daqui } : { tipo: "pedir" });
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [copiado, setCopiado] = React.useState(false);
  const saldo = useSaldo(inicial.saldo ?? 0);
  const comCreditos = inicial.saldo !== null;
  const base = `/api/v1/area/publica/${slug}/mapa/leitura`;
  const signo = (s: string) => nomes[s] ?? s;

  // Pix: pergunta a cada 3 s; pagou, a leitura inteira abre.
  React.useEffect(() => {
    if (etapa.tipo !== "pix") return;
    const id = etapa.l.id;
    const t = window.setInterval(async () => {
      const res = await fetch(`${base}/${id}`, { credentials: "same-origin" }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { data?: LeituraDoMapaNaArea } | null;
      if (j?.data?.paga) {
        window.clearInterval(t);
        setEtapa({ tipo: "leitura", l: j.data });
        window.dispatchEvent(new Event(EVENTO_DE_VALOR));
      }
    }, 3000);
    return () => window.clearInterval(t);
  }, [etapa, base]);

  const pedir = async () => {
    setErro(null);
    setEtapa({ tipo: "lendo" });
    const r = await postarJson<LeituraDoMapaNaArea>(base, nascimento, tx);
    if (r.ok) {
      setEtapa({ tipo: "leitura", l: r.data });
      return;
    }
    setErro(r.mensagem);
    setEtapa({ tipo: "pedir" });
  };

  const liberar = async (l: LeituraDoMapaNaArea, forma: "creditos" | "pix" | "cartao") => {
    setEnviando(true);
    setErro(null);
    const r = await postarJson<{ paga: boolean; saldo?: number; leitura?: LeituraDoMapaNaArea | null; cobranca?: { copiaECola?: string; qrPng?: string | null; url?: string } }>(
      `${base}/${l.id}/liberar`,
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
      if (r.data.leitura) setEtapa({ tipo: "leitura", l: r.data.leitura });
      window.dispatchEvent(new Event(EVENTO_DE_VALOR));
      return;
    }
    if (r.data.cobranca?.url) {
      window.location.href = r.data.cobranca.url;
      return;
    }
    setEtapa({ tipo: "pix", l, copiaECola: r.data.cobranca?.copiaECola ?? "", qrPng: r.data.cobranca?.qrPng ?? null });
  };

  const contorno =
    "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#c9a54e]/60 px-5 text-sm font-semibold text-[#f0dca8] transition hover:bg-white/5 disabled:opacity-45 sm:flex-1";

  let conteudo: React.ReactNode;
  if (etapa.tipo === "pedir") {
    conteudo = (
      <div className="space-y-3 text-center">
        <p className={`${SERIF} text-[20px] leading-snug`}>{tl.chamada}</p>
        <p className="mx-auto max-w-sm text-sm text-[#cfc6de]">{tl.gratis}</p>
        <button type="button" onClick={() => void pedir()} className={`${BOTAO} w-full`} style={{ background: cor, color: "#1b1433" }} data-testid="area-mapa-ler">
          <Sparkles className="size-4" aria-hidden />
          {tl.pedir}
        </button>
      </div>
    );
  } else if (etapa.tipo === "lendo") {
    conteudo = (
      <p className="flex items-center justify-center gap-2 py-6 text-[15px] text-[#f0dca8]" aria-live="polite" data-testid="area-mapa-lendo">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {tl.lendo}
      </p>
    );
  } else {
    const l = etapa.l;
    conteudo = (
      <div className="space-y-3" data-testid="area-mapa-leitura">
        <p className="text-center text-xs text-[#b7aecb]">{tl.automatica}</p>
        <ol className="space-y-3">
          {l.partes.map((p) => (
            <li key={p.parte} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4" data-testid={`area-mapa-parte-${p.parte}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-[#f6f0e4]">
                  {tl.nomes[p.parte]} {tl.em} {signo(p.signo)}
                  {p.casa && p.parte !== "ascendente" ? <span className="font-normal text-[#9d94b2]"> · {tl.casa} {p.casa}</span> : null}
                </p>
                {p.leitura === null ? <Lock className="size-4 shrink-0 text-[#c9a54e]" aria-hidden /> : null}
              </div>
              <p className="text-[12px] uppercase tracking-wider text-[#8f86a6]">{tl.temas[p.parte]}</p>
              {p.leitura !== null ? (
                <p className="mt-2 text-[15px] leading-relaxed text-[#ece6f5]">{p.leitura}</p>
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
        {l.paga ? (
          <div className="space-y-3 rounded-2xl bg-[#241a45] p-4 text-[#f6f0e4]" data-testid="area-mapa-sintese">
            <p className={SOBRETITULO_NOTURNO}>{tl.sintese}</p>
            <p className="text-[15px] leading-relaxed">{l.sintese}</p>
            <p className={SOBRETITULO_NOTURNO}>{tl.passo}</p>
            <p className="text-[15px] leading-relaxed">{l.passo}</p>
          </div>
        ) : etapa.tipo === "pix" ? (
          <div className="space-y-3 rounded-2xl bg-[#1d1638] p-4 text-[#f6f0e4]" data-testid="area-mapa-pix">
            {etapa.qrPng ? (
              // eslint-disable-next-line @next/next/no-img-element -- QR hospedado pela Stripe
              <img src={etapa.qrPng} alt="QR Pix" className="mx-auto size-44" />
            ) : null}
            <p className="break-all rounded-xl bg-white/[0.06] p-3 font-mono text-xs leading-relaxed">{etapa.copiaECola}</p>
            <button type="button" onClick={async () => setCopiado(await copyToClipboard(etapa.copiaECola))} className={`${BOTAO} w-full`} style={{ background: cor, color: "#1b1433" }}>
              {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copiado ? tl.codigoCopiado : tl.copiarCodigo}
            </button>
            <p className="flex items-center justify-center gap-2 text-sm text-[#c3bad3]">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {tl.esperandoPagamento}
            </p>
          </div>
        ) : (
          <div className="space-y-3 rounded-2xl border border-[#c9a54e]/40 bg-[#1d1638] p-4 text-center" data-testid="area-mapa-liberar">
            <p className={`${SERIF} text-[20px] text-[#f6f0e4]`}>{tl.abrirTudo}</p>
            <p className="text-sm text-[#cfc6de]">
              {tl.abrirTudoTexto} · {inicial.preco}
            </p>
            {comCreditos ? (
              <>
                <button type="button" disabled={enviando} onClick={() => void liberar(l, "creditos")} className={`${BOTAO} w-full`} style={{ background: cor, color: "#1b1433" }}>
                  {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <WalletCards className="size-4" aria-hidden />}
                  {tl.usarCreditos} · {inicial.creditos} {tl.creditos}
                </button>
                <p className="text-xs text-[#b7aecb]">
                  {tl.seusCreditos}: {saldo}
                </p>
              </>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={enviando}
                onClick={() => void liberar(l, "pix")}
                className={comCreditos ? contorno : `${BOTAO} w-full sm:flex-1`}
                style={comCreditos ? undefined : { background: cor, color: "#1b1433" }}
                data-testid="area-mapa-pix-botao"
              >
                <QrCode className="size-4" aria-hidden />
                {tl.pagarComPix}
              </button>
              <button type="button" disabled={enviando} onClick={() => void liberar(l, "cartao")} className={contorno}>
                <CreditCard className="size-4" aria-hidden />
                {tl.pagarComCartao}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-3xl bg-gradient-to-b from-[#1b1433] to-[#140f27] p-5 text-[#f6f0e4] shadow-xl" data-testid="area-mapa-leitura-bloco">
      <p className={SOBRETITULO_NOTURNO}>✦ {tl.titulo}</p>
      {conteudo}
      {erro ? (
        <p role="alert" className="rounded-xl bg-[#3a1f2e] p-3 text-center text-sm text-[#ffd5dc]">
          {erro}
        </p>
      ) : null}
    </section>
  );
}
