"use client";
import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useChannelSessions } from "@/hooks/channels/useChannelSessions";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { resumoDosCanais, type ContagemDoCanal } from "@/lib/channels/resumo";
import {
  Browsers,
  CaretRight,
  InstagramLogo,
  MessengerLogo,
  Phone,
  PinterestLogo,
  Storefront,
  TelegramLogo,
  TiktokLogo,
  WhatsappLogo,
} from "@/lib/ui/icons";

/**
 * Conexões › visão geral — a porta de entrada para quem VENDE, não para quem programa.
 *
 * A pergunta da tela é "por onde seus clientes falam com você?". Antes eram onze abas
 * com nomes de bastidor ("Provedor parceiro", "API Oficial (Meta)") e o botão de
 * conectar WhatsApp aparecia até dentro do Telegram. Agora: o WhatsApp em destaque,
 * com o botão só nele; os outros canais em cartões com o estado em palavras comuns;
 * o que é técnico guardado em "Opções avançadas". As telas de cada canal são as
 * mesmas de antes, abertas por `?aba=` (links salvos continuam valendo).
 */
type Estado = "ok" | "atencao" | "off";

function estadoDe(c: ContagemDoCanal | undefined): Estado {
  if (!c || c.total === 0) return "off";
  return c.precisaDeAtencao > 0 ? "atencao" : "ok";
}

function Selo({ estado, children }: { estado: Estado; children: ReactNode }) {
  const cor =
    estado === "ok" ? "text-success" : estado === "atencao" ? "text-warning" : "text-text-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${cor}`}>
      {estado !== "off" && (
        <span aria-hidden className={`h-2 w-2 rounded-full ${estado === "ok" ? "bg-success" : "bg-warning"}`} />
      )}
      {children}
    </span>
  );
}

interface CartaoProps {
  href: string;
  icone: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  nome: string;
  descricao: string;
  estado: Estado;
  /** Ausente = o canal não tem estado medido: o cartão mostra só a ação "Configurar". */
  rotuloDoEstado?: string;
  testId: string;
}

function CartaoDeCanal({ href, icone: Icone, nome, descricao, estado, rotuloDoEstado, testId }: CartaoProps) {
  const t = useT();
  return (
    <Link
      href={href}
      scroll={false}
      data-testid={testId}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-surface-elevated text-primary">
          <Icone size={22} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-base font-semibold text-text">{nome}</span>
          <span className="text-sm text-text-muted">{descricao}</span>
        </span>
      </span>
      <span className="mt-auto flex items-center justify-between gap-2">
        {rotuloDoEstado ? <Selo estado={estado}>{rotuloDoEstado}</Selo> : <span aria-hidden />}
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
          {!rotuloDoEstado ? t("Configurar") : estado === "off" ? t("Conectar") : t("Abrir")}
          <CaretRight size={14} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </Link>
  );
}

type ContasSociais = { accounts: { platform: string; active: boolean }[] };

export function CanaisVisaoGeral({
  botaoDeConectar,
  avancadas,
}: {
  /** O "Conectar WhatsApp" de sempre (a janela que explica QR x oficial) — mora SÓ no cartão do WhatsApp. */
  botaoDeConectar: ReactNode;
  /** Os jeitos técnicos de ligar número que a instalação oferece, em "Opções avançadas". */
  avancadas: { aba: string; nome: string; descricao: string }[];
}) {
  const t = useT();
  const sessoes = useChannelSessions();
  const resumo = resumoDosCanais(sessoes.data ?? []);
  // Mesma chave da aba de redes sociais: o cache é um só, e abrir a aba não busca de novo.
  const sociais = useQuery({
    queryKey: ["social-connections"],
    queryFn: async () => (await apiClient.get<{ data: ContasSociais }>("/api/v1/channels/social")).data,
    retry: false,
  });
  const redeLigada = (rede: string): Estado =>
    sociais.data?.accounts.some((a) => a.platform === rede && a.active) ? "ok" : "off";

  const wa = resumo.whatsapp;
  const estadoWa = estadoDe(wa);
  const rotulo = (c: ContagemDoCanal, umOk: string, variosOk: string): string => {
    if (c.precisaDeAtencao > 0) return t("Precisa de você");
    return c.funcionando === 1 ? umOk : `${c.funcionando} ${variosOk}`;
  };
  const rotuloDe = (c: ContagemDoCanal): string =>
    estadoDe(c) === "off" ? t("Não conectado") : rotulo(c, t("Funcionando"), t("conectados"));

  return (
    <div className="flex flex-col gap-10">
      <header className="flex max-w-2xl flex-col gap-2">
        <h2 className="text-2xl font-semibold text-text">{t("Por onde seus clientes falam com você?")}</h2>
        <p className="text-base text-text-muted">
          {t("Ligue os lugares onde seu cliente já chama. Cada mensagem cai na mesma caixa de entrada, e a sua assistente responde por você.")}
        </p>
      </header>

      <section
        aria-labelledby="canal-whatsapp-titulo"
        className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-success-bg text-success">
              <WhatsappLogo size={28} aria-hidden />
            </span>
            <div className="flex flex-col gap-1">
              <h3 id="canal-whatsapp-titulo" className="text-xl font-semibold text-text">{t("WhatsApp")}</h3>
              <p className="text-sm text-text-muted">{t("Onde a maioria dos seus clientes está.")}</p>
            </div>
          </div>
          <Selo estado={estadoWa}>
            {sessoes.isLoading
              ? t("Carregando…")
              : estadoWa === "off"
                ? t("Nenhum número conectado")
                : rotulo(wa, t("1 número funcionando"), t("números funcionando"))}
          </Selo>
        </div>
        <p className="max-w-2xl text-sm text-text-muted">
          {t("Conecte pelo celular, lendo um código como no WhatsApp Web (pronto em 1 minuto), ou pelo WhatsApp oficial, entrando com o Facebook (indicado para quem anuncia ou manda muitas mensagens).")}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {botaoDeConectar}
          {wa.total > 0 && (
            <Link
              href="/app/connections?aba=numeros"
              scroll={false}
              data-testid="ver-numeros"
              className="inline-flex h-9 items-center rounded-md border border-border-strong px-4 text-sm font-semibold text-text hover:bg-surface-elevated"
            >
              {estadoWa === "atencao" ? t("Ver o que precisa de você") : t("Ver meus números")}
            </Link>
          )}
          <Link
            href="/app/connections?aba=oficial&sub=templates"
            scroll={false}
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            {t("Mensagens para quem sumiu (modelos da Meta)")}
          </Link>
        </div>
      </section>

      <section aria-labelledby="outros-canais-titulo" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 id="outros-canais-titulo" className="text-lg font-semibold text-text">{t("Outros lugares onde seu cliente chama")}</h3>
          <p className="text-sm text-text-muted">{t("Ligue só os que você usa. Dá para ligar depois.")}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CartaoDeCanal
            href="/app/connections?aba=messenger"
            icone={InstagramLogo}
            nome={t("Instagram")}
            descricao={t("O direct da conta ligada à sua página do Facebook.")}
            estado={estadoDe(resumo.instagram)}
            rotuloDoEstado={rotuloDe(resumo.instagram)}
            testId="canal-instagram"
          />
          <CartaoDeCanal
            href="/app/connections?aba=messenger"
            icone={MessengerLogo}
            nome={t("Facebook Messenger")}
            descricao={t("Mensagens da sua página e de quem comenta nos anúncios.")}
            estado={estadoDe(resumo.messenger)}
            rotuloDoEstado={rotuloDe(resumo.messenger)}
            testId="canal-messenger"
          />
          <CartaoDeCanal
            href="/app/connections?aba=webchat"
            icone={Browsers}
            nome={t("Chat no seu site")}
            descricao={t("Uma janelinha de conversa no seu site.")}
            estado="off"
            testId="canal-webchat"
          />
          <CartaoDeCanal
            href="/app/connections?aba=telefonia"
            icone={Phone}
            nome={t("Ligações")}
            descricao={t("Atenda e ligue para clientes pelo navegador.")}
            estado="off"
            testId="canal-telefone"
          />
          <CartaoDeCanal
            href="/app/connections?aba=telegram"
            icone={TelegramLogo}
            nome={t("Telegram")}
            descricao={t("Para quem atende clientes pelo Telegram.")}
            estado={estadoDe(resumo.telegram)}
            rotuloDoEstado={rotuloDe(resumo.telegram)}
            testId="canal-telegram"
          />
          <CartaoDeCanal
            href="/app/connections?aba=sociais&rede=tiktok"
            icone={TiktokLogo}
            nome={t("TikTok")}
            descricao={t("Ligue a conta para publicar pelo AcassIA. As mensagens do TikTok ainda não chegam na caixa de entrada.")}
            estado={redeLigada("tiktok")}
            rotuloDoEstado={redeLigada("tiktok") === "ok" ? t("Conectado") : t("Não conectado")}
            testId="canal-tiktok"
          />
          <CartaoDeCanal
            href="/app/connections?aba=sociais&rede=pinterest"
            icone={PinterestLogo}
            nome={t("Pinterest")}
            descricao={t("Ligue a conta para publicar pelo AcassIA. O Pinterest não tem mensagens para a caixa de entrada.")}
            estado={redeLigada("pinterest")}
            rotuloDoEstado={redeLigada("pinterest") === "ok" ? t("Conectado") : t("Não conectado")}
            testId="canal-pinterest"
          />
        </div>
      </section>

      <section aria-labelledby="sua-loja-titulo" className="flex flex-col gap-4">
        <h3 id="sua-loja-titulo" className="text-lg font-semibold text-text">{t("Sua loja e automações")}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CartaoDeCanal
            href="/app/integrations/nuvemshop"
            icone={Storefront}
            nome={t("Nuvemshop")}
            descricao={t("Pedidos e clientes da loja aparecem no atendimento.")}
            estado="off"
            testId="porta-da-nuvemshop"
          />
          <CartaoDeCanal
            href="/app/instagram"
            icone={InstagramLogo}
            nome={t("Instagram: comentou, recebe direct")}
            descricao={t("Responda por direct quem comenta nas suas publicações.")}
            estado="off"
            testId="porta-do-instagram"
          />
        </div>
      </section>

      <details className="group border-t border-border pt-5">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-text-muted hover:text-text">
          <CaretRight size={16} aria-hidden className="transition-transform group-open:rotate-90" />
          {t("Opções avançadas (para quem cuida da parte técnica)")}
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {avancadas.map((a) => (
            <Link
              key={a.aba}
              href={`/app/connections?aba=${a.aba}`}
              scroll={false}
              className="flex flex-col gap-1 rounded-lg border border-dashed border-border-strong bg-surface-elevated p-4 hover:border-text-subtle"
            >
              <span className="text-sm font-semibold text-text">{a.nome}</span>
              <span className="text-xs text-text-muted">{a.descricao}</span>
            </Link>
          ))}
        </div>
      </details>
    </div>
  );
}
