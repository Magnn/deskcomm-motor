"use client";
/**
 * OS CRÉDITOS na área do cliente: o saldo, os pacotes e o extrato.
 *
 * A pessoa escolhe um pacote, paga ali mesmo (Pix na tela ou cartão na Stripe) e o saldo sobe sozinho quando
 * o aviso de pagamento chega — a tela pergunta o saldo a cada 3 s enquanto o Pix está aberto. Quem credita é o
 * servidor (`liberarCompraDaArea`), nunca esta tela.
 *
 * O valor em reais aparece sempre ao lado dos créditos: crédito não pode esconder quanto se gasta.
 *
 * O saldo é um só para a área inteira: quem gasta (a Mesa) e quem compra (aqui) avisam a mudança pelo evento
 * `area-saldo` da janela, e os dois lados se atualizam.
 */
import * as React from "react";

import { Check, Copy, CreditCard, QrCode, Sparkles } from "lucide-react";

import { copyToClipboard } from "@/lib/clipboard";

import { postarJson } from "./_circulo";
import { type TextosDaArea } from "./_client";
import { BOTAO, CARTAO_NOTURNO, SERIF, SOBRETITULO_NOTURNO } from "./_tema";

export interface TextosDaCarteira {
  titulo: string;
  seusCreditos: string;
  creditos: string;
  umCreditoUmReal: string;
  escolhaPacote: string;
  bonus: string;
  maisEscolhido: string;
  pagarComPix: string;
  pagarComCartao: string;
  esperandoPagamento: string;
  copiarCodigo: string;
  codigoCopiado: string;
  chegaram: string;
  extrato: string;
  semMovimento: string;
  voltar: string;
  motivos: Record<"pacote" | "circulo" | "leitura" | "devolucao" | "ajuste", string>;
}

export interface CarteiraInicial {
  saldo: number;
  pacotes: Array<{ indice: number; creditos: number; preco: string; bonus: number; destaque: boolean }>;
  extrato: Array<{ delta: number; motivo: keyof TextosDaCarteira["motivos"]; quando: string }>;
}

const EVENTO = "area-saldo";

/** Avisa a área inteira que o saldo mudou. */
export function anunciarSaldo(saldo: number): void {
  window.dispatchEvent(new CustomEvent<number>(EVENTO, { detail: saldo }));
}

/** O saldo vivo: começa no do servidor e acompanha o que a área anunciar. */
export function useSaldo(inicial: number): number {
  const [saldo, setSaldo] = React.useState(inicial);
  React.useEffect(() => {
    const ouvir = (e: Event) => setSaldo((e as CustomEvent<number>).detail);
    window.addEventListener(EVENTO, ouvir);
    return () => window.removeEventListener(EVENTO, ouvir);
  }, []);
  return saldo;
}

const ANIMACOES = `
@keyframes carteira-sobe { 0% { opacity: 0; transform: translateY(10px) scale(.9) } 60% { opacity: 1; transform: translateY(-4px) scale(1.06) } 100% { opacity: 1; transform: none } }
.carteira-sobe { animation: carteira-sobe .6s ease-out both }
@media (prefers-reduced-motion: reduce) { .carteira-sobe { animation: none } }
`;

export function CarteiraDeCreditos({
  slug,
  cor,
  tx,
  tc,
  inicial,
  tag,
}: {
  slug: string;
  cor: string;
  tx: TextosDaArea;
  tc: TextosDaCarteira;
  inicial: CarteiraInicial;
  tag: string;
}) {
  const saldo = useSaldo(inicial.saldo);
  const [escolhido, setEscolhido] = React.useState<number | null>(null);
  const [pix, setPix] = React.useState<{ copiaECola: string; qrPng: string | null; antes: number } | null>(null);
  const [enviando, setEnviando] = React.useState<"pix" | "cartao" | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [copiado, setCopiado] = React.useState(false);
  const [chegou, setChegou] = React.useState<number | null>(null);
  const [extrato, setExtrato] = React.useState(inicial.extrato);
  const [verExtrato, setVerExtrato] = React.useState(false);
  const base = `/api/v1/area/publica/${slug}/creditos`;

  // Pix aberto: pergunta o saldo a cada 3 s; subiu, comemora.
  React.useEffect(() => {
    if (!pix) return;
    const t = window.setInterval(async () => {
      const res = await fetch(base, { credentials: "same-origin" }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { data?: { saldo: number; extrato: CarteiraInicial["extrato"] } } | null;
      if (j?.data && j.data.saldo > pix.antes) {
        window.clearInterval(t);
        setChegou(j.data.saldo - pix.antes);
        setExtrato(j.data.extrato);
        setPix(null);
        setEscolhido(null);
        anunciarSaldo(j.data.saldo);
      }
    }, 3000);
    return () => window.clearInterval(t);
  }, [pix, base]);

  const pagar = async (forma: "pix" | "cartao") => {
    if (escolhido === null) return;
    setEnviando(forma);
    setErro(null);
    const r = await postarJson<{ cobranca: { copiaECola?: string; qrPng?: string | null; url?: string } }>(base, { pacote: escolhido, forma }, tx);
    setEnviando(null);
    if (!r.ok) {
      setErro(r.mensagem);
      return;
    }
    if (r.data.cobranca.url) {
      window.location.href = r.data.cobranca.url;
      return;
    }
    setPix({ copiaECola: r.data.cobranca.copiaECola ?? "", qrPng: r.data.cobranca.qrPng ?? null, antes: saldo });
  };

  const data = (iso: string) => new Date(iso).toLocaleDateString(tag, { day: "2-digit", month: "2-digit" });

  return (
    <section id="carteira" className={`${CARTAO_NOTURNO} relative overflow-hidden p-5`} data-testid="area-carteira">
      <style>{ANIMACOES}</style>
      <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-[#c9a54e]/15 blur-2xl" aria-hidden />
      <p className={SOBRETITULO_NOTURNO}>✦ {tc.titulo}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-[#b7aecb]">{tc.seusCreditos}</p>
          <p className={`${SERIF} text-[44px] leading-none text-[#f0dca8]`} data-testid="area-saldo">
            {saldo}
            <span className="ml-2 text-base text-[#b7aecb]">{tc.creditos}</span>
          </p>
        </div>
        {chegou ? (
          <p className="carteira-sobe rounded-full bg-[#c9a54e] px-3 py-1 text-sm font-bold text-[#1b1433]" role="status">
            +{chegou} {tc.chegaram}
          </p>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-[#b7aecb]">{tc.umCreditoUmReal}</p>

      {pix ? (
        <div className="mt-4 space-y-3 rounded-2xl bg-white p-4 text-[#241f31]" data-testid="carteira-pix">
          {pix.qrPng ? (
            // eslint-disable-next-line @next/next/no-img-element -- QR hospedado pela Stripe
            <img src={pix.qrPng} alt="QR Pix" className="mx-auto size-44" />
          ) : null}
          <p className="break-all rounded-xl bg-[#f6f1e6] p-3 font-mono text-xs leading-relaxed">{pix.copiaECola}</p>
          <button type="button" onClick={async () => setCopiado(await copyToClipboard(pix.copiaECola))} className={`${BOTAO} w-full`} style={{ background: cor }}>
            {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copiado ? tc.codigoCopiado : tc.copiarCodigo}
          </button>
          <p className="text-center text-sm text-[#6f6880]">{tc.esperandoPagamento}</p>
          <button type="button" onClick={() => setPix(null)} className="block w-full text-center text-sm text-[#6f6880] underline underline-offset-4">
            {tc.voltar}
          </button>
        </div>
      ) : (
        <>
          <p className="mt-5 text-sm font-semibold text-[#f0dca8]">{tc.escolhaPacote}</p>
          <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup">
            {inicial.pacotes.map((p) => {
              const ativo = escolhido === p.indice;
              return (
                <button
                  key={p.indice}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  onClick={() => setEscolhido(p.indice)}
                  className={`relative flex flex-col items-center rounded-2xl border px-2 pb-3 pt-4 text-center transition active:scale-[0.97] motion-reduce:transition-none ${
                    ativo ? "border-[#e2c47a] bg-white/10 ring-2 ring-[#e2c47a]" : "border-[#c9a54e]/35 bg-white/[0.04] hover:bg-white/[0.08]"
                  }`}
                  data-testid={`carteira-pacote-${p.indice}`}
                >
                  {p.destaque ? (
                    <span className="absolute -top-2.5 rounded-full bg-[#c9a54e] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1b1433]">
                      {tc.maisEscolhido}
                    </span>
                  ) : null}
                  <Sparkles className="size-4 text-[#e2c47a]" aria-hidden />
                  <span className={`${SERIF} mt-1 text-[28px] leading-none text-[#fdf6e3]`}>{p.creditos}</span>
                  <span className="text-[11px] text-[#b7aecb]">{tc.creditos}</span>
                  <span className="mt-2 text-sm font-semibold text-[#f0dca8]">{p.preco}</span>
                  {p.bonus > 0 ? <span className="mt-1 text-[11px] font-semibold text-[#9fd8b0]">+{p.bonus} {tc.bonus}</span> : null}
                </button>
              );
            })}
          </div>
          {escolhido !== null ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={enviando !== null}
                onClick={() => void pagar("pix")}
                className={`${BOTAO} w-full sm:flex-1`}
                style={{ background: "#c9a54e", color: "#1b1433" }}
                data-testid="carteira-pagar-pix"
              >
                <QrCode className="size-4" aria-hidden />
                {enviando === "pix" ? tx.enviando : tc.pagarComPix}
              </button>
              <button
                type="button"
                disabled={enviando !== null}
                onClick={() => void pagar("cartao")}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[#c9a54e]/60 px-6 text-[15px] font-semibold text-[#f0dca8] transition hover:bg-white/5 disabled:opacity-45 sm:flex-1"
              >
                <CreditCard className="size-4" aria-hidden />
                {enviando === "cartao" ? tx.enviando : tc.pagarComCartao}
              </button>
            </div>
          ) : null}
          {erro ? (
            <p role="alert" className="mt-2 text-sm text-[#f3b2a4]">
              {erro}
            </p>
          ) : null}
        </>
      )}

      <button type="button" onClick={() => setVerExtrato((v) => !v)} className="mt-4 text-sm text-[#b7aecb] underline underline-offset-4">
        {tc.extrato}
      </button>
      {verExtrato ? (
        <ul className="mt-2 divide-y divide-white/10 text-sm">
          {extrato.length === 0 ? <li className="py-2 text-[#b7aecb]">{tc.semMovimento}</li> : null}
          {extrato.map((m, i) => (
            <li key={`${m.quando}-${i}`} className="flex items-center justify-between py-2">
              <span className="text-[#d9d0e6]">
                <span className="mr-2 text-xs text-[#8f86a3]">{data(m.quando)}</span>
                {tc.motivos[m.motivo] ?? m.motivo}
              </span>
              <span className={m.delta > 0 ? "font-semibold text-[#9fd8b0]" : "font-semibold text-[#f0dca8]"}>
                {m.delta > 0 ? `+${m.delta}` : m.delta}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
