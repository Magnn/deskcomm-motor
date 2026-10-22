"use client";

/**
 * O quiz "Vocês combinam?" no navegador: as perguntas, a prévia calculada, o pagamento (Pix na própria página ou
 * cartão pela Stripe) e a leitura, que aparece aqui quando o aviso de pagamento marca o pedido. O pedido e o seu
 * segredo ficam no navegador: quem fecha a página e volta encontra a leitura onde parou.
 *
 * O caminho até a prévia (22/10/2026) segue a forma dos quizzes que escalam: começa só com TOQUES (seis perguntas
 * em três capítulos, com a frase da Cigana entre eles), explica o mecanismo numa tela, e só então pede os nomes e
 * as duas datas — por toque, sem teclado. A tela de cálculo mostra a conta real (signo e elemento de cada um), e
 * a prévia repete o que a pessoa contou. Sem timer e sem escassez: o que segura é a prévia ser dela.
 */
import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { moedaDaOferta, precoDaOferta, valorNaMoedaDaPagina, type MoedaDaPagina } from "@/lib/area-do-cliente/moeda-do-visitante";
import { previaDaSinastria } from "@/lib/area-do-cliente/sinastria";
import { copyToClipboard } from "@/lib/clipboard";

import { enviarLead, idDaVisita, manterVivo, marcarPasso } from "../_passos";

import { PaginaFinal } from "../_pagina-final";
import { Interludio, Progresso, SeletorDeData, TelaDeCalculo, VideoDaGuia } from "../_quiz-pecas";
import { CARTAO, SERIF, SOBRETITULO } from "../_tema";
import type { TextosDoQuiz } from "./_textos";

interface Pergunta {
  id: string;
  capitulo: string;
  texto: string;
  opcoes: string[];
}

interface Previa {
  signoDela: string;
  signoDele: string;
  elementoDela: string;
  elementoDele: string;
  titulo: string;
  forte: string;
  atencao: string;
  texto: string;
}

type Cobranca = { forma: "pix"; copiaECola: string; qrPng: string | null } | { forma: "cartao"; url: string };

type Fase = "quiz" | "previa" | "pagar" | "gerando" | "pronto";

/** Uma tela do caminho até a prévia, na ordem em que aparece. */
type Tela =
  | { tipo: "pergunta"; i: number }
  | { tipo: "frase"; frase: string }
  | { tipo: "mecanismo" }
  | { tipo: "nomes" }
  | { tipo: "dataDela" }
  | { tipo: "dataDele" }
  | { tipo: "calculo" }
  | { tipo: "email" };

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const CHAVE = (slug: string) => `quiz-sinastria:${slug}`;

function pixel(evento: string, dados?: Record<string, unknown>, id?: string) {
  try {
    window.fbq?.("track", evento, dados ?? {}, id ? { eventID: id } : undefined);
  } catch {
    /* o pixel nunca derruba a página */
  }
}

export function QuizDaSinastria(props: {
  slug: string;
  cor: string;
  precoCents: number;
  /** Preço para quem abre a página fora do Brasil; a moeda vem do fuso do aparelho. */
  precosInternacionais: { currency: "EUR" | "USD"; price_cents: number }[];
  pixelId: string | null;
  perguntas: Pergunta[];
  tx: TextosDoQuiz;
  /** A guia (nome e foto) e os vídeos dela no meio do quiz e na prévia (`midia.ts`, 0946); `null` = não mostra. */
  guia: { nome: string | null; foto: string | null };
  videoMeio: string | null;
  videoPrevia: string | null;
}) {
  const { slug, cor, precoCents, precosInternacionais, pixelId, perguntas, tx, guia, videoMeio, videoPrevia } = props;
  const [fase, setFase] = useState<Fase>("quiz");
  const [tela, setTela] = useState(0);
  const [nomeDela, setNomeDela] = useState("");
  const [dataDela, setDataDela] = useState("");
  const [nomeDele, setNomeDele] = useState("");
  const [dataDele, setDataDele] = useState("");
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState<{ id: string; segredo: string } | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [cobranca, setCobranca] = useState<Cobranca | null>(null);
  const [texto, setTexto] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const gerandoRef = useRef(false);
  const compraMarcada = useRef(false);
  // Reais até o navegador dizer o fuso: o servidor renderiza em reais, e a troca acontece só no aparelho.
  const [moeda, setMoeda] = useState<MoedaDaPagina>("BRL");
  const [moedaLida, setMoedaLida] = useState(false);
  useEffect(() => {
    let fuso: string | null = null;
    try {
      fuso = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      /* sem fuso: reais */
    }
    setMoeda(moedaDaOferta({ preco_cents: precoCents, precos_internacionais: precosInternacionais }, fuso));
    setMoedaLida(true);
  }, [precoCents, precosInternacionais]);
  const preco = precoDaOferta({ preco_cents: precoCents, precos_internacionais: precosInternacionais }, moeda) ?? precoCents;
  const QUIZ = "sinastria" as const;

  // O roteiro: as perguntas, com a frase da Cigana a cada troca de capítulo, e depois os dados.
  const telas = useMemo<Tela[]>(() => {
    const frases = [tx.fraseCapitulo1, tx.fraseCapitulo2];
    const r: Tela[] = [];
    perguntas.forEach((p, i) => {
      if (i > 0 && p.capitulo !== perguntas[i - 1]!.capitulo && frases.length > 0) r.push({ tipo: "frase", frase: frases.shift()! });
      r.push({ tipo: "pergunta", i });
    });
    r.push({ tipo: "mecanismo" }, { tipo: "nomes" }, { tipo: "dataDela" }, { tipo: "dataDele" }, { tipo: "calculo" }, { tipo: "email" });
    return r;
  }, [perguntas, tx.fraseCapitulo1, tx.fraseCapitulo2]);
  const atual = telas[tela];
  const avancar = useCallback(() => setTela((t) => Math.min(t + 1, telas.length - 1)), [telas.length]);
  const previaCalculada = useMemo(() => (dataDela && dataDele ? previaDaSinastria(dataDela, dataDele) : null), [dataDela, dataDele]);

  // O "ao vivo" (0944): enquanto a aba está visível, a visita segue aparecendo no painel.
  useEffect(() => manterVivo(slug, "sinastria"), [slug]);
  // O funil no nosso banco (0944): cada tela a que a pessoa chega vira um passo.
  useEffect(() => {
    if (!moedaLida) return;
    if (fase === "quiz") {
      if (tela === 0) marcarPasso(slug, QUIZ, "abriu", moeda);
      if (atual?.tipo === "mecanismo") marcarPasso(slug, QUIZ, "perguntas", moeda);
      if (atual?.tipo === "calculo") marcarPasso(slug, QUIZ, "dados", moeda);
      if (atual?.tipo === "email") marcarPasso(slug, QUIZ, "email", moeda);
    }
    if (fase === "previa") marcarPasso(slug, QUIZ, "previa", moeda);
    if (fase === "pronto") marcarPasso(slug, QUIZ, "leitura", moeda);
  }, [fase, tela, atual?.tipo, slug, moeda, moedaLida]);

  // Quem volta para a página continua de onde parou.
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE(slug));
      if (salvo) {
        const p = JSON.parse(salvo) as { id: string; segredo: string };
        if (p?.id && p?.segredo) {
          setPedido(p);
          setFase("pagar");
        }
      }
    } catch {
      /* armazenamento indisponível: começa do zero */
    }
  }, [slug]);

  const consultar = useCallback(async () => {
    if (!pedido) return;
    const r = await fetch(`/api/v1/area/publica/${slug}/sinastria/${pedido.id}`, { headers: { "x-segredo": pedido.segredo }, cache: "no-store" });
    if (r.status === 404) {
      try {
        localStorage.removeItem(CHAVE(slug));
      } catch {
        /* nada */
      }
      setPedido(null);
      setFase("quiz");
      setTela(0);
      return;
    }
    if (!r.ok) return;
    const { data } = (await r.json()) as { data: { pago: boolean; texto: string | null; previa: Previa | null } };
    if (data.previa) setPrevia(data.previa);
    if (data.texto) {
      setTexto(data.texto);
      setFase("pronto");
      return;
    }
    if (data.pago) {
      if (!compraMarcada.current) {
        compraMarcada.current = true;
        pixel("Purchase", { value: preco / 100, currency: moeda, content_name: "O Código da Conexão" }, `sinastria-${pedido.id}`);
        marcarPasso(slug, "sinastria", "pago", moeda);
      }
      setFase("gerando");
      if (gerandoRef.current) return;
      gerandoRef.current = true;
      const g = await fetch(`/api/v1/area/publica/${slug}/sinastria/${pedido.id}`, { method: "POST", headers: { "x-segredo": pedido.segredo } });
      gerandoRef.current = false;
      if (g.ok) {
        const { data: d } = (await g.json()) as { data: { texto: string } };
        setTexto(d.texto);
        setFase("pronto");
      }
    }
  }, [pedido, slug, preco, moeda]);

  // Enquanto espera o pagamento (ou a escrita), pergunta a cada 4 s.
  useEffect(() => {
    if (!pedido || (fase !== "pagar" && fase !== "gerando")) return;
    void consultar();
    const t = setInterval(() => void consultar(), 4000);
    return () => clearInterval(t);
  }, [pedido, fase, consultar]);

  const nomesOk = nomeDela.trim().length > 0 && nomeDele.trim().length > 0;

  async function pagar(forma: "pix" | "cartao") {
    marcarPasso(slug, "sinastria", "pagar", moeda);
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch(`/api/v1/area/publica/${slug}/sinastria`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome_dela: nomeDela.trim(),
          nascimento_dela: dataDela,
          nome_dele: nomeDele.trim(),
          nascimento_dele: dataDele,
          email: email.trim(),
          respostas,
          forma,
          moeda,
          visita: idDaVisita(slug, "sinastria"),
        }),
      });
      const corpo = (await r.json().catch(() => null)) as
        | { data?: { id: string; segredo: string; cobranca: Cobranca; previa: Previa }; error?: { message: string } }
        | null;
      if (!r.ok || !corpo?.data) {
        setErro(corpo?.error?.message ?? tx.naoFoiPossivel);
        return;
      }
      const p = { id: corpo.data.id, segredo: corpo.data.segredo };
      try {
        localStorage.setItem(CHAVE(slug), JSON.stringify(p));
      } catch {
        /* sem armazenamento: a página segue, só não lembra depois */
      }
      setPedido(p);
      setPrevia(corpo.data.previa);
      setCobranca(corpo.data.cobranca);
      setFase("pagar");
      pixel("InitiateCheckout", { value: preco / 100, currency: moeda }, `checkout-${p.id}`);
      marcarPasso(slug, "sinastria", "cobranca", moeda);
      if (corpo.data.cobranca.forma === "cartao") window.open(corpo.data.cobranca.url, "_blank", "noopener");
    } catch {
      setErro(tx.semConexao);
    } finally {
      setEnviando(false);
    }
  }

  function mostrarPrevia() {
    setErro(null);
    pixel("Lead", { content_name: "quiz-sinastria" });
    enviarLead(slug, "sinastria", {
      nome: nomeDela.trim(),
      email: email.trim(),
      nascimento: dataDela,
      nomeDele: nomeDele.trim(),
      nascimentoDele: dataDele,
      respostas,
    });
    setFase("previa");
  }

  const botao = "w-full rounded-full px-6 py-4 text-base font-semibold text-white shadow-lg disabled:opacity-50";
  const campo = "w-full rounded-2xl border border-[#c9a54e]/25 bg-[#120d22] px-4 py-3 text-base text-[#f6f0e4] placeholder:text-[#7d7495] focus:outline-hidden focus:ring-2";

  return (
    <section className="mx-auto max-w-md px-5 py-8">
      {pixelId ? (
        <Script id="pixel-quiz-sinastria" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`}
        </Script>
      ) : null}

      {fase === "quiz" && atual && atual.tipo !== "frase" && atual.tipo !== "calculo" && (
        <Progresso atual={tela + 1} total={telas.length} cor={cor} />
      )}

      {fase === "quiz" && atual?.tipo === "pergunta" && perguntas[atual.i] && (
        <div className={CARTAO}>
          <p className={SOBRETITULO}>{perguntas[atual.i]!.capitulo}</p>
          <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>{perguntas[atual.i]!.texto}</h2>
          <div className="mt-5 space-y-3">
            {perguntas[atual.i]!.opcoes.map((o) => (
              <button
                key={o}
                className="w-full rounded-2xl border border-[#c9a54e]/25 bg-[#120d22] px-4 py-3 text-left text-base text-[#f6f0e4] hover:border-[#e2c47a]"
                onClick={() => {
                  setRespostas((r) => ({ ...r, [perguntas[atual.i]!.id]: o }));
                  avancar();
                }}
              >
                {o}
              </button>
            ))}
          </div>
          {tela > 0 && (
            <button className="mt-4 text-sm text-[#9d94b2] underline" onClick={() => setTela(tela - 1)}>
              ← {tx.voltar}
            </button>
          )}
        </div>
      )}

      {fase === "quiz" && atual?.tipo === "frase" && (
        <Interludio frase={atual.frase} assinatura={guia.nome ?? tx.assinatura} botao={tx.continuar} cor={cor} aoContinuar={avancar} foto={guia.foto} />
      )}

      {fase === "quiz" && atual?.tipo === "mecanismo" && (
        <div className={CARTAO}>
          <VideoDaGuia url={videoMeio} capa={guia.foto} />
          <p className={SOBRETITULO}>{tx.comoFunciona}</p>
          <p className="mt-3 text-[16px] leading-relaxed text-[#f6f0e4]">{tx.mecanismo}</p>
          <button className={`${botao} mt-6`} style={{ background: cor }} onClick={avancar}>
            {tx.continuar}
          </button>
        </div>
      )}

      {fase === "quiz" && atual?.tipo === "nomes" && (
        <div className={CARTAO}>
          <h2 className={`${SERIF} text-2xl text-[#f6e3a8]`}>{tx.voces}</h2>
          <div className="mt-5 space-y-3">
            <input className={campo} placeholder={tx.seuNome} value={nomeDela} maxLength={80} onChange={(e) => setNomeDela(e.target.value)} />
            <input className={campo} placeholder={tx.nomeDele} value={nomeDele} maxLength={80} onChange={(e) => setNomeDele(e.target.value)} />
          </div>
          <button className={`${botao} mt-6`} style={{ background: cor }} disabled={!nomesOk} onClick={avancar}>
            {tx.continuar}
          </button>
        </div>
      )}

      {fase === "quiz" && atual?.tipo === "dataDela" && (
        <div className={CARTAO}>
          <SeletorDeData
            key="dela"
            titulo={tx.quandoVoceNasceu}
            tx={{ mes: tx.dataMes, dia: tx.dataDia, decada: tx.dataDecada, ano: tx.dataAno, meses: tx.meses }}
            aoEscolher={(iso) => {
              setDataDela(iso);
              avancar();
            }}
          />
        </div>
      )}

      {fase === "quiz" && atual?.tipo === "dataDele" && (
        <div className={CARTAO}>
          <SeletorDeData
            key="dele"
            titulo={`${tx.quandoOutraNasceu} ${nomeDele.trim()}?`}
            tx={{ mes: tx.dataMes, dia: tx.dataDia, decada: tx.dataDecada, ano: tx.dataAno, meses: tx.meses }}
            aoEscolher={(iso) => {
              setDataDele(iso);
              avancar();
            }}
          />
        </div>
      )}

      {fase === "quiz" && atual?.tipo === "calculo" && previaCalculada && (
        <TelaDeCalculo
          titulo={tx.lendoOsMapas}
          foto={guia.foto}
          linhas={[
            `${tx.solDe} ${nomeDela.trim()} ${tx.em} ${previaCalculada.signoDela} · ${tx.elemento} ${previaCalculada.elementoDela}`,
            `${tx.solDe} ${nomeDele.trim()} ${tx.em} ${previaCalculada.signoDele} · ${tx.elemento} ${previaCalculada.elementoDele}`,
            `${tx.cruzandoElementos}: ${previaCalculada.elementoDela} + ${previaCalculada.elementoDele} = ${previaCalculada.titulo}`,
            ...(respostas.briga ? [`${tx.juntandoRespostas} ${respostas.briga.toLowerCase()}`] : []),
          ]}
          aoTerminar={avancar}
        />
      )}

      {fase === "quiz" && atual?.tipo === "email" && (
        <div className={CARTAO}>
          <h2 className={`${SERIF} text-2xl text-[#f6e3a8]`}>{tx.paraOnde}</h2>
          <input className={`${campo} mt-5`} type="email" placeholder={tx.seuEmail} value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
          <p className="mt-2 text-xs text-[#9d94b2]">{tx.semSpam}</p>
          <button
            className={`${botao} mt-6`}
            style={{ background: cor }}
            disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}
            onClick={mostrarPrevia}
          >
            {tx.verResultado}
          </button>
        </div>
      )}

      {fase === "previa" && previaCalculada && (
        <PaginaFinal
          cor={cor}
          sobretitulo={tx.seuResultado}
          titulo={`${nomeDela.trim()}, ${tx.previaPronta}`}
          subtitulo={tx.calculadaDe}
          video={videoPrevia}
          capaDoVideo={guia.foto}
          dados={[
            { rotulo: `${tx.signoDe} ${nomeDela.trim()}`, valor: previaCalculada.signoDela },
            { rotulo: `${tx.signoDe} ${nomeDele.trim()}`, valor: previaCalculada.signoDele },
            { rotulo: tx.elementos, valor: `${previaCalculada.elementoDela} + ${previaCalculada.elementoDele}` },
            { rotulo: tx.combinacao, valor: previaCalculada.titulo },
          ]}
          resultado={
            <div className={CARTAO}>
              <p className="text-xs uppercase tracking-wide text-[#7fd1a0]">{tx.pontoForte}</p>
              <p className="mt-1 text-[16px] leading-relaxed text-[#f6f0e4]">{previaCalculada.forte}</p>
              <p className="mt-4 text-xs uppercase tracking-wide text-[#f3a3c0]">{tx.pontoDeAtencao}</p>
              <p className="mt-1 text-[16px] leading-relaxed text-[#f6f0e4]">{previaCalculada.atencao}</p>
              {respostas.aperta ? (
                <p className="mt-4 border-l-2 border-[#c9a54e]/40 pl-3 text-[15px] leading-relaxed text-[#c3bad3]">
                  {tx.voceContou}{" "}
                  {respostas.briga && respostas.briga !== "Quase não brigamos"
                    ? `${tx.seDesentendemPor} ${respostas.briga.toLowerCase()} ${tx.eQueAperta}`
                    : tx.oQueMaisAperta}{" "}
                  “{respostas.aperta.toLowerCase()}”.
                </p>
              ) : null}
              <p className="mt-4 text-[15px] leading-relaxed text-[#c3bad3]">{tx.ponte}</p>
            </div>
          }
          partes={[
            { titulo: tx.parte1, gancho: `${previaCalculada.signoDela} e ${previaCalculada.signoDele}` },
            { titulo: tx.parte2, gancho: previaCalculada.titulo },
            { titulo: tx.parte3 },
            { titulo: tx.parte4, gancho: respostas.briga && respostas.briga !== "Quase não brigamos" ? `${tx.ligadoA} ${respostas.briga.toLowerCase()}` : undefined },
            { titulo: tx.parte5, gancho: respostas.carinho ? `${tx.doJeito} ${respostas.carinho.toLowerCase()}` : undefined },
            { titulo: tx.parte6, gancho: respostas.deseja ? `${tx.paraResponder} ${respostas.deseja.toLowerCase()}` : undefined },
          ]}
          itens={[tx.entrega1, tx.entrega2, tx.entrega3, tx.entrega4, tx.entrega5]}
          preco={valorNaMoedaDaPagina(preco, moeda)}
          brasil={moeda === "BRL"}
          enviando={enviando}
          erro={erro}
          aoPagar={(forma) => void pagar(forma)}
          tx={tx.final}
        />
      )}

      {fase === "pagar" && (
        <div className={CARTAO}>
          <p className={SOBRETITULO}>{tx.quaseLa}</p>
          {cobranca?.forma === "pix" ? (
            <>
              <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>{tx.pagueComPix}</h2>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-[15px] text-[#c3bad3]">
                <li>{tx.pixPasso1}</li>
                <li>{tx.pixPasso2}</li>
                <li>{tx.pixPasso3} ({valorNaMoedaDaPagina(preco, moeda)})</li>
              </ol>
              {cobranca.qrPng ? (
                // eslint-disable-next-line @next/next/no-img-element -- QR em data URI, gerado na hora
                <img src={cobranca.qrPng} alt="QR code do Pix" className="mx-auto mt-4 h-48 w-48 rounded-xl bg-white p-2" />
              ) : null}
              <button
                className={`${botao} mt-4`}
                style={{ background: cor }}
                onClick={() => {
                  void copyToClipboard(cobranca.copiaECola).then((ok) => setCopiado(ok));
                }}
              >
                {copiado ? tx.copiado : tx.copiar}
              </button>
            </>
          ) : cobranca?.forma === "cartao" ? (
            <>
              <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>{tx.pagueNoCartao}</h2>
              <a className={`${botao} mt-4 block text-center`} style={{ background: cor }} href={cobranca.url} target="_blank" rel="noopener noreferrer">
                {tx.abrirPagamento}
              </a>
            </>
          ) : (
            <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>{tx.esperando}</h2>
          )}
          <p className="mt-4 text-center text-sm text-[#c3bad3]">{tx.assimQueCair}</p>
        </div>
      )}

      {fase === "gerando" && (
        <div className={`${CARTAO} text-center`}>
          <p className={SOBRETITULO}>{tx.confirmado}</p>
          <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>{tx.escrevendo}</h2>
          <p className="mt-3 text-[15px] text-[#c3bad3]">{tx.menosDeUmMinuto}</p>
        </div>
      )}

      {fase === "pronto" && texto && (
        <article className={CARTAO}>
          <p className={SOBRETITULO}>{tx.codigo}</p>
          {previa ? (
            <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>
              {previa.signoDela} e {previa.signoDele}
            </h2>
          ) : null}
          <div className="mt-4 space-y-4 whitespace-pre-line text-[16px] leading-relaxed text-[#f6f0e4]">{texto}</div>
          <p className="mt-6 text-xs text-[#9d94b2]">{tx.guarde}</p>
        </article>
      )}
    </section>
  );
}
