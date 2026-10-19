"use client";
/**
 * O APP E O AVISO DIÁRIO na área do cliente: instalar a área no celular (ícone na tela de início) e ligar
 * UM aviso por dia — "a sua carta de hoje abriu" — na hora da empresa.
 *
 * Cada aparelho tem o seu caminho:
 *  - Android/computador: o navegador oferece instalar (`beforeinstallprompt`) e o aviso liga aqui mesmo;
 *  - iPhone: o aviso só existe com a área instalada (iOS 16.4+). Fora do app, a tela ensina a instalar
 *    pelo Compartilhar › Adicionar à Tela de Início; aberta pelo ícone, liga o aviso normalmente.
 *
 * Convida, nunca cobra: "Agora não" esconde o cartão neste aparelho, e desligar é um toque.
 *
 * E convida DEPOIS do valor: na primeira visita o cartão não aparece; aparece a partir do segundo dia
 * (`convidarJa`, decidido no servidor) ou logo depois de a pessoa revelar a carta ou terminar uma leitura
 * (`EVENTO_DE_VALOR`). No iPhone, a instrução de instalar só aparece quando ela toca em "Quero receber".
 */
import * as React from "react";

import { Bell, BellOff, Download, Share } from "lucide-react";

import { EVENTO_DE_VALOR } from "@/lib/area-do-cliente/avisos";

import { CARTAO_NOTURNO, SOBRETITULO_NOTURNO } from "./_tema";

export interface TextosDoAviso {
  titulo: string;
  gostou: string;
  convite: string;
  queroReceber: string;
  contencao: string;
  ativar: string;
  ativando: string;
  instalar: string;
  agoraNao: string;
  ligado: string;
  desligar: string;
  bloqueado: string;
  iphone: string;
  falhou: string;
}

type Estado = "carregando" | "disponivel" | "ligado" | "iphone_instalar" | "bloqueado" | "sem_suporte";

function chaveEmBytes(base64: string): Uint8Array {
  const preenchida = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(preenchida);
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

interface PedidoDeInstalacao extends Event {
  prompt: () => Promise<void>;
}

const OCULTO = (slug: string) => `area-aviso-oculto:${slug}`;

export function AvisoDiario({ slug, ta, hora, convidarJa }: { slug: string; ta: TextosDoAviso; hora: number; convidarJa: boolean }) {
  const [estado, setEstado] = React.useState<Estado>("carregando");
  const [convidar, setConvidar] = React.useState(convidarJa);
  const [acabouDeVer, setAcabouDeVer] = React.useState(false);
  const [mostrarComoInstalar, setMostrarComoInstalar] = React.useState(false);
  const [oculto, setOculto] = React.useState(false);
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState(false);
  const [instalacao, setInstalacao] = React.useState<PedidoDeInstalacao | null>(null);
  const escopo = `/c/${slug}/`;
  const api = `/api/v1/area/publica/${slug}/avisos`;

  React.useEffect(() => {
    try {
      setOculto(window.localStorage.getItem(OCULTO(slug)) === "1");
    } catch {
      // sem armazenamento: o cartão aparece
    }
    const guardar = (e: Event) => {
      e.preventDefault();
      setInstalacao(e as PedidoDeInstalacao);
    };
    window.addEventListener("beforeinstallprompt", guardar);
    const viuValor = () => {
      setConvidar(true);
      setAcabouDeVer(true);
    };
    window.addEventListener(EVENTO_DE_VALOR, viuValor);
    void (async () => {
      const suporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const ehIphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const instalado =
        window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!suporta) return setEstado(ehIphone && !instalado ? "iphone_instalar" : "sem_suporte");
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const registro = await navigator.serviceWorker.getRegistration(escopo).catch(() => undefined);
      const inscricao = await registro?.pushManager.getSubscription().catch(() => null);
      setEstado(inscricao ? "ligado" : "disponivel");
    })();
    return () => {
      window.removeEventListener("beforeinstallprompt", guardar);
      window.removeEventListener(EVENTO_DE_VALOR, viuValor);
    };
  }, [slug, escopo]);

  const ativar = async () => {
    setOcupado(true);
    setErro(false);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "disponivel");
        return;
      }
      const registro = await navigator.serviceWorker.register("/area-sw.js", { scope: escopo });
      await navigator.serviceWorker.ready;
      const r = await fetch(api, { credentials: "same-origin" });
      const j = (await r.json()) as { data?: { chave: string } };
      if (!j.data?.chave) throw new Error("sem chave");
      const inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveEmBytes(j.data.chave) as BufferSource,
      });
      const salvo = await fetch(api, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inscricao.toJSON()),
      });
      if (!salvo.ok) throw new Error(`http_${salvo.status}`);
      setEstado("ligado");
    } catch {
      setErro(true);
    } finally {
      setOcupado(false);
    }
  };

  const desligar = async () => {
    setOcupado(true);
    try {
      const registro = await navigator.serviceWorker.getRegistration(escopo);
      const inscricao = await registro?.pushManager.getSubscription();
      if (inscricao) {
        await fetch(api, {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: inscricao.endpoint }),
        });
        await inscricao.unsubscribe();
      }
      setEstado("disponivel");
    } finally {
      setOcupado(false);
    }
  };

  const esconder = () => {
    setOculto(true);
    try {
      window.localStorage.setItem(OCULTO(slug), "1");
    } catch {
      // sem armazenamento: some só nesta visita
    }
  };

  if (estado === "carregando" || estado === "sem_suporte") return null;
  if (estado === "ligado") {
    return (
      <p className="flex items-center justify-center gap-2 text-xs text-[#8b8497]" data-testid="aviso-ligado">
        <Bell className="size-3.5" aria-hidden />
        {ta.ligado.replace("{hora}", `${hora}h`)} ·{" "}
        <button type="button" onClick={() => void desligar()} disabled={ocupado} className="underline underline-offset-4">
          {ta.desligar}
        </button>
      </p>
    );
  }
  if (oculto || !convidar) return null;

  return (
    <section className={`${CARTAO_NOTURNO} p-5`} data-testid="aviso-convite">
      <p className={SOBRETITULO_NOTURNO}>✦ {ta.titulo}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-[#ece4f7]">
        {acabouDeVer ? `${ta.gostou} ` : ""}
        {ta.convite.replace("{hora}", `${hora}h`)}
      </p>
      <p className="mt-1 text-xs text-[#b7aecb]">{ta.contencao}</p>
      {estado === "iphone_instalar" ? (
        mostrarComoInstalar ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-white/5 p-3 text-sm text-[#e7def3]">
            <Share className="mt-0.5 size-4 shrink-0 text-[#e2c47a]" aria-hidden />
            {ta.iphone}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setMostrarComoInstalar(true)}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-[#c9a54e] px-5 text-sm font-semibold text-[#1b1433]"
          >
            <Bell className="size-4" aria-hidden />
            {ta.queroReceber}
          </button>
        )
      ) : estado === "bloqueado" ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-white/5 p-3 text-sm text-[#e7def3]">
          <BellOff className="mt-0.5 size-4 shrink-0 text-[#e2c47a]" aria-hidden />
          {ta.bloqueado}
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void ativar()}
            disabled={ocupado}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#c9a54e] px-5 text-sm font-semibold text-[#1b1433] transition active:scale-[0.98] disabled:opacity-60"
            data-testid="aviso-ativar"
          >
            <Bell className="size-4" aria-hidden />
            {ocupado ? ta.ativando : ta.ativar}
          </button>
          {instalacao ? (
            <button
              type="button"
              onClick={() => void instalacao.prompt().then(() => setInstalacao(null))}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[#c9a54e]/60 px-5 text-sm font-semibold text-[#f0dca8]"
            >
              <Download className="size-4" aria-hidden />
              {ta.instalar}
            </button>
          ) : null}
        </div>
      )}
      {erro ? (
        <p role="alert" className="mt-2 text-sm text-[#f3b2a4]">
          {ta.falhou}
        </p>
      ) : null}
      <button type="button" onClick={esconder} className="mt-3 text-xs text-[#b7aecb] underline underline-offset-4">
        {ta.agoraNao}
      </button>
    </section>
  );
}
