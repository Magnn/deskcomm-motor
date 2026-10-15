"use client";
/**
 * O CÍRCULO na área do cliente: a oferta para quem ainda não está, e para quem
 * está o conteúdo do mês, a pergunta do mês e o aviso de renovar.
 *
 * Pix mostra o código aqui; cartão vai para a página da Stripe. Quem libera o
 * acesso é o aviso de pagamento da Stripe, não este componente.
 */
import * as React from "react";

import { copyToClipboard } from "@/lib/clipboard";

import { CAMPO, type TextosDaArea } from "./_client";

async function postarJson<T>(
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

function PagarCirculo({ slug, cor, tx, rotulo }: { slug: string; cor: string; tx: TextosDaArea; rotulo?: string }) {
  const [pix, setPix] = React.useState<{ copiaECola: string; qrPng: string | null } | null>(null);
  const [enviando, setEnviando] = React.useState<"pix" | "cartao" | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [copiado, setCopiado] = React.useState(false);

  const pagar = async (forma: "pix" | "cartao") => {
    setEnviando(forma);
    setErro(null);
    const r = await postarJson<{ copiaECola?: string; qrPng?: string | null; url?: string }>(
      `/api/v1/area/publica/${slug}/circulo`,
      { forma },
      tx,
    );
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
      <div className="mt-3 space-y-3" data-testid="area-circulo-pix">
        {pix.qrPng ? (
          // eslint-disable-next-line @next/next/no-img-element -- QR hospedado pela Stripe
          <img src={pix.qrPng} alt="QR Pix" className="mx-auto h-44 w-44" />
        ) : null}
        <p className="break-all rounded-lg bg-[#f3f4f6] p-3 font-mono text-xs">{pix.copiaECola}</p>
        <button
          type="button"
          onClick={async () => setCopiado(await copyToClipboard(pix.copiaECola))}
          className="w-full rounded-xl py-3 font-semibold text-white"
          style={{ background: cor }}
        >
          {copiado ? tx.codigoCopiado : tx.copiarCodigo}
        </button>
        <p className="text-xs text-[#6b7280]">{tx.depoisDePagar}</p>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      {rotulo ? <p className="text-sm font-medium">{rotulo}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={enviando !== null}
          onClick={() => void pagar("pix")}
          className="flex-1 rounded-xl py-3 font-semibold text-white disabled:opacity-60"
          style={{ background: cor }}
          data-testid="area-circulo-pagar-pix"
        >
          {enviando === "pix" ? tx.enviando : tx.pagarComPix}
        </button>
        <button
          type="button"
          disabled={enviando !== null}
          onClick={() => void pagar("cartao")}
          className="flex-1 rounded-xl border-2 py-3 font-semibold disabled:opacity-60"
          style={{ borderColor: cor, color: cor }}
        >
          {enviando === "cartao" ? tx.enviando : tx.pagarComCartao}
        </button>
      </div>
      {erro ? <p className="text-sm text-[#b91c1c]">{erro}</p> : null}
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
      <section className="rounded-2xl border-2 bg-white p-5 shadow-sm" style={{ borderColor: cor }} data-testid="area-circulo-oferta">
        <h2 className="text-base font-semibold">✦ {nome}</h2>
        <p className="mt-1 text-sm text-[#4b5563]">{tx.circuloConvite}</p>
        <p className="mt-3 text-lg font-semibold">
          {preco} <span className="text-sm font-normal text-[#6b7280]">{tx.por30Dias}</span>
        </p>
        <PagarCirculo slug={slug} cor={cor} tx={tx} />
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="area-circulo">
      <h2 className="text-base font-semibold">✦ {nome}</h2>
      <p className="mt-1 text-xs text-[#6b7280]">
        {tx.voceEstaNoCirculo} {ate}
      </p>
      {renovarJa ? <PagarCirculo slug={slug} cor={cor} tx={tx} rotulo={tx.renovar} /> : null}

      <div className="mt-4 border-t border-[#eef0f3] pt-4">
        {doMes ? (
          <article>
            <h3 className="font-semibold">{doMes.titulo}</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#374151]">{doMes.texto}</p>
          </article>
        ) : (
          <p className="text-sm text-[#6b7280]">{tx.conteudoPreparando}</p>
        )}
      </div>

      <div className="mt-4 border-t border-[#eef0f3] pt-4">
        <h3 className="font-semibold">{tx.perguntaDoMes}</h3>
        {aPergunta ? (
          <div className="mt-2 space-y-2 text-sm">
            <p className="italic text-[#4b5563]">{aPergunta.pergunta}</p>
            {aPergunta.resposta ? (
              <p className="whitespace-pre-line leading-relaxed text-[#374151]" data-testid="area-circulo-resposta">
                {aPergunta.resposta}
              </p>
            ) : (
              <>
                <p className="text-[#6b7280]">{consultando ? tx.consultando : tx.respostaChegando}</p>
                {!consultando ? (
                  <button type="button" onClick={() => void perguntar({})} className="text-sm underline" style={{ color: cor }}>
                    {tx.tentarDeNovo}
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <form
            className="mt-2 space-y-2"
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
              className={CAMPO}
              placeholder={tx.perguntaExemplo}
            />
            <button
              type="submit"
              disabled={consultando || texto.trim().length < 3}
              className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: cor }}
            >
              {consultando ? tx.consultando : tx.perguntar}
            </button>
          </form>
        )}
        {erro ? <p className="mt-2 text-sm text-[#b91c1c]">{erro}</p> : null}
      </div>
    </section>
  );
}
