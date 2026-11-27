"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { MessengerClient } from "./MessengerClient";
import { TelegramClient } from "./TelegramClient";
import { RedesSociaisClient } from "./RedesSociaisClient";
import { CanalGraphParceiroClient } from "./CanalGraphParceiroClient";
import { CanalLinkDeCadastroClient } from "./CanalLinkDeCadastroClient";
import { CanalOficialClient } from "./CanalOficialClient";
import { CanalParceiroClient } from "./CanalParceiroClient";
import { CanalVozClient } from "./CanalVozClient";
import { ConnectionsClient } from "./ConnectionsClient";
import { CanaisVisaoGeral } from "./CanaisVisaoGeral";
import { EscolherConexao } from "./EscolherConexao";
import { TemplatesClient } from "./TemplatesClient";
import { TemplatesParceiroClient } from "./TemplatesParceiroClient";
import { TelefoniaClient } from "./TelefoniaClient";
import { WebchatClient } from "./WebchatClient";
import { useOfficialChannel } from "@/hooks/channels/useOfficialChannel";
import { useT } from "@/hooks/i18n/useT";
import { rotaDeTemplates } from "@/lib/channels/templates-fonte";
import { CaretLeft } from "@/lib/ui/icons";

/**
 * Conexões — TODOS os canais em um lugar só.
 *
 * ─── Por que isto existe ────────────────────────────────────────────────────
 * Conectar o número por QR ficava aqui; conectar o número OFICIAL ficava em
 * Configurações; os templates, que só existem por causa do canal oficial, ficavam
 * numa terceira tela. Três lugares para uma coisa só — e o usuário precisava saber
 * de antemão que a resposta para "conectar meu WhatsApp" dependia de QUAL WhatsApp.
 *
 * A pergunta que a tela responde é "por onde meu negócio fala com o cliente". A
 * resposta é uma lista de canais, não um mapa do nosso código: quem instala não
 * sabe (nem deve saber) que um passa por QR e o outro por credencial da Meta.
 *
 * Templates entram como sub-aba do canal oficial, e não como item de topo, porque
 * eles NÃO existem fora dele: num canal por QR não há template a aprovar. Promovê-los
 * a item de primeiro nível sugeriria uma escolha que não existe.
 *
 * ─── A aba vive na URL ──────────────────────────────────────────────────────
 * `?aba=` e `?sub=` em vez de estado só em memória: as rotas antigas
 * (`/app/settings/canal-oficial`, `/app/settings/templates`) redirecionam para cá
 * apontando a aba certa, e um link colado no chat abre onde deveria. Aba que só
 * existe em `useState` transforma todo link salvo em "abre e procura de novo".
 */
export function ConexoesShell({
  wahaConfigured,
  wacallsConfigured,
  graphParceiro = null,
  linkDeCadastro = null,
}: {
  wahaConfigured: boolean;
  wacallsConfigured: boolean;
  /**
   * O canal parceiro que espelha a Cloud API (recorte do #1130) é OPCIONAL DA
   * INSTALAÇÃO e nasce desligado (decisão do dono, doc 54). `null` = a
   * instalação não o liga, e a aba nem é montada — nem por `?aba=` na URL.
   * O rótulo vem do servidor porque a tela não pode nomear provider.
   */
  graphParceiro?: { label: string } | null;
  /** Número oficial por link de cadastro: só quando a instalação tem a chave do provedor. */
  linkDeCadastro?: { label: string } | null;
}) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const abaParam = params.get("aba");
  const ABAS = ["numeros", "oficial", "parceiro", "voz", "messenger", "telegram", "sociais", "webchat", "telefonia"];
  // Sem `?aba=` abre a VISÃO GERAL (a porta para quem vende). Aba técnica que a instalação não
  // liga (`graph`, `link`) também cai nela — nem por `?aba=` na URL ela é montada.
  const aba =
    abaParam && ABAS.includes(abaParam)
      ? abaParam
      : abaParam === "graph" && graphParceiro
        ? "graph"
        : abaParam === "link" && linkDeCadastro
          ? "link"
          : "inicio";
  const sub = params.get("sub") === "templates" ? "templates" : "conexao";
  // O botão único "Conectar WhatsApp" abre a janela do Facebook ali mesmo; para
  // isso precisa do login da instalação antes do clique.
  const oficial = useOfficialChannel().data?.data;
  // "Conectar por QR" escolhido na janela única: a aba dos números abre e o QR
  // sobe em janela. Um pedido, atendido uma vez — trocar de aba e voltar não o
  // repete (a aba remonta, e um contador a faria criar outro número).
  const [qrPendente, setQrPendente] = useState(false);

  const irPara = (proximaAba: string, proximaSub?: string): void => {
    const q = new URLSearchParams();
    if (proximaAba !== "inicio") q.set("aba", proximaAba);
    if (proximaSub && proximaSub !== "conexao") q.set("sub", proximaSub);
    const qs = q.toString();
    // `scroll: false`: trocar de aba não é navegar para outra página; jogar o
    // usuário para o topo a cada clique faz a tela parecer que recarregou.
    router.replace(qs ? `/app/connections?${qs}` : "/app/connections", { scroll: false });
  };

  // O botão de conectar WhatsApp mora SÓ onde se fala de WhatsApp: no cartão da visão geral e
  // nas telas dos números. Antes ficava ao lado da barra de abas e aparecia até no Telegram.
  const botaoDeConectar = (
    <EscolherConexao
      login={oficial?.login ?? null}
      oficialConectado={Boolean(oficial?.connected)}
      onEscolher={(tipo) => {
        if (tipo === "qr") setQrPendente(true);
        irPara(tipo === "oficial" ? "oficial" : "numeros");
      }}
    />
  );

  // Os jeitos de ligar número que pedem alguém técnico. Rótulo pelo CONCEITO; a marca do
  // parceiro, quando há, vem do servidor (a tela não pode nomear provider).
  const avancadas = [
    { aba: "parceiro", nome: t("Provedor parceiro"), descricao: t("Número oficial contratado por um parceiro, com chave de acesso.") },
    { aba: "voz", nome: t("Chamada de voz no WhatsApp"), descricao: t("Receber ligações de WhatsApp por um serviço externo.") },
    ...(graphParceiro ? [{ aba: "graph", nome: graphParceiro.label, descricao: t("Outro jeito de ligar o número oficial, oferecido nesta instalação.") }] : []),
    ...(linkDeCadastro ? [{ aba: "link", nome: linkDeCadastro.label, descricao: t("Número oficial por link de cadastro.") }] : []),
  ];

  const TITULO: Record<string, string> = {
    numeros: t("WhatsApp"),
    oficial: t("WhatsApp"),
    parceiro: t("Provedor parceiro"),
    voz: t("Chamada de voz no WhatsApp"),
    graph: graphParceiro?.label ?? "",
    link: linkDeCadastro?.label ?? "",
    messenger: t("Facebook Messenger e Instagram"),
    telegram: t("Telegram"),
    sociais: t("Redes sociais"),
    webchat: t("Chat no seu site"),
    telefonia: t("Ligações"),
  };
  const ehWhatsapp = aba === "numeros" || aba === "oficial";

  if (aba === "inicio") {
    return <CanaisVisaoGeral botaoDeConectar={botaoDeConectar} avancadas={avancadas} />;
  }

  return (
    <Tabs value={aba} onValueChange={(v) => irPara(v)} className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Link
          href="/app/connections"
          scroll={false}
          data-testid="voltar-aos-canais"
          className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-primary"
        >
          <CaretLeft size={16} aria-hidden />
          {t("Todos os canais")}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-text">{TITULO[aba]}</h2>
          {ehWhatsapp && botaoDeConectar}
        </div>
        {/* Os dois jeitos de todo dia de ver os números. Os técnicos (parceiro, voz…) se abrem
            pela visão geral, em "Opções avançadas", e não disputam espaço aqui. */}
        {ehWhatsapp && (
          <TabsList className="self-start">
            <TabsTrigger value="numeros">{t("Números conectados")}</TabsTrigger>
            <TabsTrigger value="oficial">{t("WhatsApp oficial (Meta)")}</TabsTrigger>
          </TabsList>
        )}
      </div>

      <TabsContent value="numeros" className="mt-0">
        <ConnectionsClient
          wahaConfigured={wahaConfigured}
          qrPendente={qrPendente}
          aoAtenderQr={() => setQrPendente(false)}
        />
      </TabsContent>

      <TabsContent value="telefonia" className="mt-0">
        <TelefoniaClient />
      </TabsContent>
      <TabsContent value="messenger" className="mt-0"><MessengerClient /></TabsContent>
      <TabsContent value="telegram" className="mt-0"><TelegramClient /></TabsContent>
      <TabsContent value="sociais" className="mt-0"><RedesSociaisClient /></TabsContent>
      <TabsContent value="webchat" className="mt-0"><WebchatClient /></TabsContent>

      <TabsContent value="voz" className="mt-0">
        <CanalVozClient wacallsConfigured={wacallsConfigured} />
      </TabsContent>

      {linkDeCadastro && (
        <TabsContent value="link" className="mt-0">
          <CanalLinkDeCadastroClient />
        </TabsContent>
      )}

      {graphParceiro && (
        <TabsContent value="graph" className="mt-0">
          {/* Sub-abas como nas demais: conectar e gerenciar modelos são tarefas
              diferentes. O componente de modelos é o MESMO do outro parceiro,
              apontado para a rota desta fonte. */}
          <Tabs value={sub} onValueChange={(v) => irPara("graph", v)} className="flex flex-col gap-4">
            <TabsList>
              <TabsTrigger value="conexao">{t("Conexão")}</TabsTrigger>
              <TabsTrigger value="templates">{t("Modelos")}</TabsTrigger>
            </TabsList>
            <TabsContent value="conexao" className="mt-0">
              <CanalGraphParceiroClient />
            </TabsContent>
            <TabsContent value="templates" className="mt-0">
              <TemplatesParceiroClient rota={rotaDeTemplates("graph")} />
            </TabsContent>
          </Tabs>
        </TabsContent>
      )}

      <TabsContent value="parceiro" className="mt-0">
        {/* Sub-abas como no canal oficial, e pelo mesmo motivo: conectar e
            gerenciar definições são tarefas diferentes, e empilhá-las numa tela
            só faz a segunda sumir abaixo da dobra. O rótulo diz "do parceiro"
            para não colidir com "Templates" da barra lateral, que significa
            OUTRA coisa (respostas rápidas do atendente). */}
        <Tabs value={sub} onValueChange={(v) => irPara("parceiro", v)} className="flex flex-col gap-4">
          <TabsList>
            <TabsTrigger value="conexao">{t("Conexão")}</TabsTrigger>
            <TabsTrigger value="templates">{t("Modelos do parceiro")}</TabsTrigger>
          </TabsList>
          <TabsContent value="conexao" className="mt-0">
            <CanalParceiroClient />
          </TabsContent>
          <TabsContent value="templates" className="mt-0">
            <TemplatesParceiroClient />
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="oficial" className="mt-0">
        <Tabs value={sub} onValueChange={(v) => irPara("oficial", v)} className="flex flex-col gap-4">
          <TabsList>
            <TabsTrigger value="conexao">{t("Conexão")}</TabsTrigger>
            {/* "Templates da Meta", não "Templates": a barra lateral já tem um item
                com esse nome que significa OUTRA coisa — respostas rápidas salvas
                pelo atendente (`/app/templates`). Dois conceitos com o mesmo rótulo
                fazem o operador clicar no errado e concluir que a tela está quebrada.
                A colisão é anterior a esta mudança; o que dá para fazer aqui é não
                agravá-la. */}
            <TabsTrigger value="templates">{t("Templates da Meta")}</TabsTrigger>
          </TabsList>
          <TabsContent value="conexao" className="mt-0">
            <CanalOficialClient comBotaoDeConectar={false} />
          </TabsContent>
          <TabsContent value="templates" className="mt-0">
            <TemplatesClient />
          </TabsContent>
        </Tabs>
      </TabsContent>


    </Tabs>
  );
}
