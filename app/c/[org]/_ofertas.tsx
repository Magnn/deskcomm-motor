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
import { Check, Copy, Gift, Send, Sun } from "lucide-react";

import { copyToClipboard } from "@/lib/clipboard";

import { TituloDaSecao, type TextosDaArea } from "./_client";
import { PagarNaArea, postarJson } from "./_circulo";
import { BOTAO, CAMPO, CARTAO, CARTAO_NOTURNO, SERIF, SOBRETITULO_NOTURNO, TEXTO_SUAVE } from "./_tema";

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
    <section className={CARTAO} data-testid="area-presente">
      <TituloDaSecao titulo={to.presenteTitulo} icone={<Gift className="size-5" />} />
      <p className={`mt-2 ${TEXTO_SUAVE}`}>{to.presenteConvite}</p>
      <p className={`${SERIF} mt-4 text-3xl text-[#f6f0e4]`}>{preco}</p>
      <label className="mt-4 block">
        <span className="text-sm font-semibold">{to.presenteParaQuem}</span>
        <input
          value={para}
          onChange={(e) => setPara(e.target.value)}
          maxLength={60}
          className={`mt-2 ${CAMPO}`}
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
        <div className="mt-6 border-t border-white/10 pt-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#e2c47a]">{to.seusPresentes}</h3>
          <ul className="mt-3 space-y-3">
            {presentes.map((p) => (
              <li key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold">
                    <Gift className="size-4 text-[#e2c47a]" aria-hidden />
                    {p.para ?? to.presenteTitulo}
                  </span>
                  <span className={p.usado ? "text-xs font-semibold text-[#8fd6a8]" : "text-xs text-[#9d94b2]"}>
                    {p.usado ? to.presenteUsado : to.presenteNaoUsado}
                  </span>
                </div>
                {!p.usado ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={async () => {
                        if (await copyToClipboard(p.link)) setCopiado(p.id);
                      }}
                      className="inline-flex h-10 w-full sm:flex-1 items-center justify-center gap-2 rounded-full border-2 bg-[#1d1638] px-4 text-xs font-semibold"
                      style={{ borderColor: cor, color: cor }}
                    >
                      {copiado === p.id ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                      {copiado === p.id ? to.linkCopiado : to.copiarLink}
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`${to.mensagemDoPresente} ${p.link}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 w-full sm:flex-1 items-center justify-center gap-2 rounded-full bg-[#1f9d55] px-4 text-xs font-semibold text-white"
                    >
                      <Send className="size-4" aria-hidden />
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
    <section className={CARTAO_NOTURNO} data-testid="area-ano-pessoal">
      <span
        className={`${SERIF} pointer-events-none absolute -right-2 -top-6 text-[120px] leading-none text-[#c9a54e]/15`}
        aria-hidden
      >
        {numero}
      </span>
      <p className={SOBRETITULO_NOTURNO}>
        {ano} · {numero}
      </p>
      <h3 className={`${SERIF} mt-1 flex items-center gap-2 text-[26px] leading-tight`}>
        <Sun className="size-5 text-[#e2c47a]" aria-hidden />
        {to.anoPessoalTitulo}
      </h3>
      {pago ? (
        leitura ? (
          <p className="relative mt-4 whitespace-pre-line text-[15px] leading-relaxed text-[#e6deef]" data-testid="area-ano-pessoal-texto">
            {leitura}
          </p>
        ) : (
          <p className="mt-3 text-[15px] text-[#b7aecb]">{to.anoPessoalPreparando}</p>
        )
      ) : (
        <>
          <p className="relative mt-3 text-[15px] leading-relaxed text-[#d9d0e6]">{to.anoPessoalConvite}</p>
          <p className={`${SERIF} mt-4 text-3xl text-[#f0dca8]`}>{preco}</p>
          <PagarNaArea endpoint={`/api/v1/area/publica/${slug}/ano-pessoal`} cor={cor} tx={tx} escuro />
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
      <div className="space-y-4">
        <p className={`${SERIF} text-xl italic leading-snug text-[#efe7f7]`}>{estado.pergunta}</p>
        {estado.resposta ? (
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-[#efe7f7]" data-testid="presente-resposta">
            {estado.resposta}
          </p>
        ) : (
          <>
            <p className={TEXTO_SUAVE}>{consultando ? tx.consultando : tx.respostaChegando}</p>
            {!consultando ? (
              <button type="button" onClick={() => void perguntar({})} className="text-sm font-semibold underline underline-offset-4" style={{ color: cor }}>
                {tx.tentarDeNovo}
              </button>
            ) : null}
          </>
        )}
        {erro ? (
          <p role="alert" className="text-sm text-[#f3a493]">
            {erro}
          </p>
        ) : null}
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
        aria-label={tx.perguntar}
      />
      <button
        type="submit"
        disabled={consultando || texto.trim().length < 3}
        className={`${BOTAO} w-full`}
        style={{ background: cor, color: "#1b1433" }}
      >
        {consultando ? tx.consultando : tx.perguntar}
      </button>
      {erro ? (
        <p role="alert" className="text-sm text-[#f3a493]">
          {erro}
        </p>
      ) : null}
    </form>
  );
}
