"use client";
/**
 * O CHAT DA ÁREA, com cara de aplicativo de conversa: a foto e o nome de quem atende no topo ("online",
 * "digitando…"), balões com hora e os tiques de lida, separador de dia, foto, áudio com player, o Pix com
 * "Copiar código", e embaixo o campo com foto e gravação de áudio.
 *
 * A conversa é a MESMA do WhatsApp (`lib/area-do-cliente/chat.ts`): o que ela escreve aqui entra no Desk e
 * o agente responde aqui. Enquanto a aba está à vista, busca a cada 3 segundos (e marca como lido); com a
 * aba escondida ou o celular em outra tela, a cada 20.
 */
import * as React from "react";
import { EVENTO_CONVERSA_ENVIADA } from "@/lib/area-do-cliente/ritual";
import { ArrowUp, Camera, Check, CheckCheck, Copy, Mic, Square, Trash2, TriangleAlert } from "lucide-react";

import type { MensagemDoChat } from "@/lib/area-do-cliente/chat";
import { copyToClipboard } from "@/lib/clipboard";

/** Textos já traduzidos no servidor (`_textos.ts`). */
export interface TextosDoChat {
  online: string;
  digitando: string;
  escrevaAqui: string;
  enviar: string;
  gravarAudio: string;
  gravando: string;
  pararEEnviar: string;
  cancelar: string;
  mandarFoto: string;
  copiarCodigo: string;
  codigoCopiado: string;
  codigoPix: string;
  hoje: string;
  ontem: string;
  voce: string;
  semConversa: string;
  comeceAqui: string;
  naoFoiPossivel: string;
  semConexao: string;
  microfoneNegado: string;
  naoEnviada: string;
  transcricao: string;
}

const VISIVEL_MS = 3_000;
const ESCONDIDO_MS = 20_000;
const LINK = /(https?:\/\/[^\s]+)/g;

/** O texto com os links tocáveis. */
function ComLinks({ texto }: { texto: string }) {
  const partes = texto.split(LINK);
  return (
    <>
      {partes.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all text-[#9cc9ff] underline underline-offset-2">
            {p}
          </a>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
}

function Tiques({ status }: { status: MensagemDoChat["status"] }) {
  if (status === "falhou") return <TriangleAlert className="size-3.5 text-[#f3a493]" aria-hidden />;
  if (status === "enviada") return <Check className="size-3.5 opacity-70" aria-hidden />;
  return <CheckCheck className={`size-3.5 ${status === "lida" ? "text-[#53bdeb]" : "opacity-70"}`} aria-hidden />;
}

function CartaoDoPix({ codigo, tc }: { codigo: string; tc: TextosDoChat }) {
  const [copiado, setCopiado] = React.useState(false);
  return (
    <div className="mt-1.5 rounded-xl border border-white/10 bg-black/20 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#e2c47a]">{tc.codigoPix}</p>
      <p className="mt-1 line-clamp-2 break-all font-mono text-[11px] opacity-70">{codigo}</p>
      <button
        type="button"
        onClick={() => {
          void copyToClipboard(codigo).then((ok) => {
            if (!ok) return;
            setCopiado(true);
            window.setTimeout(() => setCopiado(false), 2_500);
          });
        }}
        className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#e2c47a] text-sm font-semibold text-[#1b1433] active:scale-95"
        data-testid="area-chat-copiar-pix"
      >
        {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copiado ? tc.codigoCopiado : tc.copiarCodigo}
      </button>
    </div>
  );
}

function Balao({ m, hora, tc }: { m: MensagemDoChat; hora: string; tc: TextosDoChat }) {
  const minha = m.de === "voce";
  return (
    <div className={`flex ${minha ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-2.5 py-1.5 text-[15px] leading-snug shadow-sm ${
          minha ? "rounded-tr-sm bg-[#1e3a2c] text-[#e9f7ee]" : "rounded-tl-sm border border-white/10 bg-[#1d1638] text-[#f6f0e4]"
        }`}
        data-testid={`area-chat-balao-${m.de}`}
      >
        {m.tipo === "imagem" && m.midia ? (
          <a href={m.midia} target="_blank" rel="noopener noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element -- endereço assinado do bucket, de vida curta */}
            <img src={m.midia} alt="" loading="lazy" className="mb-1 max-h-72 w-full rounded-xl object-cover" />
          </a>
        ) : null}
        {m.tipo === "video" && m.midia ? <video src={m.midia} controls preload="metadata" className="mb-1 max-h-72 w-full rounded-xl" /> : null}
        {m.tipo === "audio" && m.midia ? <audio src={m.midia} controls preload="metadata" className="my-1 h-10 w-64 max-w-full" /> : null}
        {m.tipo === "documento" && m.midia ? (
          <a href={m.midia} target="_blank" rel="noopener noreferrer" className="mb-1 block text-[#9cc9ff] underline">
            📄 {m.texto || "PDF"}
          </a>
        ) : null}
        {m.texto && m.tipo !== "documento" ? (
          <p className="whitespace-pre-line break-words">
            <ComLinks texto={m.texto} />
          </p>
        ) : null}
        {m.transcricao ? (
          <details className="mt-1 text-[13px] opacity-80">
            <summary className="cursor-pointer text-[12px] opacity-80">{tc.transcricao}</summary>
            <p className="mt-1 whitespace-pre-line">{m.transcricao}</p>
          </details>
        ) : null}
        {m.pix ? <CartaoDoPix codigo={m.pix} tc={tc} /> : null}
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] opacity-60">
          {m.status === "falhou" && minha ? tc.naoEnviada : null}
          <time dateTime={m.quando}>{hora}</time>
          {minha ? <Tiques status={m.status} /> : null}
        </span>
      </div>
    </div>
  );
}

export function ChatDaArea({
  slug,
  inicial,
  podeEscrever,
  guia,
  empresa,
  idioma,
  fuso,
  tc,
  sugestoes = [],
}: {
  slug: string;
  inicial: MensagemDoChat[];
  /** Há uma conversa (num número ligado) para a mensagem entrar. */
  podeEscrever: boolean;
  guia: { foto: string | null; nome: string | null };
  empresa: string;
  idioma: string;
  fuso: string;
  tc: TextosDoChat;
  /** Perguntas prontas para tocar e mandar ("O que está no seu coração?"), até ela escrever a primeira. */
  sugestoes?: string[];
}) {
  const [mensagens, setMensagens] = React.useState<MensagemDoChat[]>(inicial);
  const [digitando, setDigitando] = React.useState(false);
  const [agora, setAgora] = React.useState<number | null>(null);
  const [texto, setTexto] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [gravando, setGravando] = React.useState<{ desde: number } | null>(null);
  const [segundos, setSegundos] = React.useState(0);
  const raiz = React.useRef<HTMLElement>(null);
  const lista = React.useRef<HTMLDivElement>(null);
  const gravador = React.useRef<{ rec: MediaRecorder; pedacos: Blob[]; cancelado: boolean } | null>(null);
  const foto = React.useRef<HTMLInputElement>(null);
  const colado = React.useRef(true);
  const [escreveu, setEscreveu] = React.useState(false);

  const api = `/api/v1/area/publica/${slug}/chat`;

  // À vista = a aba Conversa aberta e a página na frente. É o que diz se ela está "olhando".
  const aVista = React.useCallback(() => document.visibilityState === "visible" && (raiz.current?.offsetParent ?? null) !== null, []);

  const buscar = React.useCallback(async () => {
    try {
      const res = await fetch(`${api}${aVista() ? "?visto=1" : ""}`, { credentials: "same-origin", cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { data?: { mensagens: MensagemDoChat[]; digitando: boolean } } | null;
      if (res.ok && json?.data) {
        setMensagens(json.data.mensagens);
        setDigitando(json.data.digitando);
      }
      setAgora(Date.now());
    } catch {
      // Sem rede agora: tenta de novo na próxima volta.
    }
  }, [api, aVista]);

  React.useEffect(() => {
    let vivo = true;
    let id = 0;
    const volta = async () => {
      await buscar();
      if (vivo) id = window.setTimeout(() => void volta(), aVista() ? VISIVEL_MS : ESCONDIDO_MS);
    };
    void volta();
    // Voltou para a página: busca na hora, sem esperar a volta.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void buscar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [buscar, aVista]);

  // Desce para a última mensagem quando chega uma nova — se ela não subiu para reler.
  React.useEffect(() => {
    const el = lista.current;
    if (el && colado.current) el.scrollTop = el.scrollHeight;
  }, [mensagens.length, digitando]);

  React.useEffect(() => {
    if (!gravando) return;
    const id = window.setInterval(() => setSegundos(Math.floor((Date.now() - gravando.desde) / 1000)), 250);
    return () => window.clearInterval(id);
  }, [gravando]);

  const acrescentar = (m: MensagemDoChat) => {
    colado.current = true;
    setMensagens((lista) => (lista.some((x) => x.id === m.id) ? lista : [...lista, m]));
    window.dispatchEvent(new Event(EVENTO_CONVERSA_ENVIADA));
  };

  const mandarTexto = async (pronto?: string) => {
    const corpo = (pronto ?? texto).trim();
    if (!corpo || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: corpo }),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as { data?: MensagemDoChat; error?: { message?: string } } | null;
      if (res.ok && json?.data) {
        acrescentar(json.data);
        if (pronto === undefined) setTexto("");
        setEscreveu(true);
        setDigitando(true);
      } else setErro(json?.error?.message ?? tc.naoFoiPossivel);
    } catch {
      setErro(tc.semConexao);
    }
    setEnviando(false);
  };

  const mandarArquivo = async (arquivo: Blob, nome: string) => {
    setEnviando(true);
    setErro(null);
    try {
      const form = new FormData();
      form.append("arquivo", arquivo, nome);
      const res = await fetch(`${api}/arquivo`, { method: "POST", body: form, credentials: "same-origin" });
      const json = (await res.json().catch(() => null)) as { data?: MensagemDoChat; error?: { message?: string } } | null;
      if (res.ok && json?.data) {
        acrescentar(json.data);
        setDigitando(true);
      } else setErro(json?.error?.message ?? tc.naoFoiPossivel);
    } catch {
      setErro(tc.semConexao);
    }
    setEnviando(false);
  };

  const comecarGravacao = async () => {
    setErro(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErro(tc.microfoneNegado);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // O Safari do iPhone grava em mp4; os outros, em webm.
      const tipo = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const rec = tipo ? new MediaRecorder(stream, { mimeType: tipo }) : new MediaRecorder(stream);
      const estado = { rec, pedacos: [] as Blob[], cancelado: false };
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) estado.pedacos.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setGravando(null);
        setSegundos(0);
        if (estado.cancelado || estado.pedacos.length === 0) return;
        const mime = (rec.mimeType || "audio/webm").split(";")[0]!;
        const blob = new Blob(estado.pedacos, { type: mime });
        void mandarArquivo(blob, `audio.${mime.includes("mp4") ? "m4a" : "webm"}`);
      };
      gravador.current = estado;
      rec.onstart = () => setGravando({ desde: Date.now() });
      rec.start();
    } catch {
      setErro(tc.microfoneNegado);
    }
  };

  const pararGravacao = (cancelar: boolean) => {
    const g = gravador.current;
    if (!g) return;
    g.cancelado = cancelar;
    if (g.rec.state !== "inactive") g.rec.stop();
    gravador.current = null;
  };

  const hora = (iso: string) => new Intl.DateTimeFormat(idioma, { timeZone: fuso, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const dia = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  // "Hoje"/"Ontem" pelo relógio da última busca (o render não lê o relógio); antes dela, a data por extenso.
  const hojeDia = agora === null ? null : dia(new Date(agora).toISOString());
  const ontemDia = agora === null ? null : dia(new Date(agora - 86_400_000).toISOString());
  const nomeDoDia = (iso: string) => {
    const d = dia(iso);
    if (d === hojeDia) return tc.hoje;
    if (d === ontemDia) return tc.ontem;
    return new Intl.DateTimeFormat(idioma, { timeZone: fuso, day: "2-digit", month: "long" }).format(new Date(iso));
  };

  const nome = guia.nome?.trim() || empresa;
  const mm = String(Math.floor(segundos / 60));
  const ss = String(segundos % 60).padStart(2, "0");

  return (
    <section
      ref={raiz}
      className="flex h-[calc(100dvh-6.25rem-env(safe-area-inset-bottom))] min-h-[420px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0e0a1a] shadow-xl"
      data-testid="area-chat"
    >
      {/* O topo: quem atende, como no WhatsApp. */}
      <header className="flex items-center gap-3 border-b border-white/10 bg-[#171129] px-4 py-3">
        {guia.foto ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto pública da guia
          <img src={guia.foto} alt="" className="size-10 rounded-full object-cover" />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-full bg-[#2a2148] text-lg">🌙</span>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold text-[#f6f0e4]">{nome}</p>
          <p className={`text-[12px] ${digitando ? "text-[#8fd6a8]" : "text-[#a99fc0]"}`} aria-live="polite" data-testid="area-chat-presenca">
            {digitando ? tc.digitando : tc.online}
          </p>
        </div>
      </header>

      <div
        ref={lista}
        onScroll={(e) => {
          const el = e.currentTarget;
          colado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 space-y-1.5 overflow-y-auto px-3 py-3"
        aria-live="polite"
      >
        {mensagens.length === 0 ? <p className="mx-auto mt-10 max-w-xs text-center text-sm text-[#a99fc0]">{tc.comeceAqui}</p> : null}
        {mensagens.map((m, i) => {
          const anterior = mensagens[i - 1];
          const novoDia = !anterior || dia(anterior.quando) !== dia(m.quando);
          return (
            <React.Fragment key={m.id}>
              {novoDia ? (
                <div className="flex justify-center py-2">
                  <span className="rounded-full bg-[#1d1638] px-3 py-1 text-[11px] font-medium text-[#c3bad3]">{nomeDoDia(m.quando)}</span>
                </div>
              ) : null}
              <Balao m={m} hora={hora(m.quando)} tc={tc} />
            </React.Fragment>
          );
        })}
        {digitando ? (
          <div className="flex justify-start">
            <span className="flex gap-1 rounded-2xl rounded-tl-sm border border-white/10 bg-[#1d1638] px-3 py-3" aria-label={tc.digitando}>
              {[0, 1, 2].map((n) => (
                <span key={n} className="size-1.5 animate-bounce rounded-full bg-[#c3bad3] motion-reduce:animate-none" style={{ animationDelay: `${n * 150}ms` }} />
              ))}
            </span>
          </div>
        ) : null}
      </div>

      {erro ? (
        <p role="alert" className="mx-3 mb-1 rounded-xl bg-[#f3a493]/10 px-3 py-2 text-sm text-[#f3a493]">
          {erro}
        </p>
      ) : null}

      {/* As perguntas prontas, como nos aplicativos do ramo: um toque e a conversa começa. */}
      {podeEscrever && !gravando && !escreveu && texto === "" && sugestoes.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none]" data-testid="area-chat-sugestoes">
          {sugestoes.map((s) => (
            <button
              key={s}
              type="button"
              disabled={enviando}
              onClick={() => void mandarTexto(s)}
              className="shrink-0 rounded-full border border-[#c9a54e]/35 bg-[#1d1638] px-3.5 py-2 text-[13.5px] text-[#f0dca8] active:scale-95 disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {/* O campo: texto, foto e áudio. */}
      {!podeEscrever ? (
        <p className="border-t border-white/10 px-4 py-3 text-center text-sm text-[#a99fc0]">{tc.semConversa}</p>
      ) : gravando ? (
        <div className="flex items-center gap-2 border-t border-white/10 bg-[#171129] p-2">
          <button
            type="button"
            onClick={() => pararGravacao(true)}
            aria-label={tc.cancelar}
            title={tc.cancelar}
            className="flex size-11 items-center justify-center rounded-full text-[#f3a493] hover:bg-white/5"
          >
            <Trash2 className="size-5" aria-hidden />
          </button>
          <p className="flex flex-1 items-center gap-2 text-[15px] text-[#f6f0e4]" role="status">
            <span className="size-2.5 animate-pulse rounded-full bg-[#f3533f]" aria-hidden />
            {tc.gravando} {mm}:{ss}
          </p>
          <button
            type="button"
            onClick={() => pararGravacao(false)}
            aria-label={tc.pararEEnviar}
            title={tc.pararEEnviar}
            className="flex size-11 items-center justify-center rounded-full bg-[#e2c47a] text-[#1b1433] active:scale-95"
            data-testid="area-chat-parar-audio"
          >
            <Square className="size-4" fill="currentColor" aria-hidden />
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void mandarTexto();
          }}
          className="flex items-end gap-1.5 border-t border-white/10 bg-[#171129] p-2"
        >
          <input
            ref={foto}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void mandarArquivo(f, f.name);
            }}
          />
          <button
            type="button"
            onClick={() => foto.current?.click()}
            disabled={enviando}
            aria-label={tc.mandarFoto}
            title={tc.mandarFoto}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-[#c3bad3] hover:bg-white/5 disabled:opacity-40"
          >
            <Camera className="size-5" aria-hidden />
          </button>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && texto.trim() !== "" && !enviando) {
                e.preventDefault();
                void mandarTexto();
              }
            }}
            maxLength={4000}
            rows={1}
            className="max-h-36 min-h-[2.75rem] flex-1 resize-none rounded-3xl bg-white/[0.07] px-4 py-2.5 text-base text-[#f6f0e4] outline-hidden placeholder:text-[#7d7494] [field-sizing:content]"
            placeholder={tc.escrevaAqui}
            aria-label={tc.escrevaAqui}
            data-testid="area-chat-texto"
          />
          {texto.trim() !== "" ? (
            <button
              type="submit"
              disabled={enviando}
              aria-label={tc.enviar}
              title={tc.enviar}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#e2c47a] text-[#1b1433] active:scale-95 disabled:opacity-40"
              data-testid="area-chat-enviar"
            >
              <ArrowUp className="size-5" strokeWidth={2.5} aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void comecarGravacao()}
              disabled={enviando}
              aria-label={tc.gravarAudio}
              title={tc.gravarAudio}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#e2c47a] text-[#1b1433] active:scale-95 disabled:opacity-40"
              data-testid="area-chat-gravar"
            >
              <Mic className="size-5" aria-hidden />
            </button>
          )}
        </form>
      )}
    </section>
  );
}
