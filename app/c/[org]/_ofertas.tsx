"use client";
/**
 * O PRESENTE e o ANO PESSOAL na área do cliente.
 *
 * Presente: a pessoa compra uma pergunta de tarô para dar a alguém; depois de
 * pago, o link aparece aqui para ela mandar pelo WhatsApp dela. Ano Pessoal: na
 * janela do aniversário, a leitura do ano; paga, a página pede o texto à IA e
 * mostra quando chega.
 */
import * as React from "react";

import { copyToClipboard } from "@/lib/clipboard";

import { CAMPO, type TextosDaArea } from "./_client";
import { PagarNaArea, postarJson } from "./_circulo";

export interface TextosDasOfertas {
  presenteTitulo: string;
  presenteConvite: string;
  presenteParaQuem: string;
  presenteParaQuemExemplo: string;
  seusPresentes: string;
  presenteNaoUsado: string;
  presenteUsado: string;
  copiarLink: string;
  linkCopiado: string;
  mandarPeloWhatsapp: string;
  mensagemDoPresente: string;
  anoPessoalTitulo: string;
  anoPessoalConvite: string;
  anoPessoalPreparando: string;
}

export function PresenteDoCliente({
  slug,
  cor,
  tx,
  to,
  preco,
  presentes,
}: {
  slug: string;
  cor: string;
  tx: TextosDaArea;
  to: TextosDasOfertas;
  preco: string;
  presentes: Array<{ id: string; para: string | null; link: string; usado: boolean }>;
}) {
  const [para, setPara] = React.useState("");
  const [copiado, setCopiado] = React.useState<string | null>(null);
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="area-presente">
      <h2 className="text-base font-semibold">🎁 {to.presenteTitulo}</h2>
      <p className="mt-1 text-sm text-[#4b5563]">{to.presenteConvite}</p>
      <p className="mt-2 text-lg font-semibold">{preco}</p>
      <label className="mt-3 block">
        <span className="text-sm font-medium">{to.presenteParaQuem}</span>
        <input
          value={para}
          onChange={(e) => setPara(e.target.value)}
          maxLength={60}
          className={`mt-1 ${CAMPO}`}
          placeholder={to.presenteParaQuemExemplo}
        />
      </label>
      <PagarNaArea
        endpoint={`/api/v1/area/publica/${slug}/presente`}
        corpo={para.trim() ? { para_nome: para.trim() } : {}}
        cor={cor}
        tx={tx}
      />

      {presentes.length > 0 ? (
        <div className="mt-5 border-t border-[#eef0f3] pt-4">
          <h3 className="text-sm font-semibold">{to.seusPresentes}</h3>
          <ul className="mt-2 space-y-3">
            {presentes.map((p) => (
              <li key={p.id} className="rounded-xl border border-[#eef0f3] p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.para ?? "🎁"}</span>
                  <span className={p.usado ? "text-xs text-[#15803d]" : "text-xs text-[#6b7280]"}>
                    {p.usado ? to.presenteUsado : to.presenteNaoUsado}
                  </span>
                </div>
                {!p.usado ? (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={async () => {
                        if (await copyToClipboard(p.link)) setCopiado(p.id);
                      }}
                      className="flex-1 rounded-lg border px-3 py-2 text-xs font-semibold"
                      style={{ borderColor: cor, color: cor }}
                    >
                      {copiado === p.id ? to.linkCopiado : to.copiarLink}
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`${to.mensagemDoPresente} ${p.link}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-lg bg-[#25d366] px-3 py-2 text-center text-xs font-semibold text-white"
                    >
                      {to.mandarPeloWhatsapp}
                    </a>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function AnoPessoalDoCliente({
  slug,
  cor,
  tx,
  to,
  ano,
  numero,
  preco,
  pago,
  texto,
}: {
  slug: string;
  cor: string;
  tx: TextosDaArea;
  to: TextosDasOfertas;
  ano: number;
  numero: number;
  preco: string;
  pago: boolean;
  texto: string | null;
}) {
  const [leitura, setLeitura] = React.useState(texto);
  React.useEffect(() => {
    if (!pago || leitura) return;
    let vivo = true;
    void postarJson<{ texto: string }>(`/api/v1/area/publica/${slug}/ano-pessoal/gerar`, { ano }, tx).then((r) => {
      if (vivo && r.ok) setLeitura(r.data.texto);
    });
    return () => {
      vivo = false;
    };
  }, [pago, leitura, slug, ano, tx]);

  return (
    <section className="rounded-2xl border-2 bg-white p-5 shadow-sm" style={{ borderColor: cor }} data-testid="area-ano-pessoal">
      <h2 className="text-base font-semibold">
        ✦ {to.anoPessoalTitulo} {ano} · {numero}
      </h2>
      {pago ? (
        leitura ? (
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[#374151]" data-testid="area-ano-pessoal-texto">
            {leitura}
          </p>
        ) : (
          <p className="mt-2 text-sm text-[#6b7280]">{to.anoPessoalPreparando}</p>
        )
      ) : (
        <>
          <p className="mt-1 text-sm text-[#4b5563]">{to.anoPessoalConvite}</p>
          <p className="mt-2 text-lg font-semibold">{preco}</p>
          <PagarNaArea endpoint={`/api/v1/area/publica/${slug}/ano-pessoal`} cor={cor} tx={tx} />
        </>
      )}
    </section>
  );
}

/** A página de quem GANHOU o presente: uma pergunta, uma carta, uma resposta. */
export function PerguntaDoPresente({
  slug,
  codigo,
  cor,
  tx,
  inicial,
}: {
  slug: string;
  codigo: string;
  cor: string;
  tx: TextosDaArea;
  inicial: { pergunta: string | null; resposta: string | null };
}) {
  const [estado, setEstado] = React.useState(inicial);
  const [texto, setTexto] = React.useState("");
  const [consultando, setConsultando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const perguntar = async (corpo: { pergunta?: string }) => {
    setConsultando(true);
    setErro(null);
    const r = await postarJson<{ pergunta: string; resposta: string | null }>(
      `/api/v1/area/publica/${slug}/presente/${codigo}`,
      corpo,
      tx,
    );
    setConsultando(false);
    if (r.ok) setEstado(r.data);
    else setErro(r.mensagem);
  };

  if (estado.pergunta) {
    return (
      <div className="space-y-3 text-sm">
        <p className="italic text-[#4b5563]">{estado.pergunta}</p>
        {estado.resposta ? (
          <p className="whitespace-pre-line leading-relaxed text-[#374151]" data-testid="presente-resposta">
            {estado.resposta}
          </p>
        ) : (
          <>
            <p className="text-[#6b7280]">{consultando ? tx.consultando : tx.respostaChegando}</p>
            {!consultando ? (
              <button type="button" onClick={() => void perguntar({})} className="underline" style={{ color: cor }}>
                {tx.tentarDeNovo}
              </button>
            ) : null}
          </>
        )}
        {erro ? <p className="text-[#b91c1c]">{erro}</p> : null}
      </div>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void perguntar({ pergunta: texto.trim() });
      }}
    >
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={600}
        rows={4}
        required
        className={CAMPO}
        placeholder={tx.perguntaExemplo}
      />
      <button
        type="submit"
        disabled={consultando || texto.trim().length < 3}
        className="w-full rounded-xl py-3 font-semibold text-white disabled:opacity-60"
        style={{ background: cor }}
      >
        {consultando ? tx.consultando : tx.perguntar}
      </button>
      {erro ? <p className="text-sm text-[#b91c1c]">{erro}</p> : null}
    </form>
  );
}
