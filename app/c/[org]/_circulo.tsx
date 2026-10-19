"use client";
/**
 * O CÍRCULO na área do cliente: a oferta para quem ainda não está, e para quem
 * está o conteúdo do mês, a pergunta do mês e o aviso de renovar.
 *
 * Pix mostra o código aqui; cartão vai para a página da Stripe. Quem libera o
 * acesso é o aviso de pagamento da Stripe, não este componente.
 */
import * as React from "react";

import { Check, Copy, CreditCard, QrCode, Sparkles } from "lucide-react";

import { copyToClipboard } from "@/lib/clipboard";

import { type TextosDaArea } from "./_client";
import { BOTAO, BOTAO_CONTORNO, CAMPO, CARTAO_NOTURNO, SERIF, SOBRETITULO_NOTURNO } from "./_tema";

export async function postarJson<T>(
  url: string,
  corpo: unknown,
  tx: TextosDaArea,
): Promise<{ ok: true; data: T } | { ok: false; mensagem: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
    if (res.ok && json?.data !== undefined) return { ok: true, data: json.data };
    return { ok: false, mensagem: json?.error?.message ?? tx.naoFoiPossivel };
  } catch {
    return { ok: false, mensagem: tx.semConexao };
  }
}

/** Pagar uma oferta da área (Círculo, presente, Ano Pessoal): Pix aqui mesmo, cartão na Stripe. */
export function PagarNaArea({
  endpoint,
  corpo = {},
  cor,
  tx,
  rotulo,
  escuro = false,
}: {
  endpoint: string;
  corpo?: Record<string, unknown>;
  cor: string;
  tx: TextosDaArea;
  rotulo?: string;
  /** Dentro de um cartão noturno: o Pix vira dourado e o cartão, contorno dourado. */
  escuro?: boolean;
}) {
  const [pix, setPix] = React.useState<{ copiaECola: string; qrPng: string | null } | null>(null);
  const [enviando, setEnviando] = React.useState<"pix" | "cartao" | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [copiado, setCopiado] = React.useState(false);

  const pagar = async (forma: "pix" | "cartao") => {
    setEnviando(forma);
    setErro(null);
    const r = await postarJson<{ copiaECola?: string; qrPng?: string | null; url?: string }>(endpoint, { ...corpo, forma }, tx);
    setEnviando(null);
    if (!r.ok) {
      setErro(r.mensagem);
      return;
    }
    if (forma === "cartao" && r.data.url) window.location.href = r.data.url;
    else if (r.data.copiaECola) setPix({ copiaECola: r.data.copiaECola, qrPng: r.data.qrPng ?? null });
  };

  if (pix) {
    return (
      <div className="mt-4 space-y-3 rounded-2xl bg-white p-4 text-[#241f31]" data-testid="area-circulo-pix">
        {pix.qrPng ? (
          // eslint-disable-next-line @next/next/no-img-element -- QR hospedado pela Stripe
          <img src={pix.qrPng} alt="QR Pix" className="mx-auto size-44" />
        ) : null}
        <p className="break-all rounded-xl bg-[#f6f1e6] p-3 font-mono text-xs leading-relaxed">{pix.copiaECola}</p>
        <button
          type="button"
          onClick={async () => setCopiado(await copyToClipboard(pix.copiaECola))}
          className={`${BOTAO} w-full`}
          style={{ background: cor }}
        >
          {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copiado ? tx.codigoCopiado : tx.copiarCodigo}
        </button>
        <p className="text-xs leading-relaxed text-[#6f6880]">{tx.depoisDePagar}</p>
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-2">
      {rotulo ? <p className="text-sm font-semibold">{rotulo}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={enviando !== null}
          onClick={() => void pagar("pix")}
          className={`${BOTAO} w-full sm:flex-1`}
          style={escuro ? { background: "#c9a54e", color: "#1b1433" } : { background: cor }}
          data-testid="area-circulo-pagar-pix"
        >
          <QrCode className="size-4" aria-hidden />
          {enviando === "pix" ? tx.enviando : tx.pagarComPix}
        </button>
        <button
          type="button"
          disabled={enviando !== null}
          onClick={() => void pagar("cartao")}
          className={
            escuro
              ? "inline-flex h-12 w-full sm:flex-1 items-center justify-center gap-2 rounded-full border border-[#c9a54e]/60 px-6 text-[15px] font-semibold text-[#f0dca8] transition hover:bg-white/5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none"
              : `${BOTAO_CONTORNO} w-full sm:flex-1`
          }
          style={escuro ? undefined : { borderColor: cor, color: cor }}
        >
          <CreditCard className="size-4" aria-hidden />
          {enviando === "cartao" ? tx.enviando : tx.pagarComCartao}
        </button>
      </div>
      {erro ? (
        <p role="alert" className={escuro ? "text-sm text-[#f3b2a4]" : "text-sm text-[#a5361f]"}>
          {erro}
        </p>
      ) : null}
    </div>
  );
}

export function CirculoDoCliente({
  slug,
  cor,
  tx,
  nome,
  preco,
  ativo,
  ate,
  renovarJa,
  conteudo,
  pergunta,
  creditosPorMes = null,
}: {
  slug: string;
  cor: string;
  tx: TextosDaArea;
  nome: string;
  preco: string;
  ativo: boolean;
  ate: string | null;
  renovarJa: boolean;
  conteudo: { titulo: string; texto: string } | null;
  pergunta: { pergunta: string; resposta: string | null } | null;
  /** Com os créditos ligados: a frase dos créditos que cada mês do Círculo dá. */
  creditosPorMes?: string | null;
}) {
  const [doMes, setDoMes] = React.useState(conteudo);
  const [aPergunta, setAPergunta] = React.useState(pergunta);
  const [texto, setTexto] = React.useState("");
  const [consultando, setConsultando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  // O conteúdo do mês nasce na primeira visita de um assinante: a página pede e mostra quando chega.
  React.useEffect(() => {
    if (!ativo || doMes) return;
    let vivo = true;
    void postarJson<{ titulo: string; texto: string }>(`/api/v1/area/publica/${slug}/circulo/conteudo`, {}, tx).then((r) => {
      if (vivo && r.ok) setDoMes(r.data);
    });
    return () => {
      vivo = false;
    };
  }, [ativo, doMes, slug, tx]);

  const perguntar = async (corpo: { pergunta?: string }) => {
    setConsultando(true);
    setErro(null);
    const r = await postarJson<{ pergunta: string; resposta: string | null }>(
      `/api/v1/area/publica/${slug}/circulo/pergunta`,
      corpo,
      tx,
    );
    setConsultando(false);
    if (r.ok) setAPergunta(r.data);
    else setErro(r.mensagem);
  };

  if (!ativo) {
    return (
      <section className={CARTAO_NOTURNO} data-testid="area-circulo-oferta">
        <span className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-[radial-gradient(circle,rgba(201,165,78,0.35),transparent_70%)]" />
        <h3 className={`${SERIF} flex items-center gap-2 text-[26px] leading-tight`}>
          <Sparkles className="size-5 text-[#e2c47a]" aria-hidden />
          {nome}
        </h3>
        <p className="mt-3 text-[15px] leading-relaxed text-[#d9d0e6]">{tx.circuloConvite}</p>
        <p className="mt-4 flex items-baseline gap-2">
          <span className={`${SERIF} text-3xl text-[#f0dca8]`}>{preco}</span>
          <span className="text-sm text-[#b7aecb]">{tx.por30Dias}</span>
        </p>
        {creditosPorMes ? (
          <p className="mt-2 inline-flex rounded-full bg-[#c9a54e]/20 px-3 py-1 text-sm font-semibold text-[#f0dca8]" data-testid="circulo-creditos">
            ✦ {creditosPorMes}
          </p>
        ) : null}
        <PagarNaArea endpoint={`/api/v1/area/publica/${slug}/circulo`} cor={cor} tx={tx} escuro />
      </section>
    );
  }

  return (
    <section className={CARTAO_NOTURNO} data-testid="area-circulo">
      <span className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-[radial-gradient(circle,rgba(201,165,78,0.3),transparent_70%)]" />
      <h3 className={`${SERIF} flex items-center gap-2 text-[26px] leading-tight`}>
        <Sparkles className="size-5 text-[#e2c47a]" aria-hidden />
        {nome}
      </h3>
      <p className="mt-1 text-xs text-[#b7aecb]">
        {tx.voceEstaNoCirculo} {ate}
      </p>
      {renovarJa ? <PagarNaArea endpoint={`/api/v1/area/publica/${slug}/circulo`} cor={cor} tx={tx} rotulo={tx.renovar} escuro /> : null}

      <div className="mt-5 border-t border-white/10 pt-5">
        {doMes ? (
          <article>
            <h4 className={`${SERIF} text-xl text-[#f0dca8]`}>{doMes.titulo}</h4>
            <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-[#e6deef]">{doMes.texto}</p>
          </article>
        ) : (
          <p className="text-[15px] text-[#b7aecb]">{tx.conteudoPreparando}</p>
        )}
      </div>

      <div className="mt-5 border-t border-white/10 pt-5">
        <h4 className={SOBRETITULO_NOTURNO}>{tx.perguntaDoMes}</h4>
        {aPergunta ? (
          <div className="mt-3 space-y-3 text-[15px]">
            <p className={`${SERIF} text-lg italic text-[#f6f0e4]`}>{aPergunta.pergunta}</p>
            {aPergunta.resposta ? (
              <p className="whitespace-pre-line leading-relaxed text-[#e6deef]" data-testid="area-circulo-resposta">
                {aPergunta.resposta}
              </p>
            ) : (
              <>
                <p className="text-[#b7aecb]">{consultando ? tx.consultando : tx.respostaChegando}</p>
                {!consultando ? (
                  <button type="button" onClick={() => void perguntar({})} className="text-sm font-semibold text-[#f0dca8] underline underline-offset-4">
                    {tx.tentarDeNovo}
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void perguntar({ pergunta: texto.trim() });
            }}
          >
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={600}
              rows={3}
              required
              className={`${CAMPO} border-white/15 bg-white/5 text-[#f6f0e4] placeholder:text-[#9a90b0] focus:bg-white/10`}
              placeholder={tx.perguntaExemplo}
              aria-label={tx.perguntaDoMes}
            />
            <button
              type="submit"
              disabled={consultando || texto.trim().length < 3}
              className={BOTAO}
              style={{ background: "#c9a54e", color: "#1b1433" }}
            >
              {consultando ? tx.consultando : tx.perguntar}
            </button>
          </form>
        )}
        {erro ? (
          <p role="alert" className="mt-2 text-sm text-[#f3b2a4]">
            {erro}
          </p>
        ) : null}
      </div>
    </section>
  );
}
