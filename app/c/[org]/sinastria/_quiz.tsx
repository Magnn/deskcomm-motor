"use client";

/**
 * O quiz "Vocês combinam?" no navegador: as perguntas, a prévia calculada, o pagamento (Pix na própria página ou
 * cartão pela Stripe) e a leitura, que aparece aqui quando o aviso de pagamento marca o pedido. O pedido e o seu
 * segredo ficam no navegador: quem fecha a página e volta encontra a leitura onde parou.
 */
import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CARTAO, SERIF, SOBRETITULO } from "../_tema";

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

const reais = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
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

export function QuizDaSinastria(props: { slug: string; cor: string; precoCents: number; pixelId: string | null; perguntas: Pergunta[] }) {
  const { slug, cor, precoCents, pixelId, perguntas } = props;
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
        pixel("Purchase", { value: precoCents / 100, currency: "BRL", content_name: "O Código da Conexão" }, `sinastria-${pedido.id}`);
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
  }, [pedido, slug, precoCents]);

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
        }),
      });
      const corpo = (await r.json().catch(() => null)) as
        | { data?: { id: string; segredo: string; cobranca: Cobranca; previa: Previa }; error?: { message: string } }
        | null;
      if (!r.ok || !corpo?.data) {
        setErro(corpo?.error?.message ?? "Não foi possível continuar agora. Tente de novo.");
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
      pixel("InitiateCheckout", { value: precoCents / 100, currency: "BRL" }, `checkout-${p.id}`);
      if (corpo.data.cobranca.forma === "cartao") window.open(corpo.data.cobranca.url, "_blank", "noopener");
    } catch {
      setErro("Sem conexão. Confira a internet e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  function mostrarPrevia() {
    setErro(null);
    pixel("Lead", { content_name: "quiz-sinastria" });
    setFase("previa");
  }

  const botao = "w-full rounded-full px-6 py-4 text-base font-semibold text-white shadow-lg disabled:opacity-50";
  const campo = "w-full rounded-2xl border border-[#c9a54e]/25 bg-[#120d22] px-4 py-3 text-base text-[#f6f0e4] placeholder:text-[#7d7495] focus:outline-none focus:ring-2";

  return (
    <section className="mx-auto max-w-md px-5 py-8">
      {pixelId ? (
        <Script id="pixel-quiz-sinastria" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`}
        </Script>
      ) : null}

      {fase === "dados" && (
        <div className={CARTAO}>
          <p className={SOBRETITULO}>Passo 1 de 3</p>
          <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>Vocês dois</h2>
          <div className="mt-5 space-y-3">
            <input className={campo} placeholder="Seu primeiro nome" value={nomeDela} maxLength={80} onChange={(e) => setNomeDela(e.target.value)} />
            <input className={campo} placeholder="Sua data de nascimento (dd/mm/aaaa)" inputMode="numeric" value={dataDela} onChange={(e) => setDataDela(mascaraDeData(e.target.value))} />
            <input className={campo} placeholder="O primeiro nome dele" value={nomeDele} maxLength={80} onChange={(e) => setNomeDele(e.target.value)} />
            <input className={campo} placeholder="A data de nascimento dele (dd/mm/aaaa)" inputMode="numeric" value={dataDele} onChange={(e) => setDataDele(mascaraDeData(e.target.value))} />
          </div>
          <button className={`${botao} mt-6`} style={{ background: cor }} disabled={!dadosOk} onClick={() => setFase("perguntas")}>
            Continuar
          </button>
        </div>
      )}

      {fase === "perguntas" && perguntas[passo] && (
        <div className={CARTAO}>
          <p className={SOBRETITULO}>Passo 2 de 3 · {passo + 1}/{perguntas.length}</p>
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
          <p className={SOBRETITULO}>Passo 3 de 3</p>
          <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>Para onde mando o seu resultado?</h2>
          <input className={`${campo} mt-5`} type="email" placeholder="Seu melhor e-mail" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
          <p className="mt-2 text-xs text-[#9d94b2]">Usamos só para guardar a sua leitura. Nada de spam.</p>
          <button
            className={`${botao} mt-6`}
            style={{ background: cor }}
            disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}
            onClick={mostrarPrevia}
          >
            Ver o meu resultado
          </button>
        </div>
      )}

      {fase === "previa" && (
        <PreviaLocal nomeDela={nomeDela} nomeDele={nomeDele} dataDela={isoDaData(dataDela)} dataDele={isoDaData(dataDele)}>
          <div className={`${CARTAO} mt-5`}>
            <p className={SOBRETITULO}>O Código da Conexão</p>
            <h3 className={`${SERIF} mt-2 text-xl text-[#f6e3a8]`}>A leitura completa de vocês dois</h3>
            <ul className="mt-3 space-y-1.5 text-[15px] text-[#c3bad3]">
              <li>• A energia de cada um no amor</li>
              <li>• O que une vocês e onde se desencontram</li>
              <li>• O padrão que se repete</li>
              <li>• Como conversar com ele</li>
              <li>• Uma prática para os próximos dias</li>
            </ul>
            <p className="mt-4 text-3xl font-semibold text-[#f6e3a8]">{reais(precoCents)}</p>
            <p className="text-xs text-[#9d94b2]">Pagamento único. Você lê aqui mesmo, logo depois de pagar.</p>
            {erro && <p className="mt-3 text-sm text-[#f3a3c0]">{erro}</p>}
            <button className={`${botao} mt-5`} style={{ background: cor }} disabled={enviando} onClick={() => void pagar("pix")}>
              {enviando ? "Gerando…" : "Pagar com Pix"}
            </button>
            <button className="mt-3 w-full text-sm text-[#e2c47a] underline disabled:opacity-50" disabled={enviando} onClick={() => void pagar("cartao")}>
              Prefiro pagar com cartão
            </button>
            <p className="mt-3 text-center text-[11px] text-[#9d94b2]">No banco aparece Stripe Brasil, a empresa de pagamentos.</p>
          </div>
        </PreviaLocal>
      )}

      {fase === "pagar" && (
        <div className={CARTAO}>
          <p className={SOBRETITULO}>Quase lá</p>
          {cobranca?.forma === "pix" ? (
            <>
              <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>Pague com Pix Copia e Cola</h2>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-[15px] text-[#c3bad3]">
                <li>Toque em “Copiar código”.</li>
                <li>No app do seu banco, entre em Pix e escolha <b>Pix Copia e Cola</b>.</li>
                <li>Cole, confira {reais(precoCents)} e confirme.</li>
              </ol>
              {cobranca.qrPng ? (
                // eslint-disable-next-line @next/next/no-img-element -- QR em data URI, gerado na hora
                <img src={cobranca.qrPng} alt="QR code do Pix" className="mx-auto mt-4 h-48 w-48 rounded-xl bg-white p-2" />
              ) : null}
              <button
                className={`${botao} mt-4`}
                style={{ background: cor }}
                onClick={() => {
                  void navigator.clipboard?.writeText(cobranca.copiaECola).then(() => setCopiado(true));
                }}
              >
                {copiado ? "Código copiado ✓" : "Copiar código"}
              </button>
            </>
          ) : cobranca?.forma === "cartao" ? (
            <>
              <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>Pague no cartão</h2>
              <a className={`${botao} mt-4 block text-center`} style={{ background: cor }} href={cobranca.url} target="_blank" rel="noopener noreferrer">
                Abrir o pagamento
              </a>
            </>
          ) : (
            <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>Esperando a confirmação do pagamento</h2>
          )}
          <p className="mt-4 text-center text-sm text-[#c3bad3]">Assim que o pagamento cair, a sua leitura aparece aqui. Pode deixar esta página aberta.</p>
        </div>
      )}

      {fase === "gerando" && (
        <div className={`${CARTAO} text-center`}>
          <p className={SOBRETITULO}>Pagamento confirmado</p>
          <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>Escrevendo a leitura de vocês…</h2>
          <p className="mt-3 text-[15px] text-[#c3bad3]">Leva menos de um minuto. Não feche a página.</p>
        </div>
      )}

      {fase === "pronto" && texto && (
        <article className={CARTAO}>
          <p className={SOBRETITULO}>O Código da Conexão</p>
          {previa ? (
            <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>
              {previa.signoDela} e {previa.signoDele}
            </h2>
          ) : null}
          <div className="mt-4 space-y-4 whitespace-pre-line text-[16px] leading-relaxed text-[#f6f0e4]">{texto}</div>
          <p className="mt-6 text-xs text-[#9d94b2]">Guarde esta página: o endereço abre a sua leitura neste aparelho.</p>
        </article>
      )}
    </section>
  );
}

/** A prévia grátis, calculada no navegador pelas mesmas regras do servidor (`lib/area-do-cliente/sinastria.ts`). */
function PreviaLocal(props: { nomeDela: string; nomeDele: string; dataDela: string | null; dataDele: string | null; children: React.ReactNode }) {
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
        <p className={SOBRETITULO}>O seu resultado</p>
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
              Isso é só o começo. A leitura completa mostra o padrão que se repete entre vocês e como conversar com ele.
            </p>
          </>
        ) : (
          <p className="mt-2 text-[15px] text-[#c3bad3]">Calculando…</p>
        )}
      </div>
      {props.children}
    </>
  );
}
