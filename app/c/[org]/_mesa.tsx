"use client";
/**
 * A MESA DE LEITURAS na área do cliente: escolher a modalidade, perguntar, pagar ali mesmo, embaralhar, tocar
 * três cartas e ver a leitura chegar no chat.
 *
 * O ritual é da tela; quem decide as cartas é o servidor (`sortearCartas`) e quem libera é o aviso de
 * pagamento da Stripe. A leitura é automática e a tela diz isso no topo — a cigana de verdade é outro caminho,
 * pelo WhatsApp, oferecido ao fim da leitura.
 *
 * Com os créditos ligados (`_carteira.tsx`), a leitura sai com um toque pelo saldo; Pix e cartão continuam
 * para quem não quer pacote.
 *
 * Contenção combinada com o dono: há limite de leituras por dia, e o fim de uma leitura não oferece "mais uma"
 * — só voltar à mesa ou conversar com uma cigana.
 */
import * as React from "react";

import { Check, Copy, CreditCard, Loader2, MessageCircle, Pause, Play, QrCode, Sparkles, WalletCards } from "lucide-react";

import { copyToClipboard } from "@/lib/clipboard";

import { EVENTO_DE_VALOR } from "@/lib/area-do-cliente/avisos";

import { anunciarSaldo, useSaldo } from "./_carteira";
import { postarJson } from "./_circulo";
import { type TextosDaArea } from "./_client";
import { BOTAO, BOTAO_CONTORNO, CAMPO, CARTAO, CARTAO_NOTURNO, DETALHE, SERIF, SOBRETITULO, SOBRETITULO_NOTURNO, TEXTO_SUAVE } from "./_tema";

export interface TextosDaMesa {
  titulo: string;
  automatica: string;
  primeiraPor: string;
  leituraPor: string;
  restamHoje: string;
  limiteDoDia: string;
  suaPergunta: string;
  dicaDaPergunta: string;
  pagarComPix: string;
  pagarComCartao: string;
  esperandoPagamento: string;
  copiarCodigo: string;
  codigoCopiado: string;
  embaralhando: string;
  escolhaTres: string;
  escolhidas: string;
  revelar: string;
  digitando: string;
  sintese: string;
  passo: string;
  preparando: string;
  tentarDeNovo: string;
  voltarAMesa: string;
  ciganaDeVerdade: string;
  falarComCigana: string;
  minhasLeituras: string;
  esperandoVoce: string;
  abrirAMesa: string;
  voltar: string;
  usarCreditos: string;
  creditos: string;
  seusCreditos: string;
  comprarCreditos: string;
  ouPagueSoEsta: string;
  ouvirLeitura: string;
  pausar: string;
  preparandoVoz: string;
  vozIndisponivel: string;
  vozSendoPreparada: string;
  posicoes: readonly string[];
}

export interface CartaNaMesa {
  id: number;
  nome: string;
  posicao: string;
  simbolo?: string;
  foto: string | null;
}

export interface LeituraNaMesa {
  id: string;
  modalidade: string;
  pergunta: string;
  quando: string;
  revelada: boolean;
  cartas: CartaNaMesa[];
  leitura: { cartas: string[]; sintese: string; passo: string } | null;
}

export interface MesaInicial {
  modalidades: Array<{ id: string; nome: string; preco: string; primeira: boolean; cartasNaMesa: number; creditos: number }>;
  restamHoje: number;
  /** Com os créditos ligados: o saldo de partida. `null` = só Pix e cartão. */
  saldo: number | null;
  /** A leitura pode ser ouvida (voz do próprio servidor). */
  narrar: boolean;
  leituras: LeituraNaMesa[];
}

type Etapa =
  | { tipo: "inicio" }
  | { tipo: "pergunta"; modalidade: string }
  | { tipo: "pix"; leituraId: string; copiaECola: string; qrPng: string | null }
  | { tipo: "embaralhando"; leituraId: string; modalidade: string }
  | { tipo: "escolhendo"; leituraId: string; modalidade: string; escolhidas: number[] }
  | { tipo: "revelando"; leituraId: string; modalidade: string; escolhidas: number[] }
  | { tipo: "leitura"; leitura: LeituraNaMesa };

const ANIMACOES = `
@keyframes mesa-embaralha { 0%,100% { transform: translateX(0) rotate(0) } 25% { transform: translateX(-38px) rotate(-8deg) } 75% { transform: translateX(38px) rotate(8deg) } }
@keyframes mesa-entra { from { opacity: 0; transform: translateY(14px) scale(.96) } to { opacity: 1; transform: none } }
@keyframes mesa-pulsa { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
.mesa-embaralha { animation: mesa-embaralha .55s ease-in-out infinite }
.mesa-entra { animation: mesa-entra .45s ease-out both }
.mesa-ponto { animation: mesa-pulsa 1.1s ease-in-out infinite }
.mesa-virar { transition: transform .7s cubic-bezier(.2,.7,.2,1); transform-style: preserve-3d }
.mesa-face { backface-visibility: hidden }
@media (prefers-reduced-motion: reduce) { .mesa-embaralha, .mesa-entra, .mesa-ponto { animation: none } .mesa-virar { transition: none } }
`;

function Verso({ ativa = false, numero }: { ativa?: boolean; numero?: number }) {
  return (
    <span
      className={`relative grid h-full w-full place-items-center rounded-xl border bg-[#1b1433] shadow-md transition ${ativa ? "border-[#e2c47a] ring-2 ring-[#e2c47a]" : "border-[#c9a54e]/50"}`}
    >
      <span className="absolute inset-1.5 rounded-lg border border-[#c9a54e]/30" />
      {numero ? <span className="text-sm font-bold text-[#e2c47a]">{numero}</span> : <Sparkles className="size-4 text-[#c9a54e]" aria-hidden />}
    </span>
  );
}

function Frente({ carta }: { carta: CartaNaMesa }) {
  if (carta.foto) {
    // eslint-disable-next-line @next/next/no-img-element -- foto assinada do Storage da empresa
    return <img src={carta.foto} alt={carta.nome} className="h-full w-full rounded-xl object-cover shadow-md" />;
  }
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl border border-[#c9a54e]/60 bg-[#fdf9ef] p-1 text-center shadow-md">
      <span className="text-[11px] font-semibold text-[#a8842f]">{carta.id}</span>
      <span className="text-3xl" aria-hidden>
        {carta.simbolo ?? "✦"}
      </span>
      <span className="text-[11px] font-semibold leading-tight text-[#3a3347]">{carta.nome}</span>
    </span>
  );
}

/** A carta que vira: verso enquanto `virada` é falso, frente depois. */
function CartaQueVira({ carta, virada }: { carta: CartaNaMesa; virada: boolean }) {
  return (
    <span className="block h-36 w-24 [perspective:800px]">
      <span className="mesa-virar relative block h-full w-full" style={{ transform: virada ? "rotateY(180deg)" : "none" }}>
        <span className="mesa-face absolute inset-0">
          <Verso />
        </span>
        <span className="mesa-face absolute inset-0" style={{ transform: "rotateY(180deg)" }}>
          <Frente carta={carta} />
        </span>
      </span>
    </span>
  );
}

function Bolha({ children, atraso }: { children: React.ReactNode; atraso: number }) {
  const [visivel, setVisivel] = React.useState(atraso === 0);
  React.useEffect(() => {
    if (atraso === 0) return;
    const t = window.setTimeout(() => setVisivel(true), atraso);
    return () => window.clearTimeout(t);
  }, [atraso]);
  if (!visivel) return null;
  return <div className="mesa-entra w-fit max-w-[92%] rounded-2xl rounded-tl-sm bg-[#f3eefb] px-4 py-3 text-[15px] leading-relaxed text-[#2e2840]">{children}</div>;
}

function Digitando({ ate, texto }: { ate: number; texto: string }) {
  const [ativo, setAtivo] = React.useState(true);
  React.useEffect(() => {
    const t = window.setTimeout(() => setAtivo(false), ate);
    return () => window.clearTimeout(t);
  }, [ate]);
  if (!ativo) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-[#8b8497]" aria-live="polite">
      {texto}
      <span className="mesa-ponto">•</span>
      <span className="mesa-ponto [animation-delay:.2s]">•</span>
      <span className="mesa-ponto [animation-delay:.4s]">•</span>
    </p>
  );
}

/**
 * Ouvir a leitura: o áudio é pedido assim que a leitura aparece (gerar pode levar alguns segundos), e o
 * toque só toca — o navegador do celular só deixa tocar som dentro do toque, não depois de uma espera.
 */
function OuvirLeitura({ url, tm }: { url: string; tm: TextosDaMesa }) {
  const [link, setLink] = React.useState<string | null>(null);
  const [falhou, setFalhou] = React.useState(false);
  const [preparando, setPreparando] = React.useState(false);
  const [tocando, setTocando] = React.useState(false);
  const audio = React.useRef<HTMLAudioElement | null>(null);
  React.useEffect(() => {
    let vivo = true;
    let espera: number | undefined;
    // A voz humana fica numa fila: enquanto a resposta for "preparando", pergunta de novo a cada 20 s.
    const pedir = (tentativa: number) => {
      void fetch(url, { method: "POST", credentials: "same-origin" })
        .then((r) => r.json())
        .then((j: { data?: { url?: string; preparando?: boolean } }) => {
          if (!vivo) return;
          if (j.data?.url) {
            setPreparando(false);
            setLink(j.data.url);
          } else if (j.data?.preparando && tentativa < 90) {
            setPreparando(true);
            espera = window.setTimeout(() => pedir(tentativa + 1), 20_000);
          } else setFalhou(true);
        })
        .catch(() => vivo && setFalhou(true));
    };
    pedir(0);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
      audio.current?.pause();
    };
  }, [url]);
  if (falhou) return <p className="text-xs text-[#8b8497]">{tm.vozIndisponivel}</p>;
  if (preparando) {
    return (
      <p className="flex items-center gap-2 text-xs text-[#8b8497]" aria-live="polite" data-testid="mesa-voz-preparando">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        {tm.vozSendoPreparada}
      </p>
    );
  }
  const alternar = () => {
    if (!link) return;
    if (!audio.current) {
      audio.current = new Audio(link);
      audio.current.onended = () => setTocando(false);
    }
    if (tocando) {
      audio.current.pause();
      setTocando(false);
    } else {
      void audio.current.play().then(() => setTocando(true)).catch(() => setFalhou(true));
    }
  };
  return (
    <button
      type="button"
      onClick={alternar}
      disabled={!link}
      className="inline-flex items-center gap-2 rounded-full border border-[#c9a54e]/60 bg-[#1b1433] px-4 py-2 text-sm font-semibold text-[#f0dca8] shadow-sm transition active:scale-[0.97] disabled:opacity-70 motion-reduce:transition-none"
      data-testid="mesa-ouvir"
    >
      {!link ? <Loader2 className="size-4 animate-spin" aria-hidden /> : tocando ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
      {!link ? tm.preparandoVoz : tocando ? tm.pausar : tm.ouvirLeitura}
    </button>
  );
}

/** A leitura no chat: as cartas viram uma a uma, e as bolhas chegam em sequência. */
function LeituraNoChat({ l, tm, animar, vozUrl }: { l: LeituraNaMesa; tm: TextosDaMesa; animar: boolean; vozUrl: string | null }) {
  const [viradas, setViradas] = React.useState(animar ? 0 : 3);
  React.useEffect(() => {
    if (!animar) return;
    const ts = [0, 1, 2].map((i) => window.setTimeout(() => setViradas(i + 1), 500 + i * 900));
    return () => ts.forEach((t) => window.clearTimeout(t));
  }, [animar]);
  const passo = animar ? 2400 : 0;
  const bolhas: React.ReactNode[] = [];
  if (l.leitura) {
    l.cartas.forEach((c, i) => {
      bolhas.push(
        <Bolha key={`c${i}`} atraso={animar ? 3200 + i * passo : 0}>
          <span className="block text-xs font-semibold uppercase tracking-wide text-[#a8842f]">
            {c.posicao} · {c.nome}
          </span>
          <span className="mt-1 block whitespace-pre-line">{l.leitura?.cartas[i]}</span>
        </Bolha>,
      );
    });
    bolhas.push(
      <Bolha key="s" atraso={animar ? 3200 + 3 * passo : 0}>
        <span className="block text-xs font-semibold uppercase tracking-wide text-[#a8842f]">{tm.sintese}</span>
        <span className="mt-1 block whitespace-pre-line">{l.leitura.sintese}</span>
      </Bolha>,
    );
    bolhas.push(
      <Bolha key="p" atraso={animar ? 3200 + 4 * passo : 0}>
        <span className="block text-xs font-semibold uppercase tracking-wide text-[#a8842f]">{tm.passo}</span>
        <span className="mt-1 block whitespace-pre-line">{l.leitura.passo}</span>
      </Bolha>,
    );
  }
  return (
    <div className="space-y-4">
      <p className={`${SERIF} text-[19px] leading-snug text-[#3a3347]`}>“{l.pergunta}”</p>
      {vozUrl && l.leitura ? (
        <div className="flex justify-center">
          <OuvirLeitura url={vozUrl} tm={tm} />
        </div>
      ) : null}
      <div className="flex justify-center gap-3">
        {l.cartas.map((c, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <CartaQueVira carta={c} virada={viradas > i} />
            <span className="max-w-24 text-center text-[11px] leading-tight text-[#8b8497]">{c.posicao}</span>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {animar && l.leitura ? <Digitando ate={3200 + 4 * passo} texto={tm.digitando} /> : null}
        {bolhas}
      </div>
    </div>
  );
}

export function MesaDeLeituras({
  slug,
  cor,
  tx,
  tm,
  inicial,
  whatsapp,
  tag,
}: {
  slug: string;
  cor: string;
  tx: TextosDaArea;
  tm: TextosDaMesa;
  inicial: MesaInicial;
  whatsapp?: string;
  /** A tag de idioma das datas (`pt-BR`, `es`…). */
  tag: string;
}) {
  const [etapa, setEtapa] = React.useState<Etapa>({ tipo: "inicio" });
  const [pergunta, setPergunta] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [copiado, setCopiado] = React.useState(false);
  const [leituras, setLeituras] = React.useState(inicial.leituras);
  const [aberta, setAberta] = React.useState<string | null>(null);
  const saldo = useSaldo(inicial.saldo ?? 0);
  const comCreditos = inicial.saldo !== null;
  const base = `/api/v1/area/publica/${slug}/leituras`;
  const modalidade = (id: string) => inicial.modalidades.find((m) => m.id === id);

  // Pix: pergunta se já pagou a cada 3 s; pagou, embaralha.
  React.useEffect(() => {
    if (etapa.tipo !== "pix") return;
    const id = etapa.leituraId;
    const t = window.setInterval(async () => {
      const res = await fetch(`${base}/${id}`, { credentials: "same-origin" }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { data?: { paga: boolean } } | null;
      if (j?.data?.paga) {
        window.clearInterval(t);
        const m = leituras.find((l) => l.id === id)?.modalidade ?? (etapa as { modalidade?: string }).modalidade ?? "tarot";
        setEtapa({ tipo: "embaralhando", leituraId: id, modalidade: m });
      }
    }, 3000);
    return () => window.clearInterval(t);
  }, [etapa, base, leituras]);

  // Embaralhar dura um pouco e abre a mesa.
  React.useEffect(() => {
    if (etapa.tipo !== "embaralhando") return;
    const t = window.setTimeout(() => setEtapa({ tipo: "escolhendo", leituraId: etapa.leituraId, modalidade: etapa.modalidade, escolhidas: [] }), 2600);
    return () => window.clearTimeout(t);
  }, [etapa]);

  const pedir = async (forma: "pix" | "cartao" | "creditos", mod: string) => {
    setEnviando(true);
    setErro(null);
    const r = await postarJson<{
      leitura_id: string;
      paga?: boolean;
      saldo?: number;
      cobranca?: { forma: string; copiaECola?: string; qrPng?: string | null; url?: string };
    }>(
      base,
      { modalidade: mod, pergunta, forma },
      tx,
    );
    setEnviando(false);
    if (!r.ok) {
      setErro(r.mensagem);
      return;
    }
    if (r.data.cobranca?.url) {
      window.location.href = r.data.cobranca.url;
      return;
    }
    setLeituras((ls) => [{ id: r.data.leitura_id, modalidade: mod, pergunta, quando: new Date().toISOString(), revelada: false, cartas: [], leitura: null }, ...ls.filter((l) => l.id !== r.data.leitura_id)]);
    if (r.data.paga) {
      // Pago com créditos: direto para o embaralhar.
      if (typeof r.data.saldo === "number") anunciarSaldo(r.data.saldo);
      setEtapa({ tipo: "embaralhando", leituraId: r.data.leitura_id, modalidade: mod });
      return;
    }
    setEtapa({ tipo: "pix", leituraId: r.data.leitura_id, copiaECola: r.data.cobranca?.copiaECola ?? "", qrPng: r.data.cobranca?.qrPng ?? null });
  };

  const revelar = async (leituraId: string, mod: string, escolhidas: number[]) => {
    setEtapa({ tipo: "revelando", leituraId, modalidade: mod, escolhidas });
    setErro(null);
    const r = await postarJson<{ cartas: CartaNaMesa[]; leitura: LeituraNaMesa["leitura"] }>(`${base}/${leituraId}/revelar`, { posicoes: escolhidas }, tx);
    if (!r.ok) {
      setErro(r.mensagem);
      setEtapa({ tipo: "escolhendo", leituraId, modalidade: mod, escolhidas });
      return;
    }
    const anterior = leituras.find((l) => l.id === leituraId);
    const pronta: LeituraNaMesa = {
      id: leituraId,
      modalidade: mod,
      pergunta: anterior?.pergunta ?? pergunta,
      quando: anterior?.quando ?? new Date().toISOString(),
      revelada: true,
      cartas: r.data.cartas,
      leitura: r.data.leitura,
    };
    setLeituras((ls) => [pronta, ...ls.filter((l) => l.id !== leituraId)]);
    setEtapa({ tipo: "leitura", leitura: pronta });
    window.dispatchEvent(new Event(EVENTO_DE_VALOR));
  };

  const topo = (
    <div className="relative">
      <p className={SOBRETITULO_NOTURNO}>✦ {tm.titulo}</p>
      <p className="mt-1 text-xs text-[#b7aecb]">{tm.automatica}</p>
    </div>
  );

  let conteudo: React.ReactNode;
  if (etapa.tipo === "pergunta") {
    const m = modalidade(etapa.modalidade);
    conteudo = (
      <div className="mesa-entra space-y-4">
        <h3 className={`${SERIF} text-[26px] leading-tight`}>{m?.nome}</h3>
        <label className="block">
          <span className="text-sm font-semibold text-[#f0dca8]">{tm.suaPergunta}</span>
          <textarea
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value.slice(0, 400))}
            rows={3}
            className={`${CAMPO} mt-2 resize-none`}
            data-testid="mesa-pergunta"
          />
        </label>
        <p className="text-xs leading-relaxed text-[#b7aecb]">{tm.dicaDaPergunta}</p>
        <p className="text-sm text-[#f0dca8]">{m?.primeira ? `${tm.primeiraPor} ${m.preco}` : `${tm.leituraPor} ${m?.preco}`}</p>
        {comCreditos && m ? (
          <div className="space-y-2">
            {saldo >= m.creditos ? (
              <button
                type="button"
                disabled={enviando || pergunta.trim().length < 3}
                onClick={() => void pedir("creditos", etapa.modalidade)}
                className={`${BOTAO} w-full`}
                style={{ background: "#c9a54e", color: "#1b1433" }}
                data-testid="mesa-usar-creditos"
              >
                <WalletCards className="size-4" aria-hidden />
                {tm.usarCreditos} {m.creditos} {tm.creditos}
              </button>
            ) : (
              <a href="#carteira" className={`${BOTAO} w-full`} style={{ background: "#c9a54e", color: "#1b1433" }} data-testid="mesa-comprar-creditos">
                <WalletCards className="size-4" aria-hidden />
                {tm.comprarCreditos}
              </a>
            )}
            <p className="text-center text-xs text-[#b7aecb]">
              {tm.seusCreditos}: {saldo} · {tm.ouPagueSoEsta}
            </p>
          </div>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={enviando || pergunta.trim().length < 3}
            onClick={() => void pedir("pix", etapa.modalidade)}
            className={
              comCreditos
                ? "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[#c9a54e]/60 px-6 text-[15px] font-semibold text-[#f0dca8] transition hover:bg-white/5 disabled:opacity-45 sm:flex-1"
                : `${BOTAO} w-full sm:flex-1`
            }
            style={comCreditos ? undefined : { background: "#c9a54e", color: "#1b1433" }}
            data-testid="mesa-pagar-pix"
          >
            <QrCode className="size-4" aria-hidden />
            {tm.pagarComPix}
          </button>
          <button
            type="button"
            disabled={enviando || pergunta.trim().length < 3}
            onClick={() => void pedir("cartao", etapa.modalidade)}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[#c9a54e]/60 px-6 text-[15px] font-semibold text-[#f0dca8] transition hover:bg-white/5 disabled:opacity-45 sm:flex-1"
          >
            <CreditCard className="size-4" aria-hidden />
            {tm.pagarComCartao}
          </button>
        </div>
        <button type="button" onClick={() => setEtapa({ tipo: "inicio" })} className="text-sm text-[#b7aecb] underline underline-offset-4">
          {tm.voltar}
        </button>
      </div>
    );
  } else if (etapa.tipo === "pix") {
    conteudo = (
      <div className="mesa-entra space-y-3 rounded-2xl bg-white p-4 text-[#241f31]" data-testid="mesa-pix">
        {etapa.qrPng ? (
          // eslint-disable-next-line @next/next/no-img-element -- QR hospedado pela Stripe
          <img src={etapa.qrPng} alt="QR Pix" className="mx-auto size-44" />
        ) : null}
        <p className="break-all rounded-xl bg-[#f6f1e6] p-3 font-mono text-xs leading-relaxed">{etapa.copiaECola}</p>
        <button type="button" onClick={async () => setCopiado(await copyToClipboard(etapa.copiaECola))} className={`${BOTAO} w-full`} style={{ background: cor }}>
          {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copiado ? tm.codigoCopiado : tm.copiarCodigo}
        </button>
        <p className="flex items-center justify-center gap-1 text-sm text-[#6f6880]">
          {tm.esperandoPagamento}
          <span className="mesa-ponto">•</span>
          <span className="mesa-ponto [animation-delay:.2s]">•</span>
          <span className="mesa-ponto [animation-delay:.4s]">•</span>
        </p>
      </div>
    );
  } else if (etapa.tipo === "embaralhando") {
    conteudo = (
      <div className="flex flex-col items-center gap-5 py-6" aria-live="polite">
        <div className="relative h-36 w-24">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="mesa-embaralha absolute inset-0" style={{ animationDelay: `${i * 0.11}s`, transform: `rotate(${(i - 2) * 4}deg)` }}>
              <Verso />
            </span>
          ))}
        </div>
        <p className={`${SERIF} text-[20px]`}>{tm.embaralhando}</p>
      </div>
    );
  } else if (etapa.tipo === "escolhendo" || etapa.tipo === "revelando") {
    const total = modalidade(etapa.modalidade)?.cartasNaMesa ?? 22;
    const escolhidas = etapa.escolhidas;
    const tocar = (i: number) => {
      if (etapa.tipo !== "escolhendo") return;
      const ja = escolhidas.indexOf(i);
      const novas = ja >= 0 ? escolhidas.filter((x) => x !== i) : escolhidas.length < 3 ? [...escolhidas, i] : escolhidas;
      setEtapa({ ...etapa, escolhidas: novas });
    };
    conteudo = (
      <div className="mesa-entra space-y-4">
        <p className={`${SERIF} text-[20px] leading-snug`}>{tm.escolhaTres}</p>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9" data-testid="mesa-cartas">
          {Array.from({ length: total }, (_, i) => {
            const ordem = escolhidas.indexOf(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => tocar(i)}
                disabled={etapa.tipo === "revelando"}
                className={`aspect-[2/3] transition ${ordem >= 0 ? "-translate-y-1.5" : "hover:-translate-y-0.5"}`}
                aria-pressed={ordem >= 0}
                aria-label={`${i + 1}`}
              >
                <Verso ativa={ordem >= 0} numero={ordem >= 0 ? ordem + 1 : undefined} />
              </button>
            );
          })}
        </div>
        <p className="text-sm text-[#f0dca8]">
          {escolhidas.length}/3 {tm.escolhidas}
        </p>
        <button
          type="button"
          disabled={escolhidas.length !== 3 || etapa.tipo === "revelando"}
          onClick={() => void revelar(etapa.leituraId, etapa.modalidade, escolhidas)}
          className={`${BOTAO} w-full`}
          style={{ background: "#c9a54e", color: "#1b1433" }}
          data-testid="mesa-revelar"
        >
          <Sparkles className="size-4" aria-hidden />
          {etapa.tipo === "revelando" ? tm.embaralhando : tm.revelar}
        </button>
      </div>
    );
  } else if (etapa.tipo === "leitura") {
    const l = etapa.leitura;
    conteudo = (
      <div className="space-y-5 rounded-2xl bg-white p-4 text-[#241f31]">
        <LeituraNoChat l={l} tm={tm} animar vozUrl={inicial.narrar ? `${base}/${l.id}/voz` : null} />
        {!l.leitura ? (
          <div className="space-y-2">
            <p className={TEXTO_SUAVE}>{tm.preparando}</p>
            <button type="button" onClick={() => void revelar(l.id, l.modalidade, [0, 1, 2])} className={`${BOTAO_CONTORNO}`} style={{ borderColor: cor, color: cor }}>
              {tm.tentarDeNovo}
            </button>
          </div>
        ) : null}
        <div className="space-y-3 border-t border-[#efe7d6] pt-4">
          {whatsapp ? (
            <div>
              <p className={TEXTO_SUAVE}>{tm.ciganaDeVerdade}</p>
              <a href={`https://wa.me/${whatsapp}`} className={`${BOTAO} mt-2 w-full bg-[#1f9d55]`} style={{ background: "#1f9d55" }}>
                <MessageCircle className="size-4" aria-hidden />
                {tm.falarComCigana}
              </a>
            </div>
          ) : null}
          <button type="button" onClick={() => setEtapa({ tipo: "inicio" })} className="text-sm text-[#6f6880] underline underline-offset-4">
            {tm.voltarAMesa}
          </button>
        </div>
      </div>
    );
  } else {
    // Paga e ainda não revelada (quem pagou com cartão e voltou, ou fechou a tela no meio do ritual).
    const esperando = leituras.filter((l) => !l.revelada && inicial.leituras.some((i) => i.id === l.id));
    conteudo = (
      <div className="space-y-4">
        {esperando.map((l) => (
          <div key={l.id} className="mesa-entra rounded-2xl border border-[#c9a54e]/50 bg-white/5 p-4">
            <p className="text-sm font-semibold text-[#f0dca8]">{tm.esperandoVoce}</p>
            <p className="mt-1 text-sm text-[#d9d0e6]">“{l.pergunta}”</p>
            <button
              type="button"
              onClick={() => setEtapa({ tipo: "embaralhando", leituraId: l.id, modalidade: l.modalidade })}
              className={`${BOTAO} mt-3`}
              style={{ background: "#c9a54e", color: "#1b1433" }}
            >
              {tm.abrirAMesa}
            </button>
          </div>
        ))}
        <div className="grid gap-3 sm:grid-cols-2">
          {inicial.modalidades.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={inicial.restamHoje === 0}
              onClick={() => {
                setPergunta("");
                setErro(null);
                setEtapa({ tipo: "pergunta", modalidade: m.id });
              }}
              className="group rounded-2xl border border-[#c9a54e]/40 bg-white/[0.04] p-4 text-left transition hover:border-[#e2c47a] hover:bg-white/[0.08] disabled:opacity-50"
              data-testid={`mesa-modalidade-${m.id}`}
            >
              <span className="flex items-center gap-3">
                <span className="grid h-14 w-10 place-items-center">
                  <Verso />
                </span>
                <span>
                  <span className={`${SERIF} block text-[20px] leading-tight text-[#f6f0e4]`}>{m.nome}</span>
                  <span className="mt-0.5 block text-sm text-[#e2c47a]">{m.primeira ? `${tm.primeiraPor} ${m.preco}` : `${tm.leituraPor} ${m.preco}`}</span>
                  {comCreditos ? (
                    <span className="block text-xs text-[#b7aecb]">
                      {m.creditos} {tm.creditos}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-[#b7aecb]">{inicial.restamHoje === 0 ? tm.limiteDoDia : `${tm.restamHoje} ${inicial.restamHoje}`}</p>
      </div>
    );
  }

  const reveladas = leituras.filter((l) => l.revelada);
  return (
    <>
      <style>{ANIMACOES}</style>
      <section className={CARTAO_NOTURNO} data-testid="area-mesa">
        {topo}
        <div className="relative mt-4">{conteudo}</div>
        {erro ? (
          <p role="alert" className="mt-3 text-sm text-[#f3b2a4]">
            {erro}
          </p>
        ) : null}
      </section>
      {reveladas.length > 0 && etapa.tipo === "inicio" ? (
        <section className={CARTAO} data-testid="area-minhas-leituras">
          <p className={SOBRETITULO}>{tm.minhasLeituras}</p>
          <ul className="mt-3 divide-y divide-[#efe7d6]">
            {reveladas.map((l) => (
              <li key={l.id} className="py-3">
                <button type="button" onClick={() => setAberta(aberta === l.id ? null : l.id)} className="w-full text-left">
                  <span className="block truncate font-semibold">“{l.pergunta}”</span>
                  <span className={DETALHE}>
                    {modalidade(l.modalidade)?.nome} · {new Intl.DateTimeFormat(tag, { day: "2-digit", month: "2-digit" }).format(new Date(l.quando))}
                  </span>
                </button>
                {aberta === l.id ? (
                  <div className="mt-3">
                    <LeituraNoChat l={l} tm={tm} animar={false} vozUrl={inicial.narrar ? `${base}/${l.id}/voz` : null} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
