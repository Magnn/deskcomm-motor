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

const CAMPO =
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
