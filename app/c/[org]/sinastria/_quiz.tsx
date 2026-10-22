"use client";

/**
 * O quiz "Vocês combinam?" no navegador: as perguntas, a prévia calculada, o pagamento (Pix na própria página ou
 * cartão pela Stripe) e a leitura, que aparece aqui quando o aviso de pagamento marca o pedido. O pedido e o seu
 * segredo ficam no navegador: quem fecha a página e volta encontra a leitura onde parou.
 */
import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { moedaDaOferta, precoDaOferta, valorNaMoedaDaPagina, type MoedaDaPagina } from "@/lib/area-do-cliente/moeda-do-visitante";
import { copyToClipboard } from "@/lib/clipboard";

import { enviarLead, idDaVisita, manterVivo, marcarPasso } from "../_passos";

import { CARTAO, SERIF, SOBRETITULO } from "../_tema";
import type { TextosDoQuiz } from "./_textos";

interface Pergunta {
  id: "momento" | "aperta" | "deseja";
  texto: string;
  opcoes: string[];
}

interface Previa {
  signoDela: string;
  signoDele: string;
  elementoDela: string;
  elementoDele: string;
  titulo: string;
  texto: string;
}

type Cobranca = { forma: "pix"; copiaECola: string; qrPng: string | null } | { forma: "cartao"; url: string };

type Fase = "dados" | "perguntas" | "email" | "previa" | "pagar" | "gerando" | "pronto";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const CHAVE = (slug: string) => `quiz-sinastria:${slug}`;

/** "07/02/1984" → "1984-02-07". `null` quando não é uma data. */
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

export function QuizDaSinastria(props: {
  slug: string;
  cor: string;
  precoCents: number;
  /** Preço para quem abre a página fora do Brasil; a moeda vem do fuso do aparelho. */
  precosInternacionais: { currency: "EUR" | "USD"; price_cents: number }[];
  pixelId: string | null;
  perguntas: Pergunta[];
  tx: TextosDoQuiz;
}) {
  const { slug, cor, precoCents, precosInternacionais, pixelId, perguntas, tx } = props;
  const [fase, setFase] = useState<Fase>("dados");
  const [nomeDela, setNomeDela] = useState("");
  const [dataDela, setDataDela] = useState("");
  const [nomeDele, setNomeDele] = useState("");
  const [dataDele, setDataDele] = useState("");
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
  const QUIZ = "sinastria" as const;
  const TEM_PERGUNTAS = true;

  // O "ao vivo" (0944): enquanto a aba está visível, a visita segue aparecendo no painel.
  useEffect(() => manterVivo(slug, "sinastria"), [slug]);
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
  }, [fase, slug, moeda, moedaLida]);

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
      setFase("dados");
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

  const dadosOk = useMemo(
    () => nomeDela.trim().length > 0 && nomeDele.trim().length > 0 && isoDaData(dataDela) !== null && isoDaData(dataDele) !== null,
    [nomeDela, nomeDele, dataDela, dataDele],
  );

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
          nascimento_dela: isoDaData(dataDela),
          nome_dele: nomeDele.trim(),
          nascimento_dele: isoDaData(dataDele),
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
      nascimento: isoDaData(dataDela),
      nomeDele: nomeDele.trim(),
      nascimentoDele: isoDaData(dataDele),
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

      {fase === "dados" && (
        <div className={CARTAO}>
          <p className={SOBRETITULO}>{tx.passo1}</p>
          <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>{tx.voces}</h2>
          <div className="mt-5 space-y-3">
            <input className={campo} placeholder={tx.seuNome} value={nomeDela} maxLength={80} onChange={(e) => setNomeDela(e.target.value)} />
            <input className={campo} placeholder={tx.suaData} inputMode="numeric" value={dataDela} onChange={(e) => setDataDela(mascaraDeData(e.target.value))} />
            <input className={campo} placeholder={tx.nomeDele} value={nomeDele} maxLength={80} onChange={(e) => setNomeDele(e.target.value)} />
            <input className={campo} placeholder={tx.dataDele} inputMode="numeric" value={dataDele} onChange={(e) => setDataDele(mascaraDeData(e.target.value))} />
          </div>
          <button className={`${botao} mt-6`} style={{ background: cor }} disabled={!dadosOk} onClick={() => setFase("perguntas")}>
            {tx.continuar}
          </button>
        </div>
      )}

      {fase === "perguntas" && perguntas[passo] && (
        <div className={CARTAO}>
          <p className={SOBRETITULO}>{tx.passo2} · {passo + 1}/{perguntas.length}</p>
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

      {fase === "previa" && (
        <PreviaLocal tx={tx} nomeDela={nomeDela} nomeDele={nomeDele} dataDela={isoDaData(dataDela)} dataDele={isoDaData(dataDele)}>
          <div className={`${CARTAO} mt-5`}>
            <p className={SOBRETITULO}>{tx.codigo}</p>
            <h3 className={`${SERIF} mt-2 text-xl text-[#f6e3a8]`}>{tx.completa}</h3>
            <ul className="mt-3 space-y-1.5 text-[15px] text-[#c3bad3]">
              <li>• {tx.item1}</li>
              <li>• {tx.item2}</li>
              <li>• {tx.item3}</li>
              <li>• {tx.item4}</li>
              <li>• {tx.item5}</li>
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
        </PreviaLocal>
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

/** A prévia grátis, calculada no navegador pelas mesmas regras do servidor (`lib/area-do-cliente/sinastria.ts`). */
function PreviaLocal(props: { tx: TextosDoQuiz; nomeDela: string; nomeDele: string; dataDela: string | null; dataDele: string | null; children: React.ReactNode }) {
  const [p, setP] = useState<Previa | null>(null);
  useEffect(() => {
    let vivo = true;
    void import("@/lib/area-do-cliente/sinastria").then((m) => {
      if (vivo && props.dataDela && props.dataDele) setP(m.previaDaSinastria(props.dataDela, props.dataDele));
    });
    return () => {
      vivo = false;
    };
  }, [props.dataDela, props.dataDele]);
  return (
    <>
      <div className={CARTAO}>
        <p className={SOBRETITULO}>{props.tx.seuResultado}</p>
        {p ? (
          <>
            <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>
              {props.nomeDela.trim()} ({p.signoDela}) e {props.nomeDele.trim()} ({p.signoDele})
            </h2>
            <p className="mt-2 text-sm text-[#e2c47a]">
              {p.elementoDela} + {p.elementoDele} · {p.titulo}
            </p>
            <p className="mt-3 text-[16px] leading-relaxed text-[#f6f0e4]">{p.texto}</p>
            <p className="mt-3 text-[15px] leading-relaxed text-[#c3bad3]">
              {props.tx.soOComeco}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[15px] text-[#c3bad3]">{props.tx.calculando}</p>
        )}
      </div>
      {props.children}
    </>
  );
}
