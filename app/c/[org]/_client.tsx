"use client";
/**
 * As partes da área do cliente que precisam do navegador: entrar por código,
 * contar qual serviço apareceu na tela, ouvir o que a pessoa deseja e guardar
 * o e-mail dela. Sem biblioteca de formulário: são três campos.
 *
 * A aparência (paleta, cartões, botões) vem de `_tema.ts`.
 */
import * as React from "react";
import { ArrowUp, BookOpen, Cake, Check, KeyRound, Mail, MessagesSquare, Sparkles } from "lucide-react";

import { BOTAO, CAMPO, CARTAO, DETALHE, SERIF, SOBRETITULO, TEXTO_SUAVE } from "./_tema";

export { CAMPO };

/** Textos já traduzidos no servidor (`page.tsx`): o navegador do cliente não tem o provedor de idioma da equipe. */
export interface TextosDaArea {
  seuEmail: string;
  receberCodigo: string;
  enviando: string;
  codigoEnviadoAntes: string;
  codigo: string;
  entrar: string;
  entrando: string;
  usarOutroEmail: string;
  semConexao: string;
  naoFoiPossivel: string;
  desejoTitulo: string;
  desejoObrigada: string;
  desejoExemplo: string;
  enviar: string;
  guardeSeuAcesso: string;
  comSeuEmail: string;
  salvar: string;
  prontoEntreCom: string;
  faleComAGente: string;
  faleComAGenteConvite: string;
  escrevaAqui: string;
  voce: string;
  nos: string;
  enviada: string;
  conversaGuardada: string;
  conversaGuardadaConvite: string;
  verConversaInteira: string;
  mostrarMenos: string;
  revelar: string;
  cartaDoDia: string;
  seuDiario: string;
  diarioConvite: string;
  diarioExemplo: string;
  salvo: string;
  aniversarioTitulo: string;
  aniversarioConvite: string;
  aniversarioObrigada: string;
  circuloConvite: string;
  por30Dias: string;
  pagarComPix: string;
  pagarComCartao: string;
  copiarCodigo: string;
  codigoCopiado: string;
  depoisDePagar: string;
  voceEstaNoCirculo: string;
  renovar: string;
  conteudoPreparando: string;
  perguntaDoMes: string;
  perguntaExemplo: string;
  perguntar: string;
  consultando: string;
  respostaChegando: string;
  tentarDeNovo: string;
}

async function postar(url: string, corpo: unknown, tx?: TextosDaArea): Promise<{ ok: boolean; mensagem?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      credentials: "same-origin",
    });
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { ok: false, mensagem: json?.error?.message ?? tx?.naoFoiPossivel };
  } catch {
    return { ok: false, mensagem: tx?.semConexao };
  }
}

/** O título de uma seção: a linha dourada pequena e o nome com serifa. */
export function TituloDaSecao({
  sobre,
  titulo,
  icone,
  id,
}: {
  sobre?: string;
  titulo: string;
  icone?: React.ReactNode;
  id?: string;
}) {
  return (
    <div>
      {sobre ? <p className={SOBRETITULO}>{sobre}</p> : null}
      <h2 id={id} className={`${SERIF} mt-1 flex items-center gap-2 text-[22px] leading-tight text-[#241f31]`}>
        {icone ? <span className="text-[#a8842f]" aria-hidden>{icone}</span> : null}
        {titulo}
      </h2>
    </div>
  );
}

function Erro({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-3 rounded-2xl bg-[#fdf1ef] px-4 py-2.5 text-sm text-[#a5361f]">
      {children}
    </p>
  );
}

export function EntrarNaArea({ slug, cor, tx }: { slug: string; cor: string; tx: TextosDaArea }) {
  const [etapa, setEtapa] = React.useState<"email" | "codigo">("email");
  const [email, setEmail] = React.useState("");
  const [codigo, setCodigo] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);

  const pedirCodigo = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const r = await postar(`/api/v1/area/publica/${slug}/codigo`, { email }, tx);
    setEnviando(false);
    if (r.ok) setEtapa("codigo");
    else setErro(r.mensagem ?? null);
  };

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const r = await postar(`/api/v1/area/publica/${slug}/codigo/confirmar`, { email, codigo }, tx);
    setEnviando(false);
    if (r.ok) window.location.reload();
    else setErro(r.mensagem ?? null);
  };

  return (
    <div className={`${CARTAO} mt-8`}>
      {etapa === "email" ? (
        <form onSubmit={pedirCodigo} className="space-y-4" data-testid="area-entrar-email">
          <label className="block">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Mail className="size-4 text-[#a8842f]" aria-hidden />
              {tx.seuEmail}
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`mt-2 ${CAMPO}`}
              placeholder="voce@email.com"
            />
          </label>
          <button type="submit" disabled={enviando} className={`${BOTAO} w-full`} style={{ background: cor }}>
            {enviando ? tx.enviando : tx.receberCodigo}
          </button>
        </form>
      ) : (
        <form onSubmit={confirmar} className="space-y-4" data-testid="area-entrar-codigo">
          <p className={TEXTO_SUAVE}>{tx.codigoEnviadoAntes}</p>
          <p className="rounded-2xl bg-[#f6f1e6] px-4 py-2.5 text-sm font-semibold">{email}</p>
          <label className="block">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="size-4 text-[#a8842f]" aria-hidden />
              {tx.codigo}
            </span>
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              className={`mt-2 text-center text-2xl tracking-[0.5em] ${CAMPO}`}
            />
          </label>
          <button
            type="submit"
            disabled={enviando || codigo.length !== 6}
            className={`${BOTAO} w-full`}
            style={{ background: cor }}
          >
            {enviando ? tx.entrando : tx.entrar}
          </button>
          <button type="button" onClick={() => setEtapa("email")} className="w-full text-sm text-[#6f6880] underline underline-offset-4">
            {tx.usarOutroEmail}
          </button>
        </form>
      )}
      {erro ? <Erro>{erro}</Erro> : null}
    </div>
  );
}

/**
 * Conta ao painel cada serviço que APARECEU na tela (metade dele visível), uma
 * vez por serviço. "Viu e não clicou" só existe se "viu" for medido.
 */
export function VitrineObservada({ slug, children }: { slug: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const raiz = ref.current;
    if (!raiz || typeof IntersectionObserver === "undefined") return;
    const contados = new Set<string>();
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          const id = (e.target as HTMLElement).dataset.servicoId;
          if (!e.isIntersecting || !id || contados.has(id)) continue;
          contados.add(id);
          void postar(`/api/v1/area/publica/${slug}/eventos`, { tipo: "servico_visto", servico_id: id });
        }
      },
      { threshold: 0.5 },
    );
    raiz.querySelectorAll<HTMLElement>("[data-servico-id]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [slug]);
  return <div ref={ref}>{children}</div>;
}

export function DesejoDoCliente({ slug, cor, tx }: { slug: string; cor: string; tx: TextosDaArea }) {
  const [texto, setTexto] = React.useState("");
  const [estado, setEstado] = React.useState<"aberto" | "enviando" | "enviado">("aberto");
  const [erro, setErro] = React.useState<string | null>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEstado("enviando");
    setErro(null);
    const r = await postar(`/api/v1/area/publica/${slug}/eventos`, { tipo: "desejo", texto: texto.trim() }, tx);
    if (r.ok) setEstado("enviado");
    else {
      setEstado("aberto");
      setErro(r.mensagem ?? null);
    }
  };

  return (
    <section className={CARTAO} data-testid="area-desejo">
      <TituloDaSecao titulo={tx.desejoTitulo} icone={<Sparkles className="size-5" />} />
      {estado === "enviado" ? (
        <p role="status" className="mt-4 flex items-center gap-2 text-[15px] text-[#2f7a4f]">
          <Check className="size-4" aria-hidden />
          {tx.desejoObrigada}
        </p>
      ) : (
        <form onSubmit={enviar} className="mt-4 space-y-3">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={280}
            rows={3}
            required
            className={CAMPO}
            placeholder={tx.desejoExemplo}
            aria-label={tx.desejoTitulo}
          />
          <button
            type="submit"
            disabled={estado === "enviando" || texto.trim() === ""}
            className={BOTAO}
            style={{ background: cor }}
          >
            {estado === "enviando" ? tx.enviando : tx.enviar}
          </button>
          {erro ? <Erro>{erro}</Erro> : null}
        </form>
      )}
    </section>
  );
}

/** Pedido discreto: uma faixa, não um cartão gritando no meio da página. */
export function EmailDoCliente({ slug, cor, tx }: { slug: string; cor: string; tx: TextosDaArea }) {
  const [email, setEmail] = React.useState("");
  const [estado, setEstado] = React.useState<"aberto" | "enviando" | "salvo">("aberto");
  const [erro, setErro] = React.useState<string | null>(null);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEstado("enviando");
    setErro(null);
    const r = await postar(`/api/v1/area/publica/${slug}/email`, { email }, tx);
    if (r.ok) setEstado("salvo");
    else {
      setEstado("aberto");
      setErro(r.mensagem ?? null);
    }
  };

  if (estado === "salvo") {
    return (
      <p role="status" className="flex items-center gap-2 rounded-3xl border border-[#cfe6d6] bg-[#f2faf4] px-5 py-4 text-[15px] text-[#2f7a4f]">
        <Check className="size-4 shrink-0" aria-hidden />
        <span>
          {tx.prontoEntreCom} <strong>{email}</strong>
        </span>
      </p>
    );
  }
  return (
    <section className="rounded-3xl border border-dashed border-[#d8cdb6] bg-[#fbf8f1] px-5 py-5" data-testid="area-email">
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <KeyRound className="size-4 text-[#a8842f]" aria-hidden />
        {tx.guardeSeuAcesso}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-[#6f6880]">{tx.comSeuEmail}</p>
      <form onSubmit={salvar} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          aria-label={tx.seuEmail}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={CAMPO}
          placeholder="voce@email.com"
        />
        <button type="submit" disabled={estado === "enviando"} className={`${BOTAO} shrink-0`} style={{ background: cor }}>
          {estado === "enviando" ? tx.enviando : tx.salvar}
        </button>
      </form>
      {erro ? <Erro>{erro}</Erro> : null}
    </section>
  );
}

/** O verso das cartas: noite, moldura dourada e uma estrela no centro. */
function VersoDaCarta() {
  return (
    <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-[#1b1433] bg-[radial-gradient(circle_at_50%_40%,rgba(201,165,78,0.28),transparent_60%)] shadow-[0_14px_30px_-14px_rgba(20,15,38,0.8)] [backface-visibility:hidden]">
      <span className="absolute inset-2 rounded-xl border border-[#c9a54e]/60" />
      <span className="absolute inset-3.5 rounded-lg border border-[#c9a54e]/25" />
      <Sparkles className="size-9 text-[#e2c47a]" strokeWidth={1.25} aria-hidden />
    </span>
  );
}

/**
 * A carta do dia começa virada para baixo: o gesto de revelar é o que faz a
 * pessoa voltar amanhã. A revelação conta no painel uma vez por dia.
 */
export function CartaDoDia({
  slug,
  cor,
  tx,
  cartaId,
  nome,
  mensagem,
  foto,
}: {
  slug: string;
  cor: string;
  tx: TextosDaArea;
  cartaId: number;
  nome: string;
  mensagem: string;
  foto: string | null;
}) {
  const [revelada, setRevelada] = React.useState(false);
  const revelar = () => {
    if (revelada) return;
    setRevelada(true);
    void postar(`/api/v1/area/publica/${slug}/eventos`, { tipo: "carta_do_dia", carta: cartaId }, tx);
  };
  return (
    <section className={CARTAO} data-testid="area-carta-do-dia">
      <TituloDaSecao titulo={tx.cartaDoDia} />
      <div className="mt-5 flex items-start gap-5">
        <button
          type="button"
          onClick={revelar}
          disabled={revelada}
          aria-label={tx.revelar}
          data-testid="area-revelar-carta"
          className="relative aspect-[3/5] w-28 shrink-0 [perspective:900px] focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-default sm:w-32"
          style={{ outlineColor: cor }}
        >
          <span
            className={`absolute inset-0 transition-transform duration-700 ease-out [transform-style:preserve-3d] motion-reduce:transition-none ${
              revelada ? "[transform:rotateY(180deg)]" : ""
            }`}
          >
            <VersoDaCarta />
            <span className="absolute inset-0 overflow-hidden rounded-2xl bg-[#1b1433] shadow-[0_14px_30px_-14px_rgba(20,15,38,0.8)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
              {foto ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, sem otimizador
                <img src={foto} alt={nome} className="size-full object-cover" />
              ) : (
                <span className={`${SERIF} flex size-full items-center justify-center p-3 text-center text-lg text-[#f6f0e4]`}>{nome}</span>
              )}
            </span>
          </span>
        </button>
        <div className="min-w-0 pt-1" aria-live="polite">
          {revelada ? (
            <>
              <p className={`${SERIF} text-xl leading-snug`} data-testid="area-carta-nome">
                {nome}
              </p>
              <p className={`mt-2 ${TEXTO_SUAVE}`}>{mensagem}</p>
            </>
          ) : (
            <p className={TEXTO_SUAVE}>{tx.revelar}</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function DiarioDoCliente({
  slug,
  cor,
  tx,
  entradas,
}: {
  slug: string;
  cor: string;
  tx: TextosDaArea;
  entradas: Array<{ id: string; texto: string; quando: string }>;
}) {
  const [lista, setLista] = React.useState(entradas);
  const [texto, setTexto] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/v1/area/publica/${slug}/diario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.trim() }),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as { data?: { id: string; texto: string }; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) {
        setErro(json?.error?.message ?? tx.naoFoiPossivel);
      } else {
        setLista((l) => [{ id: json.data!.id, texto: json.data!.texto, quando: "" }, ...l].slice(0, 10));
        setTexto("");
      }
    } catch {
      setErro(tx.semConexao);
    }
    setEnviando(false);
  };

  return (
    <section className={CARTAO} data-testid="area-diario">
      <TituloDaSecao titulo={tx.seuDiario} icone={<BookOpen className="size-5" />} />
      <p className={`mt-2 ${TEXTO_SUAVE}`}>{tx.diarioConvite}</p>
      <form onSubmit={salvar} className="mt-4 space-y-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={2000}
          rows={4}
          required
          className={`${CAMPO} bg-[repeating-linear-gradient(transparent,transparent_31px,#efe7d6_31px,#efe7d6_32px)] [background-position:0_12px] leading-8`}
          placeholder={tx.diarioExemplo}
          aria-label={tx.seuDiario}
        />
        <button type="submit" disabled={enviando || texto.trim() === ""} className={BOTAO} style={{ background: cor }}>
          {enviando ? tx.enviando : tx.salvar}
        </button>
        {erro ? <Erro>{erro}</Erro> : null}
      </form>
      {lista.length > 0 ? (
        <ul className="mt-5 space-y-4 border-t border-[#efe7d6] pt-4">
          {lista.map((d) => (
            <li key={d.id} className="border-l-2 border-[#e2c47a] pl-4">
              {d.quando ? <span className={`block ${DETALHE}`}>{d.quando}</span> : null}
              <span className={`${SERIF} mt-0.5 block whitespace-pre-line text-[16px] leading-relaxed text-[#3a3347]`}>{d.texto}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function AniversarioDoCliente({ slug, cor, tx }: { slug: string; cor: string; tx: TextosDaArea }) {
  const [data, setData] = React.useState("");
  const [estado, setEstado] = React.useState<"aberto" | "enviando" | "salvo">("aberto");
  const [erro, setErro] = React.useState<string | null>(null);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEstado("enviando");
    setErro(null);
    const r = await postar(`/api/v1/area/publica/${slug}/aniversario`, { data }, tx);
    if (r.ok) setEstado("salvo");
    else {
      setEstado("aberto");
      setErro(r.mensagem ?? null);
    }
  };

  if (estado === "salvo") {
    return (
      <p role="status" className="flex items-center gap-2 rounded-3xl border border-[#cfe6d6] bg-[#f2faf4] px-5 py-4 text-[15px] text-[#2f7a4f]">
        <Check className="size-4 shrink-0" aria-hidden />
        {tx.aniversarioObrigada}
      </p>
    );
  }
  return (
    <section className={CARTAO} data-testid="area-aniversario">
      <TituloDaSecao titulo={tx.aniversarioTitulo.replace(/\s*🎂\s*$/u, "")} icone={<Cake className="size-5" />} />
      <p className={`mt-2 ${TEXTO_SUAVE}`}>{tx.aniversarioConvite}</p>
      <form onSubmit={salvar} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input type="date" required value={data} onChange={(e) => setData(e.target.value)} className={CAMPO} aria-label={tx.aniversarioTitulo} />
        <button type="submit" disabled={estado === "enviando" || data === ""} className={`${BOTAO} shrink-0`} style={{ background: cor }}>
          {tx.salvar}
        </button>
      </form>
      {erro ? <Erro>{erro}</Erro> : null}
    </section>
  );
}

type MensagemDaTela = { id: string; autor: "cliente" | "equipe"; texto: string; quando: string };

/**
 * "Fale com a gente" de dentro da área: a pessoa escreve, a equipe responde no
 * painel, e a resposta aparece aqui. Enquanto a página está aberta, as
 * respostas são buscadas a cada 20 segundos.
 */
export function FaleComAGente({
  slug,
  cor,
  tx,
  inicial,
  idioma = "pt-BR",
  fuso = "UTC",
}: {
  slug: string;
  cor: string;
  tx: TextosDaArea;
  inicial: MensagemDaTela[];
  idioma?: string;
  fuso?: string;
}) {
  const [mensagens, setMensagens] = React.useState(inicial);
  const [texto, setTexto] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviada, setEnviada] = React.useState(false);
  const lista = React.useRef<HTMLUListElement>(null);

  React.useEffect(() => {
    let vivo = true;
    const buscar = async () => {
      try {
        const res = await fetch(`/api/v1/area/publica/${slug}/mensagens`, { credentials: "same-origin", cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { data?: MensagemDaTela[] } | null;
        if (vivo && res.ok && json?.data) setMensagens(json.data);
      } catch {
        // Sem rede agora: tenta de novo na próxima volta.
      }
    };
    const id = window.setInterval(() => void buscar(), 20_000);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, [slug]);

  // A conversa abre na última mensagem, como em qualquer aplicativo de conversa.
  React.useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensagens.length]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    setEnviada(false);
    try {
      const res = await fetch(`/api/v1/area/publica/${slug}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.trim() }),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as { data?: MensagemDaTela; error?: { message?: string } } | null;
      if (res.ok && json?.data) {
        setMensagens((m) => [...m, json.data as MensagemDaTela]);
        setTexto("");
        setEnviada(true);
      } else setErro(json?.error?.message ?? tx.naoFoiPossivel);
    } catch {
      setErro(tx.semConexao);
    }
    setEnviando(false);
  };

  return (
    <section className={CARTAO} data-testid="area-fale-com-a-gente">
      <TituloDaSecao titulo={tx.faleComAGente} icone={<MessagesSquare className="size-5" />} />
      <p className={`mt-2 ${TEXTO_SUAVE}`}>{tx.faleComAGenteConvite}</p>
      {mensagens.length > 0 ? (
        <ul
          ref={lista}
          className="mt-4 max-h-80 space-y-2 overflow-y-auto rounded-2xl bg-[#f8f4ec] p-3"
          aria-label={tx.conversaGuardada}
        >
          {mensagens.map((m) => (
            <li key={m.id} className={m.autor === "cliente" ? "flex justify-end" : "flex justify-start"}>
              <span
                className={
                  m.autor === "cliente"
                    ? "max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md px-3.5 py-2 text-[15px] text-white shadow-sm"
                    : "max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-md border border-[#ebe3d3] bg-white px-3.5 py-2 text-[15px] shadow-sm"
                }
                style={m.autor === "cliente" ? { background: cor } : undefined}
              >
                <span className="mb-0.5 block text-[11px] font-semibold opacity-70">{m.autor === "cliente" ? tx.voce : tx.nos}</span>
                {m.texto}
                <time dateTime={m.quando} className="mt-1 block text-right text-[11px] opacity-70">
                  {new Intl.DateTimeFormat(idioma, { timeZone: fuso, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(m.quando))}
                </time>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={enviar} className="mt-4">
        <div className="flex items-end gap-2 rounded-3xl border border-[#e4dccb] bg-[#fdfbf7] p-1.5 pl-4 transition focus-within:border-[#a8842f] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#c9a54e]/15">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && texto.trim() !== "" && !enviando) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            maxLength={2000}
            rows={1}
            required
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent py-2.5 text-base text-[#241f31] placeholder:text-[#a59eb0] outline-hidden [field-sizing:content]"
            placeholder={tx.escrevaAqui}
            aria-label={tx.escrevaAqui}
            data-testid="area-fale-texto"
          />
          <button
            type="submit"
            disabled={enviando || texto.trim() === ""}
            aria-label={tx.enviar}
            title={tx.enviar}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-white transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none"
            style={{ background: cor }}
          >
            <ArrowUp className="size-5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
        {enviando ? <p className={`mt-2 ${DETALHE}`}>{tx.enviando}</p> : null}
        {enviada ? (
          <p role="status" className="mt-2 text-sm text-[#2f7a4f]">
            {tx.enviada}
          </p>
        ) : null}
        {erro ? <Erro>{erro}</Erro> : null}
      </form>
    </section>
  );
}

/**
 * A conversa de WhatsApp com a empresa, só para ler. Começa mostrando as
 * últimas falas; "Ver a conversa inteira" abre o resto.
 */
const FALAS_INICIAIS = 6;

export function ConversaGuardada({
  tx,
  empresa,
  falas,
}: {
  tx: TextosDaArea;
  empresa: string;
  falas: Array<{ id: string; de: "voce" | "empresa"; texto: string; quando: string }>;
}) {
  const [inteira, setInteira] = React.useState(false);
  const visiveis = inteira ? falas : falas.slice(-FALAS_INICIAIS);
  return (
    <section className={CARTAO} data-testid="area-conversa">
      <TituloDaSecao titulo={tx.conversaGuardada} />
      <p className={`mt-2 ${TEXTO_SUAVE}`}>{tx.conversaGuardadaConvite}</p>
      <div className="relative mt-4">
        <ul
          className={`space-y-2 rounded-2xl bg-[#f8f4ec] p-3 ${inteira ? "max-h-[70vh] overflow-y-auto" : ""}`}
        >
          {visiveis.map((f, i) => {
            const anterior = visiveis[i - 1];
            const mesmoAutor = anterior?.de === f.de;
            return (
              <li key={f.id} className={`${f.de === "voce" ? "flex justify-end" : "flex justify-start"} ${mesmoAutor ? "" : "pt-1"}`}>
                <span
                  className={
                    f.de === "voce"
                      ? "max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-[#e9f6dd] px-3.5 py-2 text-[15px] leading-relaxed text-[#203018]"
                      : "max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-md border border-[#ebe3d3] bg-white px-3.5 py-2 text-[15px] leading-relaxed"
                  }
                >
                  {mesmoAutor ? null : (
                    <span className={`mb-0.5 block text-[11px] font-semibold ${f.de === "voce" ? "text-[#4f7a3a]" : "text-[#a8842f]"}`}>
                      {f.de === "voce" ? tx.voce : empresa} <span className="font-normal opacity-70">· {f.quando}</span>
                    </span>
                  )}
                  {f.texto}
                </span>
              </li>
            );
          })}
        </ul>
        {!inteira && falas.length > FALAS_INICIAIS ? (
          <span className="pointer-events-none absolute inset-x-0 top-0 h-12 rounded-t-2xl bg-gradient-to-b from-[#f8f4ec] to-transparent" />
        ) : null}
      </div>
      {falas.length > FALAS_INICIAIS ? (
        <button
          type="button"
          onClick={() => setInteira((v) => !v)}
          className="mt-3 text-sm font-semibold text-[#8a6b22] underline decoration-[#e2c47a] decoration-2 underline-offset-4"
        >
          {inteira ? tx.mostrarMenos : `${tx.verConversaInteira} (${falas.length})`}
        </button>
      ) : null}
    </section>
  );
}
