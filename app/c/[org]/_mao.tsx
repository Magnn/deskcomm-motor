"use client";
/**
 * A LEITURA DA MÃO na área (migration 0951): fotografar a palma, ver a mão sendo "lida" e receber as cinco
 * linhas — a do coração aberta de graça, as outras com o que foi VISTO na foto e a leitura fechada até pagar
 * (créditos com um toque, Pix ali mesmo ou cartão).
 *
 * A foto é reduzida no próprio aparelho (lado maior de 1600 px, JPEG) antes de subir: chega rápido no 4G e
 * custa menos para a IA. Ela não é guardada no servidor.
 */
import * as React from "react";

import { Camera, Check, Copy, CreditCard, Loader2, Lock, QrCode, RotateCcw, Sparkles, WalletCards } from "lucide-react";

import { copyToClipboard } from "@/lib/clipboard";
import { EVENTO_DE_VALOR } from "@/lib/area-do-cliente/avisos";
import type { LinhaDaMao } from "@/lib/area-do-cliente/mao";

import { anunciarSaldo, useSaldo } from "./_carteira";
import { postarJson } from "./_circulo";
import { OuvirLeituraLonga, type TextosDoOuvir } from "./_ouvir";
import { type TextosDaArea } from "./_client";
import { BOTAO, SERIF, SOBRETITULO_NOTURNO } from "./_tema";

export interface TextosDaMao extends TextosDoOuvir {
  titulo: string;
  chamada: string;
  gratis: string;
  fotografar: string;
  dicas: readonly string[];
  privacidade: string;
  lendo: string;
  lendoDica: string;
  automatica: string;
  vistoNaFoto: string;
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
  novaFoto: string;
  limiteDoDia: string;
  nomes: Record<LinhaDaMao, string>;
  temas: Record<LinhaDaMao, string>;
}

export interface MaoNaArea {
  id: string;
  quando: string;
  paga: boolean;
  linhas: Array<{ linha: LinhaDaMao; visto: string; leitura: string | null }>;
  sintese: string | null;
  passo: string | null;
}

export interface MaoInicial {
  preco: string;
  creditos: number;
  /** Com os créditos ligados: o saldo de partida. `null` = só Pix e cartão. */
  saldo: number | null;
  restamHoje: number;
  maos: MaoNaArea[];
}

type Etapa =
  | { tipo: "inicio" }
  | { tipo: "lendo" }
  | { tipo: "leitura"; mao: MaoNaArea }
  | { tipo: "pix"; mao: MaoNaArea; copiaECola: string; qrPng: string | null };

const ANIMACOES = `
@keyframes mao-varre { 0% { transform: translateY(0) } 100% { transform: translateY(196px) } }
@keyframes mao-traco { from { stroke-dashoffset: 260 } to { stroke-dashoffset: 0 } }
@keyframes mao-brilha { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
@keyframes mao-entra { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
.mao-varre { animation: mao-varre 2.2s ease-in-out infinite alternate }
.mao-traco { stroke-dasharray: 260; animation: mao-traco 2.4s ease-out both }
.mao-brilha { animation: mao-brilha 2.8s ease-in-out infinite }
.mao-entra { animation: mao-entra .45s ease-out both }
@media (prefers-reduced-motion: reduce) { .mao-varre, .mao-traco, .mao-brilha, .mao-entra { animation: none } .mao-traco { stroke-dashoffset: 0 } }
`;

/** As cinco linhas desenhadas na palma, na mesma cor de cada cartão. */
const TRACOS: Record<LinhaDaMao, { d: string; cor: string }> = {
  coracao: { d: "M52 118 C70 104 98 100 124 108 C134 111 142 108 148 100", cor: "#f2a7b8" },
  cabeca: { d: "M50 136 C74 128 102 130 132 142", cor: "#a9c7f2" },
  vida: { d: "M66 126 C56 150 58 182 80 214", cor: "#9fdcb4" },
  destino: { d: "M100 222 C100 190 102 160 104 124", cor: "#e2c47a" },
  sol: { d: "M128 214 C126 190 128 166 132 146", cor: "#f5d27a" },
};

/** A mão em traço dourado; `linhas` acende as linhas (todas, ou só a que está aberta). */
function PalmaDesenhada({ acesas, varrendo = false }: { acesas: ReadonlyArray<LinhaDaMao>; varrendo?: boolean }) {
  return (
    <svg viewBox="0 0 200 250" className="mx-auto h-56 w-auto" aria-hidden>
      <defs>
        <radialGradient id="mao-aura" cx="50%" cy="58%" r="55%">
          <stop offset="0%" stopColor="#e2c47a" stopOpacity=".28" />
          <stop offset="100%" stopColor="#e2c47a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mao-feixe" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f0dca8" stopOpacity="0" />
          <stop offset="50%" stopColor="#f0dca8" stopOpacity=".55" />
          <stop offset="100%" stopColor="#f0dca8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="150" rx="96" ry="100" fill="url(#mao-aura)" className="mao-brilha" />
      {/* O contorno: punho, palma e cinco dedos. */}
      <path
        d="M70 246 L70 214 C52 196 40 172 40 146 L40 112 C40 104 50 100 56 108 L60 120 L60 56 C60 46 74 46 74 56 L76 112 L80 34 C80 22 96 22 96 34 L96 110 L102 30 C102 18 118 18 118 30 L116 112 L124 46 C124 36 138 36 138 46 L134 120 L150 92 C156 82 170 88 164 100 L146 150 C140 176 134 196 132 214 L132 246"
        fill="#1b1433"
        stroke="#c9a54e"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {(Object.keys(TRACOS) as LinhaDaMao[]).map((l) => (
        <path
          key={l}
          d={TRACOS[l].d}
          fill="none"
          stroke={acesas.includes(l) ? TRACOS[l].cor : "#c9a54e"}
          strokeOpacity={acesas.includes(l) ? 1 : 0.35}
          strokeWidth={acesas.includes(l) ? 3 : 1.6}
          strokeLinecap="round"
          className={acesas.includes(l) ? "mao-traco" : undefined}
        />
      ))}
      {varrendo ? <rect x="30" y="20" width="150" height="34" fill="url(#mao-feixe)" className="mao-varre" /> : null}
      <g fill="#e2c47a">
        <circle cx="22" cy="40" r="1.4" opacity=".7" />
        <circle cx="180" cy="62" r="1.8" opacity=".5" />
        <circle cx="176" cy="200" r="1.2" opacity=".8" />
        <circle cx="18" cy="190" r="1.6" opacity=".45" />
      </g>
    </svg>
  );
}

/** Reduz a foto no aparelho: lado maior de 1600 px, JPEG 85%. Sem canvas (navegador antigo), manda como veio. */
async function reduzirFoto(arquivo: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    return blob ?? arquivo;
  } catch {
    return arquivo;
  }
}

export function LeituraDaMaoNaArea({ slug, cor, tx, tm, inicial }: { slug: string; cor: string; tx: TextosDaArea; tm: TextosDaMao; inicial: MaoInicial }) {
  const ultima = inicial.maos[0];
  const [etapa, setEtapa] = React.useState<Etapa>(ultima ? { tipo: "leitura", mao: ultima } : { tipo: "inicio" });
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [copiado, setCopiado] = React.useState(false);
  const [restam, setRestam] = React.useState(inicial.restamHoje);
  const saldo = useSaldo(inicial.saldo ?? 0);
  const comCreditos = inicial.saldo !== null;
  const entrada = React.useRef<HTMLInputElement>(null);
  const base = `/api/v1/area/publica/${slug}/mao`;

  // Pix: pergunta a cada 3 s; pagou, a leitura inteira abre.
  React.useEffect(() => {
    if (etapa.tipo !== "pix") return;
    const id = etapa.mao.id;
    const t = window.setInterval(async () => {
      const res = await fetch(`${base}/${id}`, { credentials: "same-origin" }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { data?: MaoNaArea } | null;
      if (j?.data?.paga) {
        window.clearInterval(t);
        setEtapa({ tipo: "leitura", mao: j.data });
        window.dispatchEvent(new Event(EVENTO_DE_VALOR));
      }
    }, 3000);
    return () => window.clearInterval(t);
  }, [etapa, base]);

  const mandarFoto = async (arquivo: File) => {
    setErro(null);
    setEtapa({ tipo: "lendo" });
    const corpo = new FormData();
    corpo.append("foto", await reduzirFoto(arquivo), "mao.jpg");
    try {
      const res = await fetch(base, { method: "POST", body: corpo, credentials: "same-origin" });
      const j = (await res.json().catch(() => null)) as { data?: MaoNaArea; error?: { message?: string } } | null;
      if (res.ok && j?.data) {
        setRestam((r) => Math.max(0, r - 1));
        setEtapa({ tipo: "leitura", mao: j.data });
        return;
      }
      setErro(j?.error?.message ?? tx.naoFoiPossivel);
    } catch {
      setErro(tx.naoFoiPossivel);
    }
    setEtapa(ultima ? { tipo: "leitura", mao: ultima } : { tipo: "inicio" });
  };

  const liberar = async (mao: MaoNaArea, forma: "creditos" | "pix" | "cartao") => {
    setEnviando(true);
    setErro(null);
    const r = await postarJson<{ paga: boolean; saldo?: number; mao?: MaoNaArea | null; cobranca?: { copiaECola?: string; qrPng?: string | null; url?: string } }>(
      `${base}/${mao.id}/liberar`,
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
      if (r.data.mao) setEtapa({ tipo: "leitura", mao: r.data.mao });
      window.dispatchEvent(new Event(EVENTO_DE_VALOR));
      return;
    }
    if (r.data.cobranca?.url) {
      window.location.href = r.data.cobranca.url;
      return;
    }
    setEtapa({ tipo: "pix", mao, copiaECola: r.data.cobranca?.copiaECola ?? "", qrPng: r.data.cobranca?.qrPng ?? null });
  };

  const escolherFoto = (
    <input
      ref={entrada}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      capture="environment"
      className="hidden"
      data-testid="area-mao-foto"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) void mandarFoto(f);
      }}
    />
  );
  const botaoFoto = (rotulo: string, contorno = false) => (
    <button
      type="button"
      disabled={restam <= 0}
      onClick={() => entrada.current?.click()}
      className={
        contorno
          ? "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#c9a54e]/50 px-5 text-sm font-semibold text-[#f0dca8] transition hover:bg-white/5 disabled:opacity-45"
          : `${BOTAO} w-full disabled:opacity-45`
      }
      style={contorno ? undefined : { background: cor, color: "#1b1433" }}
      data-testid="area-mao-fotografar"
    >
      {contorno ? <RotateCcw className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />}
      {rotulo}
    </button>
  );

  let conteudo: React.ReactNode;
  if (etapa.tipo === "inicio") {
    conteudo = (
      <div className="mao-entra space-y-4 text-center">
        <PalmaDesenhada acesas={["coracao"]} />
        <p className={`${SERIF} text-[22px] leading-snug`}>{tm.chamada}</p>
        <p className="mx-auto max-w-sm text-sm text-[#cfc6de]">{tm.gratis}</p>
        <ul className="mx-auto max-w-xs space-y-1 text-left text-[13px] text-[#b7aecb]">
          {tm.dicas.map((d) => (
            <li key={d} className="flex gap-2">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-[#c9a54e]" aria-hidden />
              {d}
            </li>
          ))}
        </ul>
        {restam > 0 ? botaoFoto(tm.fotografar) : <p className="text-sm text-[#f0dca8]">{tm.limiteDoDia}</p>}
        <p className="text-[11px] text-[#8f86a6]">{tm.privacidade}</p>
      </div>
    );
  } else if (etapa.tipo === "lendo") {
    conteudo = (
      <div className="space-y-3 text-center" aria-live="polite" data-testid="area-mao-lendo">
        <PalmaDesenhada acesas={[]} varrendo />
        <p className={`${SERIF} text-[20px]`}>{tm.lendo}</p>
        <p className="text-sm text-[#b7aecb]">{tm.lendoDica}</p>
      </div>
    );
  } else {
    const mao = etapa.mao;
    const abertas = mao.linhas.filter((l) => l.leitura !== null).map((l) => l.linha);
    conteudo = (
      <div className="space-y-4" data-testid="area-mao-leitura">
        <PalmaDesenhada acesas={abertas} />
        <p className="text-center text-xs text-[#b7aecb]">{tm.automatica}</p>
        <ol className="space-y-3">
          {mao.linhas.map((l, i) => (
            <li
              key={l.linha}
              className="mao-entra rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              style={{ animationDelay: `${i * 90}ms`, borderLeft: `3px solid ${TRACOS[l.linha].cor}` }}
              data-testid={`area-mao-linha-${l.linha}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-[#f6f0e4]">{tm.nomes[l.linha]}</p>
                {l.leitura === null ? <Lock className="size-4 text-[#c9a54e]" aria-hidden /> : null}
              </div>
              <p className="text-[12px] uppercase tracking-wider text-[#8f86a6]">{tm.temas[l.linha]}</p>
              {l.visto ? (
                <p className="mt-2 text-[13px] italic text-[#d9d0e6]">
                  {tm.vistoNaFoto} {l.visto}
                </p>
              ) : null}
              {l.leitura !== null ? (
                <p className="mt-2 text-[15px] leading-relaxed text-[#ece6f5]">{l.leitura}</p>
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

        {mao.paga ? (
          <div className="space-y-3 rounded-2xl bg-[#241a45] p-4 text-[#f6f0e4]" data-testid="area-mao-sintese">
            <OuvirLeituraLonga url={`${base}/${mao.id}/voz`} tx={tm} />
            <p className={SOBRETITULO_NOTURNO}>{tm.sintese}</p>
            <p className="text-[15px] leading-relaxed">{mao.sintese}</p>
            <p className={SOBRETITULO_NOTURNO}>{tm.passo}</p>
            <p className="text-[15px] leading-relaxed">{mao.passo}</p>
          </div>
        ) : etapa.tipo === "pix" ? (
          <div className="space-y-3 rounded-2xl bg-[#1d1638] p-4 text-[#f6f0e4]" data-testid="area-mao-pix">
            {etapa.qrPng ? (
              // eslint-disable-next-line @next/next/no-img-element -- QR hospedado pela Stripe
              <img src={etapa.qrPng} alt="QR Pix" className="mx-auto size-44" />
            ) : null}
            <p className="break-all rounded-xl bg-white/[0.06] p-3 font-mono text-xs leading-relaxed">{etapa.copiaECola}</p>
            <button type="button" onClick={async () => setCopiado(await copyToClipboard(etapa.copiaECola))} className={`${BOTAO} w-full`} style={{ background: cor, color: "#1b1433" }}>
              {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copiado ? tm.codigoCopiado : tm.copiarCodigo}
            </button>
            <p className="flex items-center justify-center gap-2 text-sm text-[#c3bad3]">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {tm.esperandoPagamento}
            </p>
          </div>
        ) : (
          <div className="space-y-3 rounded-2xl border border-[#c9a54e]/40 bg-[#1d1638] p-4 text-center" data-testid="area-mao-liberar">
            <p className={`${SERIF} text-[20px] text-[#f6f0e4]`}>{tm.abrirTudo}</p>
            <p className="text-sm text-[#cfc6de]">
              {tm.abrirTudoTexto} · {inicial.preco}
            </p>
            {comCreditos ? (
              <>
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => void liberar(mao, "creditos")}
                  className={`${BOTAO} w-full`}
                  style={{ background: cor, color: "#1b1433" }}
                  data-testid="area-mao-creditos"
                >
                  {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <WalletCards className="size-4" aria-hidden />}
                  {tm.usarCreditos} · {inicial.creditos} {tm.creditos}
                </button>
                <p className="text-xs text-[#b7aecb]">
                  {tm.seusCreditos}: {saldo}
                </p>
              </>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={enviando}
                onClick={() => void liberar(mao, "pix")}
                className={
                  comCreditos
                    ? "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#c9a54e]/60 px-5 text-sm font-semibold text-[#f0dca8] transition hover:bg-white/5 disabled:opacity-45 sm:flex-1"
                    : `${BOTAO} w-full sm:flex-1`
                }
                style={comCreditos ? undefined : { background: cor, color: "#1b1433" }}
                data-testid="area-mao-pix-botao"
              >
                <QrCode className="size-4" aria-hidden />
                {tm.pagarComPix}
              </button>
              <button
                type="button"
                disabled={enviando}
                onClick={() => void liberar(mao, "cartao")}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#c9a54e]/60 px-5 text-sm font-semibold text-[#f0dca8] transition hover:bg-white/5 disabled:opacity-45 sm:flex-1"
              >
                <CreditCard className="size-4" aria-hidden />
                {tm.pagarComCartao}
              </button>
            </div>
          </div>
        )}
        {restam > 0 && etapa.tipo !== "pix" ? botaoFoto(tm.novaFoto, true) : null}
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-3xl bg-gradient-to-b from-[#1b1433] to-[#140f27] p-5 text-[#f6f0e4] shadow-xl" data-testid="area-mao">
      <style>{ANIMACOES}</style>
      <p className={SOBRETITULO_NOTURNO}>✦ {tm.titulo}</p>
      {escolherFoto}
      {conteudo}
      {erro ? (
        <p role="alert" className="rounded-xl bg-[#3a1f2e] p-3 text-center text-sm text-[#ffd5dc]" data-testid="area-mao-erro">
          {erro}
        </p>
      ) : null}
    </section>
  );
}
