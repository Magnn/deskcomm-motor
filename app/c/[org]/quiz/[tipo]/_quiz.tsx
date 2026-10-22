"use client";

/**
 * Os quizzes de uma pessoa no navegador: as perguntas, o nome (e a data, na prosperidade), o e-mail, a prévia
 * calculada, o pagamento e a leitura. O pedido e o segredo ficam no navegador: quem volta para a página encontra a
 * leitura onde parou. Mesmo desenho do quiz da sinastria (`../../sinastria/_quiz.tsx`): começa com toques, explica
 * o mecanismo, pede os dados por último e MOSTRA a conta — a soma da data na prosperidade, o voto de cada resposta
 * e a carta-chave nos caminhos.
 */
import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { moedaDaOferta, precoDaOferta, valorNaMoedaDaPagina, type MoedaDaPagina } from "@/lib/area-do-cliente/moeda-do-visitante";
import { PERFIS_DOS_CAMINHOS, previaDaProsperidade, previaDoPar, previaDoQuiz, previaDosCaminhos, votosDosCaminhos } from "@/lib/area-do-cliente/quizzes";
import { LUGARES_DE_NASCIMENTO, lugarPorId } from "@/lib/area-do-cliente/retrato-do-par";
import { copyToClipboard } from "@/lib/clipboard";

import { enviarLead, idDaVisita, manterVivo, marcarPasso } from "../../_passos";

import { PaginaFinal } from "../../_pagina-final";
import { Interludio, Progresso, SeletorDeData, TelaDeCalculo, VideoDaGuia } from "../../_quiz-pecas";
import { CARTAO, SERIF, SOBRETITULO } from "../../_tema";
import type { TextosDoQuizDePessoa } from "./_textos";

interface Pergunta {
  id: string;
  capitulo: string;
  texto: string;
  opcoes: string[];
}

interface Previa {
  titulo: string;
  texto: string;
  detalhe: string;
}

type Cobranca = { forma: "pix"; copiaECola: string; qrPng: string | null } | { forma: "cartao"; url: string };
type Fase = "quiz" | "previa" | "pagar" | "gerando" | "pronto";

/** Uma tela do caminho até a prévia, na ordem em que aparece. */
type Tela =
  | { tipo: "pergunta"; i: number }
  | { tipo: "frase"; frase: string }
  | { tipo: "mecanismo" }
  | { tipo: "nome" }
  | { tipo: "data" }
  | { tipo: "hora" }
  | { tipo: "lugar" }
  | { tipo: "calculo" }
  | { tipo: "email" };

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}


const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function pixel(evento: string, dados?: Record<string, unknown>, id?: string) {
  try {
    window.fbq?.("track", evento, dados ?? {}, id ? { eventID: id } : undefined);
  } catch {
    /* o pixel nunca derruba a página */
  }
}

export function QuizDePessoa(props: {
  slug: string;
  tipo: "prosperidade" | "caminhos" | "par";
  cor: string;
  precoCents: number;
  /** Preço para quem abre a página fora do Brasil; a moeda vem do fuso do aparelho. */
  precosInternacionais: { currency: "EUR" | "USD"; price_cents: number }[];
  pixelId: string | null;
  perguntas: Pergunta[];
  tx: TextosDoQuizDePessoa;
  /** A guia (nome e foto) e os vídeos dela no meio do quiz e na prévia (`midia.ts`, 0946); `null` = não mostra. */
  guia: { nome: string | null; foto: string | null };
  videoMeio: string | null;
  videoPrevia: string | null;
}) {
  const { slug, tipo, cor, precoCents, precosInternacionais, pixelId, perguntas, tx, guia, videoMeio, videoPrevia } = props;
  const chave = `quiz-${tipo}:${slug}`;
  const base = `/api/v1/area/publica/${slug}/quiz/${tipo}`;
  const [fase, setFase] = useState<Fase>("quiz");
  const [tela, setTela] = useState(0);
  const [nome, setNome] = useState("");
  const [data, setData] = useState("");
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
  const QUIZ = tipo;

  // O roteiro: as perguntas, com a frase da Cigana a cada troca de capítulo, o mecanismo e os dados.
  const telas = useMemo<Tela[]>(() => {
    const frases = [...tx.frases];
    const r: Tela[] = [];
    perguntas.forEach((p, i) => {
      if (i > 0 && p.capitulo !== perguntas[i - 1]!.capitulo && frases.length > 0) r.push({ tipo: "frase", frase: frases.shift()! });
      r.push({ tipo: "pergunta", i });
    });
    r.push({ tipo: "mecanismo" }, { tipo: "nome" });
    if (tipo === "prosperidade") r.push({ tipo: "data" });
    // O Retrato do Par pede também a hora e o lugar (o Descendente depende dos dois).
    if (tipo === "par") r.push({ tipo: "data" }, { tipo: "hora" }, { tipo: "lugar" });
    r.push({ tipo: "calculo" }, { tipo: "email" });
    return r;
  }, [perguntas, tipo, tx.frases]);
  const atual = telas[tela];
  const avancar = useCallback(() => setTela((t) => Math.min(t + 1, telas.length - 1)), [telas.length]);
  const prosperidade = useMemo(() => (tipo === "prosperidade" && data ? previaDaProsperidade(data) : null), [tipo, data]);
  const caminhos = useMemo(() => (tipo === "caminhos" ? previaDosCaminhos(respostas) : null), [tipo, respostas]);
  const par = useMemo(() => (tipo === "par" && data ? previaDoPar(data, respostas) : null), [tipo, data, respostas]);
  const irPara = useCallback((alvo: Tela["tipo"]) => setTela(telas.findIndex((t) => t.tipo === alvo)), [telas]);
  // A conta que a tela de cálculo mostra — a MESMA que deu o resultado.
  const linhasDoCalculo = useMemo(() => {
    if (prosperidade) {
      const [primeiro, ...resto] = prosperidade.passos;
      return [
        `${tx.somando}: ${primeiro}`,
        ...resto.map((p) => `${tx.reduzindo}: ${p}`),
        `${tx.numeroDoDestino}: ${prosperidade.numero} · ${prosperidade.titulo}`,
        `${tx.anoPessoalDe} ${prosperidade.ano}: ${prosperidade.anoPessoal}`,
      ];
    }
    if (caminhos) {
      const votos = votosDosCaminhos(respostas);
      const vezes = votos.filter((v) => v.perfil === caminhos.perfil).length;
      return [
        ...votos.map((v) => `“${v.resposta}” → ${PERFIS_DOS_CAMINHOS[v.perfil].titulo}`),
        `${tx.maioria}: ${caminhos.titulo} (${vezes} ${tx.vezes} ${votos.length})`,
        `${tx.cartaChave}: ${caminhos.carta}`,
      ];
    }
    if (par) {
      const r = par.retrato;
      const lugar = lugarPorId(respostas.lugar);
      const [a, m, d] = data.split("-");
      return [
        `${tx.horaLocal}: ${d}/${m}/${a}${respostas.hora && lugar ? ` · ${respostas.hora} · ${lugar.nome}` : ""}`,
        `${tx.posicaoDeVenus}: ${r.venus.signo} ${r.venus.grau}° · ${r.venus.elemento}`,
        ...(r.descendente
          ? [
              `${tx.ascendenteCalculado}: ${r.descendente.ascendente}`,
              `${tx.descendenteCalculado}: ${r.descendente.signo} ${r.descendente.grau}° · ${r.descendente.elemento}`,
              `${tx.cruzando}: ${r.venus.elemento} + ${r.descendente.elemento}`,
            ]
          : []),
      ];
    }
    return [];
  }, [prosperidade, caminhos, par, data, respostas, tx]);

  // O "ao vivo" (0944): enquanto a aba está visível, a visita segue aparecendo no painel.
  useEffect(() => manterVivo(slug, tipo), [slug, tipo]);
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
  }, [fase, tela, atual?.tipo, slug, moeda, moedaLida, QUIZ]);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(chave);
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
  }, [chave]);

  const consultar = useCallback(async () => {
    if (!pedido) return;
    const r = await fetch(`${base}/${pedido.id}`, { headers: { "x-segredo": pedido.segredo }, cache: "no-store" });
    if (r.status === 404) {
      try {
        localStorage.removeItem(chave);
      } catch {
        /* nada */
      }
      setPedido(null);
      setFase("quiz");
      setTela(0);
      return;
    }
    if (!r.ok) return;
    const { data: d } = (await r.json()) as { data: { pago: boolean; texto: string | null; previa: Previa | null } };
    if (d.previa) setPrevia(d.previa);
    if (d.texto) {
      setTexto(d.texto);
      setFase("pronto");
      return;
    }
    if (d.pago) {
      if (!compraMarcada.current) {
        compraMarcada.current = true;
        pixel("Purchase", { value: preco / 100, currency: moeda, content_name: tx.produto }, `quiz-${pedido.id}`);
        marcarPasso(slug, tipo, "pago", moeda);
      }
      setFase("gerando");
      if (gerandoRef.current) return;
      gerandoRef.current = true;
      const g = await fetch(`${base}/${pedido.id}`, { method: "POST", headers: { "x-segredo": pedido.segredo } });
      gerandoRef.current = false;
      if (g.ok) {
        const { data: feito } = (await g.json()) as { data: { texto: string } };
        setTexto(feito.texto);
        setFase("pronto");
      }
    }
  }, [pedido, base, chave, preco, moeda, tx.produto, slug, tipo]);

  useEffect(() => {
    if (!pedido || (fase !== "pagar" && fase !== "gerando")) return;
    void consultar();
    const t = setInterval(() => void consultar(), 4000);
    return () => clearInterval(t);
  }, [pedido, fase, consultar]);


  async function pagar(forma: "pix" | "cartao") {
    marcarPasso(slug, tipo, "pagar", moeda);
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          ...(tipo === "prosperidade" || tipo === "par" ? { nascimento: data } : {}),
          email: email.trim(),
          respostas,
          forma,
          moeda,
          visita: idDaVisita(slug, tipo),
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
        localStorage.setItem(chave, JSON.stringify(p));
      } catch {
        /* sem armazenamento: a página segue, só não lembra depois */
      }
      setPedido(p);
      setPrevia(corpo.data.previa);
      setCobranca(corpo.data.cobranca);
      setFase("pagar");
      pixel("InitiateCheckout", { value: preco / 100, currency: moeda }, `checkout-${p.id}`);
      marcarPasso(slug, tipo, "cobranca", moeda);
      if (corpo.data.cobranca.forma === "cartao") window.open(corpo.data.cobranca.url, "_blank", "noopener");
    } catch {
      setErro(tx.semConexao);
    } finally {
      setEnviando(false);
    }
  }

  function verPrevia() {
    setErro(null);
    pixel("Lead", { content_name: `quiz-${tipo}` });
    enviarLead(slug, tipo, { nome: nome.trim(), email: email.trim(), nascimento: data || null, respostas });
    setPrevia(previaDoQuiz(tipo, { nascimento: data || null, respostas }));
    setFase("previa");
  }

  const botao = "w-full rounded-full px-6 py-4 text-base font-semibold text-white shadow-lg disabled:opacity-50";
  const campo = "w-full rounded-2xl border border-[#c9a54e]/25 bg-[#120d22] px-4 py-3 text-base text-[#f6f0e4] placeholder:text-[#7d7495] focus:outline-hidden focus:ring-2";

  return (
    <section className="mx-auto max-w-md px-5 py-8">
      {pixelId ? (
        <Script id={`pixel-quiz-${tipo}`} strategy="afterInteractive">
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

      {fase === "quiz" && atual?.tipo === "nome" && (
        <div className={CARTAO}>
          <h2 className={`${SERIF} text-2xl text-[#f6e3a8]`}>{tx.sobreVoce}</h2>
          <input className={`${campo} mt-5`} placeholder={tx.seuNome} value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
          <button className={`${botao} mt-6`} style={{ background: cor }} disabled={nome.trim().length === 0} onClick={avancar}>
            {tx.continuar}
          </button>
        </div>
      )}

      {fase === "quiz" && atual?.tipo === "data" && (
        <div className={CARTAO}>
          <SeletorDeData
            titulo={tx.quandoVoceNasceu}
            tx={{ mes: tx.dataMes, dia: tx.dataDia, decada: tx.dataDecada, ano: tx.dataAno, meses: tx.meses }}
            aoEscolher={(iso) => {
              setData(iso);
              avancar();
            }}
          />
        </div>
      )}

      {fase === "quiz" && atual?.tipo === "hora" && (
        <div className={CARTAO}>
          <h2 className={`${SERIF} text-2xl text-[#f6e3a8]`}>{tx.horaTitulo}</h2>
          <p className="mt-2 text-sm text-[#c3bad3]">{tx.horaAjuda}</p>
          <input
            type="time"
            className={`${campo} mt-5 text-center text-2xl`}
            value={respostas.hora ?? ""}
            onChange={(e) => setRespostas((r) => ({ ...r, hora: e.target.value }))}
          />
          <button className={`${botao} mt-6`} style={{ background: cor }} disabled={!/^\d{2}:\d{2}$/.test(respostas.hora ?? "")} onClick={avancar}>
            {tx.continuar}
          </button>
          <button
            className="mt-4 w-full text-sm text-[#e2c47a] underline"
            onClick={() => {
              setRespostas(({ hora: _h, lugar: _l, ...resto }) => resto);
              irPara("calculo");
            }}
          >
            {tx.horaNaoSei}
          </button>
          <p className="mt-2 text-center text-xs text-[#9d94b2]">{tx.horaSemEla}</p>
        </div>
      )}

      {fase === "quiz" && atual?.tipo === "lugar" && (
        <div className={CARTAO}>
          <h2 className={`${SERIF} text-2xl text-[#f6e3a8]`}>{tx.lugarTitulo}</h2>
          <p className="mt-2 text-sm text-[#c3bad3]">{tx.lugarAjuda}</p>
          <select
            className={`${campo} mt-5`}
            value={respostas.lugar ?? ""}
            onChange={(e) => setRespostas((r) => ({ ...r, lugar: e.target.value }))}
          >
            <option value="" disabled>
              —
            </option>
            {LUGARES_DE_NASCIMENTO.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
          <button className={`${botao} mt-6`} style={{ background: cor }} disabled={!lugarPorId(respostas.lugar)} onClick={avancar}>
            {tx.continuar}
          </button>
        </div>
      )}

      {fase === "quiz" && atual?.tipo === "calculo" && linhasDoCalculo.length > 0 && (
        <TelaDeCalculo titulo={tx.calculando} linhas={linhasDoCalculo} aoTerminar={avancar} foto={guia.foto} />
      )}

      {fase === "quiz" && atual?.tipo === "email" && (
        <div className={CARTAO}>
          <h2 className={`${SERIF} text-2xl text-[#f6e3a8]`}>{tx.paraOnde}</h2>
          <input className={`${campo} mt-5`} type="email" placeholder={tx.seuEmail} value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
          <p className="mt-2 text-xs text-[#9d94b2]">{tx.semSpam}</p>
          <button className={`${botao} mt-6`} style={{ background: cor }} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} onClick={verPrevia}>
            {tx.verResultado}
          </button>
        </div>
      )}

      {fase === "previa" && (prosperidade || caminhos || par) && (
        <PaginaFinal
          cor={cor}
          sobretitulo={tx.seuResultado}
          titulo={`${nome.trim()}, ${tx.resultadoPronto}`}
          subtitulo={tx.calculadoDe}
          video={videoPrevia}
          capaDoVideo={guia.foto}
          dados={
            prosperidade
              ? [
                  { rotulo: tx.rotuloNumero, valor: String(prosperidade.numero) },
                  { rotulo: tx.rotuloArquetipo, valor: prosperidade.titulo },
                  { rotulo: `${tx.rotuloAno} ${prosperidade.ano}`, valor: String(prosperidade.anoPessoal) },
                  ...(respostas.estilo ? [{ rotulo: tx.rotuloEstilo, valor: respostas.estilo }] : []),
                ]
              : caminhos
                ? [
                    { rotulo: tx.rotuloPerfil, valor: caminhos.titulo },
                    { rotulo: tx.rotuloCarta, valor: caminhos.carta },
                    ...(respostas.area ? [{ rotulo: tx.rotuloArea, valor: respostas.area }] : []),
                  ]
                : par
                  ? [
                      { rotulo: tx.rotuloVenus, valor: par.retrato.venus.signo },
                      { rotulo: tx.rotuloDescendente, valor: par.retrato.descendente?.signo ?? tx.precisaDaHora },
                      ...(par.retrato.descendente ? [{ rotulo: tx.rotuloAscendente, valor: par.retrato.descendente.ascendente }] : []),
                      { rotulo: tx.rotuloCombinam, valor: par.retrato.combinam.join(", ") },
                    ]
                  : []
          }
          resultado={
            <div className={CARTAO}>
              {prosperidade ? (
                <>
                  <p className="text-[16px] leading-relaxed text-[#f6f0e4]">{prosperidade.texto}</p>
                  <p className="mt-4 text-[14px] text-[#c3bad3]">{tx.oQueEleAnoPede}</p>
                  {respostas.estilo && respostas.pesa ? (
                    <p className="mt-4 border-l-2 border-[#c9a54e]/40 pl-3 text-[15px] leading-relaxed text-[#c3bad3]">
                      {tx.comDinheiroE} {respostas.estilo.toLowerCase()} {tx.eQuePesa} “{respostas.pesa.toLowerCase()}”.
                    </p>
                  ) : null}
                </>
              ) : null}
              {par ? (
                <>
                  <p className="text-xs uppercase tracking-wide text-[#f3a3c0]">{tx.oQueTeAtrai}</p>
                  <p className="mt-1 text-[16px] leading-relaxed text-[#f6f0e4]">{maiuscula(par.retrato.venus.atrai)}.</p>
                  <p className="mt-4 text-xs uppercase tracking-wide text-[#7fd1a0]">{tx.oQueTeFazBem}</p>
                  <p className="mt-1 text-[16px] leading-relaxed text-[#f6f0e4]">
                    {par.retrato.descendente ? `${maiuscula(par.retrato.descendente.fazBem)}.` : tx.encontroSemHora}
                  </p>
                  {par.retrato.encontro !== "sem_hora" ? (
                    <p className="mt-4 rounded-2xl border border-[#c9a54e]/25 bg-[#120d22] p-4 text-[15px] leading-relaxed text-[#f6f0e4]">
                      {par.retrato.encontro === "conversam" ? tx.encontroConversam : tx.encontroDesencontram}
                    </p>
                  ) : null}
                  {respostas.termina ? (
                    <p className="mt-4 border-l-2 border-[#c9a54e]/40 pl-3 text-[15px] leading-relaxed text-[#c3bad3]">
                      {tx.voceContouRepete} “{respostas.termina.toLowerCase()}”.
                    </p>
                  ) : null}
                </>
              ) : null}
              {caminhos ? (
                <>
                  <p className="text-sm text-[#e2c47a]">
                    {tx.cartaChave}: <span className="font-semibold">{caminhos.carta}</span>
                  </p>
                  <p className="mt-1 text-[15px] leading-relaxed text-[#f6f0e4]">{caminhos.sentidoDaCarta}</p>
                  <p className="mt-4 text-[16px] leading-relaxed text-[#f6f0e4]">{caminhos.texto}</p>
                  {respostas.precisa ? (
                    <p className="mt-4 border-l-2 border-[#c9a54e]/40 pl-3 text-[15px] leading-relaxed text-[#c3bad3]">
                      {tx.voceContou} {tx.quePrecisaDe} “{respostas.precisa.toLowerCase()}”.
                    </p>
                  ) : null}
                </>
              ) : null}
              <p className="mt-4 text-[15px] leading-relaxed text-[#c3bad3]">{tx.ponte}</p>
            </div>
          }
          partes={tx.partes.map((titulo, i) => ({
            titulo,
            gancho:
              i === 2 && prosperidade && respostas.pesa
                ? `${tx.ligadoA} ${respostas.pesa.toLowerCase()}`
                : i === 3 && prosperidade
                  ? `${tx.rotuloAno} ${prosperidade.ano}: ${prosperidade.anoPessoal}`
                  : i === 0 && caminhos
                    ? `${caminhos.titulo} · ${caminhos.carta}`
                    : par
                      ? [
                          `Vênus em ${par.retrato.venus.signo}`,
                          par.retrato.descendente ? `Descendente em ${par.retrato.descendente.signo}` : tx.precisaDaHora,
                          respostas.termina ? `${tx.ligadoA} ${respostas.termina.toLowerCase()}` : undefined,
                          par.retrato.combinam.join(", "),
                          undefined,
                        ][i]
                      : undefined,
          }))}
          itens={tx.entregas}
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
                <li>
                  {tx.pixPasso3} ({valorNaMoedaDaPagina(preco, moeda)})
                </li>
              </ol>
              {cobranca.qrPng ? (
                // eslint-disable-next-line @next/next/no-img-element -- QR em data URI, gerado na hora
                <img src={cobranca.qrPng} alt="QR code do Pix" className="mx-auto mt-4 h-48 w-48 rounded-xl bg-white p-2" />
              ) : null}
              <button className={`${botao} mt-4`} style={{ background: cor }} onClick={() => void copyToClipboard(cobranca.copiaECola).then((ok) => setCopiado(ok))}>
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
          <p className={SOBRETITULO}>{tx.produto}</p>
          {previa ? <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>{previa.titulo}</h2> : null}
          <div className="mt-4 space-y-4 whitespace-pre-line text-[16px] leading-relaxed text-[#f6f0e4]">{texto}</div>
          <p className="mt-6 text-xs text-[#9d94b2]">{tx.guarde}</p>
        </article>
      )}
    </section>
  );
}
