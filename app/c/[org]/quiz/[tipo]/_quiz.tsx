"use client";

/**
 * Os quizzes de uma pessoa no navegador: o nome (e a data, na prosperidade), as perguntas (nos caminhos), o
 * e-mail, a prévia calculada, o pagamento e a leitura. O pedido e o segredo ficam no navegador: quem volta para a
 * página encontra a leitura onde parou. Mesmo desenho do quiz da sinastria (`../../sinastria/_quiz.tsx`).
 */
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

import { moedaDaOferta, precoDaOferta, valorNaMoedaDaPagina, type MoedaDaPagina } from "@/lib/area-do-cliente/moeda-do-visitante";
import { copyToClipboard } from "@/lib/clipboard";

import { enviarLead, idDaVisita, manterVivo, marcarPasso } from "../../_passos";

import { CARTAO, SERIF, SOBRETITULO } from "../../_tema";
import type { TextosDoQuizDePessoa } from "./_textos";

interface Pergunta {
  id: string;
  texto: string;
  opcoes: string[];
}

interface Previa {
  titulo: string;
  texto: string;
  detalhe: string;
}

type Cobranca = { forma: "pix"; copiaECola: string; qrPng: string | null } | { forma: "cartao"; url: string };
type Fase = "dados" | "perguntas" | "email" | "previa" | "pagar" | "gerando" | "pronto";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}


function isoDaData(texto: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto.trim());
  if (!m) return null;
  const [d, mm, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mm < 1 || mm > 12 || d < 1 || d > 31) return null;
  return `${a}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function mascaraDeData(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function pixel(evento: string, dados?: Record<string, unknown>, id?: string) {
  try {
    window.fbq?.("track", evento, dados ?? {}, id ? { eventID: id } : undefined);
  } catch {
    /* o pixel nunca derruba a página */
  }
}

export function QuizDePessoa(props: {
  slug: string;
  tipo: "prosperidade" | "caminhos";
  cor: string;
  precoCents: number;
  /** Preço para quem abre a página fora do Brasil; a moeda vem do fuso do aparelho. */
  precosInternacionais: { currency: "EUR" | "USD"; price_cents: number }[];
  pixelId: string | null;
  perguntas: Pergunta[];
  tx: TextosDoQuizDePessoa;
}) {
  const { slug, tipo, cor, precoCents, precosInternacionais, pixelId, perguntas, tx } = props;
  const chave = `quiz-${tipo}:${slug}`;
  const base = `/api/v1/area/publica/${slug}/quiz/${tipo}`;
  const [fase, setFase] = useState<Fase>("dados");
  const [nome, setNome] = useState("");
  const [data, setData] = useState("");
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [passo, setPasso] = useState(0);
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
  const TEM_PERGUNTAS = perguntas.length > 0;

  // O "ao vivo" (0944): enquanto a aba está visível, a visita segue aparecendo no painel.
  useEffect(() => manterVivo(slug, tipo), [slug, tipo]);
  // O funil no nosso banco (0944): cada tela a que a pessoa chega vira um passo.
  useEffect(() => {
    if (!moedaLida) return;
    if (fase === "dados") marcarPasso(slug, QUIZ, "abriu", moeda);
    if (fase === "perguntas") marcarPasso(slug, QUIZ, "dados", moeda);
    if (fase === "email") {
      marcarPasso(slug, QUIZ, "dados", moeda);
      if (TEM_PERGUNTAS) marcarPasso(slug, QUIZ, "perguntas", moeda);
      marcarPasso(slug, QUIZ, "email", moeda);
    }
    if (fase === "previa") marcarPasso(slug, QUIZ, "previa", moeda);
    if (fase === "pronto") marcarPasso(slug, QUIZ, "leitura", moeda);
  }, [fase, slug, moeda, moedaLida, QUIZ, TEM_PERGUNTAS]);

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
      setFase("dados");
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

  const dadosOk = nome.trim().length > 0 && (tipo === "caminhos" || isoDaData(data) !== null);

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
          ...(tipo === "prosperidade" ? { nascimento: isoDaData(data) } : {}),
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

  async function verPrevia() {
    setErro(null);
    pixel("Lead", { content_name: `quiz-${tipo}` });
    enviarLead(slug, tipo, { nome: nome.trim(), email: email.trim(), nascimento: isoDaData(data), respostas });
    const m = await import("@/lib/area-do-cliente/quizzes");
    setPrevia(m.previaDoQuiz(tipo, { nascimento: isoDaData(data), respostas }));
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

      {fase === "dados" && (
        <div className={CARTAO}>
          <p className={SOBRETITULO}>{tx.passo1}</p>
          <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>{tx.sobreVoce}</h2>
          <div className="mt-5 space-y-3">
            <input className={campo} placeholder={tx.seuNome} value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
            {tipo === "prosperidade" ? (
              <input className={campo} placeholder={tx.suaData} inputMode="numeric" value={data} onChange={(e) => setData(mascaraDeData(e.target.value))} />
            ) : null}
          </div>
          <button className={`${botao} mt-6`} style={{ background: cor }} disabled={!dadosOk} onClick={() => setFase(perguntas.length > 0 ? "perguntas" : "email")}>
            {tx.continuar}
          </button>
        </div>
      )}

      {fase === "perguntas" && perguntas[passo] && (
        <div className={CARTAO}>
          <p className={SOBRETITULO}>
            {tx.passo2} · {passo + 1}/{perguntas.length}
          </p>
          <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>{perguntas[passo]!.texto}</h2>
          <div className="mt-5 space-y-3">
            {perguntas[passo]!.opcoes.map((o) => (
              <button
                key={o}
                className="w-full rounded-2xl border border-[#c9a54e]/25 bg-[#120d22] px-4 py-3 text-left text-base text-[#f6f0e4] hover:border-[#e2c47a]"
                onClick={() => {
                  setRespostas((r) => ({ ...r, [perguntas[passo]!.id]: o }));
                  if (passo + 1 < perguntas.length) setPasso(passo + 1);
                  else setFase("email");
                }}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}

      {fase === "email" && (
        <div className={CARTAO}>
          <p className={SOBRETITULO}>{tx.passo3}</p>
          <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>{tx.paraOnde}</h2>
          <input className={`${campo} mt-5`} type="email" placeholder={tx.seuEmail} value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
          <p className="mt-2 text-xs text-[#9d94b2]">{tx.semSpam}</p>
          <button className={`${botao} mt-6`} style={{ background: cor }} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} onClick={() => void verPrevia()}>
            {tx.verResultado}
          </button>
        </div>
      )}

      {fase === "previa" && (
        <>
          <div className={CARTAO}>
            <p className={SOBRETITULO}>{tx.seuResultado}</p>
            {previa ? (
              <>
                <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>
                  {nome.trim()}: {previa.titulo}
                </h2>
                <p className="mt-3 text-[16px] leading-relaxed text-[#f6f0e4]">{previa.texto}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-[#c3bad3]">{tx.soOComeco}</p>
              </>
            ) : null}
          </div>
          <div className={`${CARTAO} mt-5`}>
            <p className={SOBRETITULO}>{tx.produto}</p>
            <ul className="mt-3 space-y-1.5 text-[15px] text-[#c3bad3]">
              {tx.itens.map((i) => (
                <li key={i}>• {i}</li>
              ))}
            </ul>
            <p className="mt-4 text-3xl font-semibold text-[#f6e3a8]">{valorNaMoedaDaPagina(preco, moeda)}</p>
            <p className="text-xs text-[#9d94b2]">{tx.pagamentoUnico}</p>
            {erro && <p className="mt-3 text-sm text-[#f3a3c0]">{erro}</p>}
            {moeda === "BRL" ? (
              <>
                <button className={`${botao} mt-5`} style={{ background: cor }} disabled={enviando} onClick={() => void pagar("pix")}>
                  {enviando ? tx.gerando : tx.pagarPix}
                </button>
                <button className="mt-3 w-full text-sm text-[#e2c47a] underline disabled:opacity-50" disabled={enviando} onClick={() => void pagar("cartao")}>
                  {tx.prefiroCartao}
                </button>
                <p className="mt-3 text-center text-[11px] text-[#9d94b2]">{tx.noBanco}</p>
              </>
            ) : (
              // Fora do Brasil não há Pix: o cartão é o caminho, na moeda da pessoa.
              <button className={`${botao} mt-5`} style={{ background: cor }} disabled={enviando} onClick={() => void pagar("cartao")}>
                {enviando ? tx.gerando : tx.pagarCartao}
              </button>
            )}
          </div>
        </>
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
