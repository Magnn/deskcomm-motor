"use client";
/**
 * As partes da área do cliente que precisam do navegador: entrar por código,
 * contar qual serviço apareceu na tela, ouvir o que a pessoa deseja e guardar
 * o e-mail dela. Sem biblioteca de formulário: são três campos.
 */
import * as React from "react";

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

export const CAMPO =
  "w-full rounded-xl border border-[#d9dce3] bg-white px-4 py-3 text-base outline-hidden focus:border-[#7c3aed] focus:ring-2 focus:ring-[#7c3aed]/20";

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
    <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
      {etapa === "email" ? (
        <form onSubmit={pedirCodigo} className="space-y-4" data-testid="area-entrar-email">
          <label className="block">
            <span className="text-sm font-medium">{tx.seuEmail}</span>
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`mt-1 ${CAMPO}`}
              placeholder="voce@email.com"
            />
          </label>
          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-xl py-3 font-semibold text-white disabled:opacity-60"
            style={{ background: cor }}
          >
            {enviando ? tx.enviando : tx.receberCodigo}
          </button>
        </form>
      ) : (
        <form onSubmit={confirmar} className="space-y-4" data-testid="area-entrar-codigo">
          <p className="text-sm text-[#4b5563]">{tx.codigoEnviadoAntes}</p>
          <p className="text-sm font-medium">{email}</p>
          <label className="block">
            <span className="text-sm font-medium">{tx.codigo}</span>
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              className={`mt-1 tracking-[0.4em] ${CAMPO}`}
            />
          </label>
          <button
            type="submit"
            disabled={enviando || codigo.length !== 6}
            className="w-full rounded-xl py-3 font-semibold text-white disabled:opacity-60"
            style={{ background: cor }}
          >
            {enviando ? tx.entrando : tx.entrar}
          </button>
          <button type="button" onClick={() => setEtapa("email")} className="w-full text-sm text-[#6b7280] underline">
            {tx.usarOutroEmail}
          </button>
        </form>
      )}
      {erro ? (
        <p className="mt-3 text-sm text-[#b91c1c]" role="alert">
          {erro}
        </p>
      ) : null}
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
    <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="area-desejo">
      <h2 className="text-base font-semibold">{tx.desejoTitulo}</h2>
      {estado === "enviado" ? (
        <p className="mt-2 text-sm text-[#15803d]">{tx.desejoObrigada}</p>
      ) : (
        <form onSubmit={enviar} className="mt-3 space-y-3">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={280}
            rows={3}
            required
            className={CAMPO}
            placeholder={tx.desejoExemplo}
          />
          <button
            type="submit"
            disabled={estado === "enviando" || texto.trim() === ""}
            className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: cor }}
          >
            {estado === "enviando" ? tx.enviando : tx.enviar}
          </button>
          {erro ? <p className="text-sm text-[#b91c1c]">{erro}</p> : null}
        </form>
      )}
    </section>
  );
}

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
      <p className="rounded-2xl bg-white p-5 text-sm text-[#15803d] shadow-sm">
        {tx.prontoEntreCom} <strong>{email}</strong>
      </p>
    );
  }
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="area-email">
      <h2 className="text-base font-semibold">{tx.guardeSeuAcesso}</h2>
      <p className="mt-1 text-sm text-[#4b5563]">{tx.comSeuEmail}</p>
      <form onSubmit={salvar} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={CAMPO}
          placeholder="voce@email.com"
        />
        <button
          type="submit"
          disabled={estado === "enviando"}
          className="shrink-0 rounded-xl px-4 py-3 font-semibold text-white disabled:opacity-60"
          style={{ background: cor }}
        >
          {tx.salvar}
        </button>
      </form>
      {erro ? <p className="mt-2 text-sm text-[#b91c1c]">{erro}</p> : null}
    </section>
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
    setRevelada(true);
    void postar(`/api/v1/area/publica/${slug}/eventos`, { tipo: "carta_do_dia", carta: cartaId }, tx);
  };
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="area-carta-do-dia">
      <h2 className="text-base font-semibold">{tx.cartaDoDia}</h2>
      {revelada ? (
        <div className="mt-3 flex gap-4">
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, sem otimizador
            <img src={foto} alt={nome} className="aspect-[3/5] w-24 shrink-0 rounded-lg object-cover" />
          ) : null}
          <div className="min-w-0">
            <p className="font-semibold" data-testid="area-carta-nome">
              {nome}
            </p>
            <p className="mt-1 text-sm text-[#4b5563]">{mensagem}</p>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={revelar}
          className="mt-3 flex aspect-[3/5] w-24 items-center justify-center rounded-lg text-3xl text-white shadow-md"
          style={{ background: cor }}
          aria-label={tx.revelar}
          data-testid="area-revelar-carta"
        >
          ✦
        </button>
      )}
      {!revelada ? <p className="mt-2 text-xs text-[#6b7280]">{tx.revelar}</p> : null}
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
    <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="area-diario">
      <h2 className="text-base font-semibold">{tx.seuDiario}</h2>
      <p className="mt-1 text-sm text-[#4b5563]">{tx.diarioConvite}</p>
      <form onSubmit={salvar} className="mt-3 space-y-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={2000}
          rows={3}
          required
          className={CAMPO}
          placeholder={tx.diarioExemplo}
        />
        <button
          type="submit"
          disabled={enviando || texto.trim() === ""}
          className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: cor }}
        >
          {enviando ? tx.enviando : tx.salvar}
        </button>
        {erro ? <p className="text-sm text-[#b91c1c]">{erro}</p> : null}
      </form>
      {lista.length > 0 ? (
        <ul className="mt-4 space-y-3 border-t border-[#eef0f3] pt-3">
          {lista.map((d) => (
            <li key={d.id} className="text-sm">
              {d.quando ? <span className="block text-xs text-[#9ca3af]">{d.quando}</span> : null}
              <span className="whitespace-pre-line">{d.texto}</span>
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
    return <p className="rounded-2xl bg-white p-5 text-sm text-[#15803d] shadow-sm">{tx.aniversarioObrigada}</p>;
  }
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="area-aniversario">
      <h2 className="text-base font-semibold">{tx.aniversarioTitulo}</h2>
      <p className="mt-1 text-sm text-[#4b5563]">{tx.aniversarioConvite}</p>
      <form onSubmit={salvar} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input type="date" required value={data} onChange={(e) => setData(e.target.value)} className={CAMPO} />
        <button
          type="submit"
          disabled={estado === "enviando" || data === ""}
          className="shrink-0 rounded-xl px-4 py-3 font-semibold text-white disabled:opacity-60"
          style={{ background: cor }}
        >
          {tx.salvar}
        </button>
      </form>
      {erro ? <p className="mt-2 text-sm text-[#b91c1c]">{erro}</p> : null}
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
}: {
  slug: string;
  cor: string;
  tx: TextosDaArea;
  inicial: MensagemDaTela[];
}) {
  const [mensagens, setMensagens] = React.useState(inicial);
  const [texto, setTexto] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

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

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
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
      } else setErro(json?.error?.message ?? tx.naoFoiPossivel);
    } catch {
      setErro(tx.semConexao);
    }
    setEnviando(false);
  };

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="area-fale-com-a-gente">
      <h2 className="text-base font-semibold">💬 {tx.faleComAGente}</h2>
      <p className="mt-1 text-sm text-[#4b5563]">{tx.faleComAGenteConvite}</p>
      {mensagens.length > 0 ? (
        <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {mensagens.map((m) => (
            <li key={m.id} className={m.autor === "cliente" ? "flex justify-end" : "flex justify-start"}>
              <span
                className={
                  m.autor === "cliente"
                    ? "max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-sm px-3 py-2 text-sm text-white"
                    : "max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-sm bg-[#f3f4f6] px-3 py-2 text-sm"
                }
                style={m.autor === "cliente" ? { background: cor } : undefined}
              >
                <span className="mb-0.5 block text-[10px] opacity-70">{m.autor === "cliente" ? tx.voce : tx.nos}</span>
                {m.texto}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={enviar} className="mt-3 space-y-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={2000}
          rows={2}
          required
          className={CAMPO}
          placeholder={tx.escrevaAqui}
          data-testid="area-fale-texto"
        />
        <button
          type="submit"
          disabled={enviando || texto.trim() === ""}
          className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: cor }}
        >
          {enviando ? tx.enviando : tx.enviar}
        </button>
        {erro ? <p className="text-sm text-[#b91c1c]">{erro}</p> : null}
      </form>
    </section>
  );
}

/**
 * A conversa de WhatsApp com a empresa, só para ler. Começa mostrando as
 * últimas falas; "Ver a conversa inteira" abre o resto.
 */
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
  const visiveis = inteira ? falas : falas.slice(-12);
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="area-conversa">
      <h2 className="text-base font-semibold">{tx.conversaGuardada}</h2>
      <p className="mt-1 text-sm text-[#4b5563]">{tx.conversaGuardadaConvite}</p>
      <ul className={inteira ? "mt-3 max-h-[70vh] space-y-2 overflow-y-auto" : "mt-3 space-y-2"}>
        {visiveis.map((f) => (
          <li key={f.id} className={f.de === "voce" ? "flex justify-end" : "flex justify-start"}>
            <span
              className={
                f.de === "voce"
                  ? "max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-sm bg-[#dcf8c6] px-3 py-2 text-sm"
                  : "max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-sm bg-[#f3f4f6] px-3 py-2 text-sm"
              }
            >
              <span className="mb-0.5 block text-[10px] text-[#6b7280]">
                {f.de === "voce" ? tx.voce : empresa} · {f.quando}
              </span>
              {f.texto}
            </span>
          </li>
        ))}
      </ul>
      {falas.length > 12 ? (
        <button type="button" onClick={() => setInteira((v) => !v)} className="mt-3 text-sm underline">
          {inteira ? tx.mostrarMenos : `${tx.verConversaInteira} (${falas.length})`}
        </button>
      ) : null}
    </section>
  );
}
