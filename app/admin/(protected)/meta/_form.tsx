"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ativarAppDaMeta, type AtivarAppDaMetaResult } from "@/app/actions/settings/ativarAppDaMeta";
import {
  rotacionarVerifyTokenDaMeta,
  updateMetaApp,
  type UpdateMetaAppResult,
} from "@/app/actions/settings/updateMetaApp";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { linksDoPainel, PERMISSOES_PARA_ACESSO_AVANCADO, type ChaveDoPasso } from "@/lib/channels/meta/ativar-app";
import { copyToClipboard } from "@/lib/clipboard";

interface Props {
  /**
   * SE existe chave gravada — nunca QUAL, nem cifrada. Mesma disciplina de
   * `temSegredoSalvo` em `/admin/google` e de `hasToken` no canal oficial.
   */
  readonly temSegredoSalvo: boolean;
  /** SE existe token gravado. O valor não tem leitura: sai só da action que o gera. */
  readonly temTokenSalvo: boolean;
  readonly tokenGeradoEm: string | null;
  readonly atualizadoEm: string | null;
  /** O par está no `.env` desta instalação (o piso de rollback). */
  readonly temNoAmbiente: boolean;
  readonly leituraFalhou: boolean;
  /** O endereço do app nesta instalação. `null` = sem endereço público HTTPS. */
  readonly urlDoApp?: string | null;
  /** O ID do app da Meta está definido? Sem ele não há a quem registrar. */
  readonly temAppId?: boolean;
  /** O app em vigor e as configurações de login dele. Nada disso é segredo. */
  readonly app?: IdsDoApp;
}

export interface IdsDoApp {
  readonly appId: string | null;
  readonly whatsappConfigId: string | null;
  readonly messengerConfigId: string | null;
  readonly adsConfigId: string | null;
}

const SEM_IDS: IdsDoApp = { appId: null, whatsappConfigId: null, messengerConfigId: null, adsConfigId: null };

/** O piso do schema da action. Abaixo disso o Zod recusa e a tela culparia o dono. */
const TAMANHO_MINIMO_DA_CHAVE = 16;

export function FormularioDaMeta({
  temSegredoSalvo,
  temTokenSalvo,
  tokenGeradoEm,
  atualizadoEm,
  temNoAmbiente,
  leituraFalhou,
  urlDoApp = null,
  temAppId = false,
  app = SEM_IDS,
}: Props) {
  const t = useT();
  const router = useRouter();
  const [chave, setChave] = useState("");
  const [appId, setAppId] = useState(app.appId ?? "");
  const [cfgWhatsapp, setCfgWhatsapp] = useState(app.whatsappConfigId ?? "");
  const [cfgMessenger, setCfgMessenger] = useState(app.messengerConfigId ?? "");
  const [cfgAds, setCfgAds] = useState(app.adsConfigId ?? "");
  /**
   * O token recém-gerado vive SÓ aqui, na memória desta aba. Recarregar a página
   * o perde — e isso é o desenho, não um defeito: a tela diz para copiar agora e
   * oferece gerar outro.
   */
  const [tokenNovo, setTokenNovo] = useState<string | null>(null);
  const [confirmandoTroca, setConfirmandoTroca] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const [ativacao, setAtivacao] = useState<AtivarAppDaMetaResult | null>(null);

  const NOME_DO_PASSO: Record<ChaveDoPasso, string> = {
    webhook_whatsapp: t("Avisos do WhatsApp (mensagens, modelos, celular em coexistência, desconexão)"),
    webhook_paginas: t("Avisos das páginas do Facebook (Messenger)"),
    enderecos_do_app: t("Domínio, política de privacidade e termos do aplicativo"),
  };

  function motivoDaAtivacao(r: Extract<AtivarAppDaMetaResult, { ok: false }>): string {
    switch (r.error) {
      case "sem_app_id":
        return t("Preencha o ID do aplicativo acima e salve.");
      case "sem_credencial":
        return t("Cadastre a chave secreta do aplicativo primeiro. Sem ela o token não vale.");
      default:
        return t("Esta instalação não tem um endereço público com HTTPS, e a Meta só registra endereço assim.");
    }
  }

  /** Ativa e confere na Meta. Roda sozinha depois de salvar um app ou uma chave nova. */
  async function ativarNaMeta() {
    const r = await ativarAppDaMeta();
    setAtivacao(r);
    if (!r.ok) toast.error(motivoDaAtivacao(r));
    else if (r.passos.every((p) => p.ok)) toast.success(t("Tudo ativado na Meta."));
    else toast.error(t("A Meta recusou parte da ativação. Veja o motivo no quadro."));
  }

  const chaveNova = chave.trim();
  const temChaveNova = chaveNova.length >= TAMANHO_MINIMO_DA_CHAVE;
  const appIdNovo = appId.trim();
  const trocaDeApp = appIdNovo !== "" && appIdNovo !== (app.appId ?? "");
  const configsMudadas = (
    [
      ["whatsapp_config_id", cfgWhatsapp, app.whatsappConfigId],
      ["messenger_config_id", cfgMessenger, app.messengerConfigId],
      ["ads_config_id", cfgAds, app.adsConfigId],
    ] as const
  ).filter(([, novo, atual]) => novo.trim() !== (atual ?? ""));
  // App novo pede a chave DELE: a guardada é do antigo, e a action recusaria.
  const faltaChaveDoAppNovo = trocaDeApp && !temChaveNova;
  const podeSalvar = !faltaChaveDoAppNovo && (temChaveNova || trocaDeApp || configsMudadas.length > 0);

  function motivoDaRecusa(r: Extract<UpdateMetaAppResult, { ok: false }>): string {
    switch (r.error) {
      case "invalid_input":
        return t("Confira os campos: a chave tem 32 letras e números, e os IDs são só números.");
      case "app_novo_sem_chave":
        return t("Para trocar de aplicativo, cole também a chave secreta do aplicativo novo.");
      case "app_recusado_pela_meta": {
        const motivo = (r.details as { motivo?: string } | undefined)?.motivo ?? "";
        return `${t("A Meta não reconheceu esse ID com essa chave. Confira se os dois são do mesmo aplicativo.")} ${motivo}`.trim();
      }
      case "app_secret_obrigatorio":
        return t("Cadastre a chave secreta do aplicativo primeiro. Sem ela o token não vale.");
      case "nada_para_salvar":
        return t("Nada mudou. Digite uma chave nova para substituir a atual.");
      case "leitura_do_app_falhou":
        return t("Não consegui conferir o que já está gravado, então nada foi alterado. Tente de novo em instantes.");
      default:
        // Cifra indisponível ou erro do banco: o texto da action diz qual, e
        // quem administra o servidor precisa dele para agir. Nada foi gravado.
        return `${t("Não deu para salvar, e nada foi gravado.")} ${t(r.error)}`;
    }
  }

  function aoGravar(r: UpdateMetaAppResult, sucesso: string) {
    if (!r.ok) {
      toast.error(motivoDaRecusa(r));
      return;
    }
    if (r.verifyToken) setTokenNovo(r.verifyToken);
    toast.success(sucesso);
    router.refresh();
  }

  function salvar() {
    iniciar(async () => {
      const r = await updateMetaApp({
        ...(temChaveNova ? { app_secret: chaveNova } : {}),
        // Com chave nova, o ID vai junto para a action conferir o par na Meta.
        ...(appIdNovo !== "" && (trocaDeApp || temChaveNova) ? { app_id: appIdNovo } : {}),
        ...Object.fromEntries(configsMudadas.map(([campo, novo]) => [campo, novo.trim()])),
      });
      if (r.ok) setChave("");
      aoGravar(r, r.ok && r.appName ? `${t("Salvo. Aplicativo conferido na Meta:")} ${r.appName}` : t("Salvo."));
      // App ou chave nova: liga na Meta, na hora, tudo o que o produto usa dele.
      if (r.ok && (temChaveNova || trocaDeApp)) await ativarNaMeta();
    });
  }

  function gerarToken() {
    setConfirmandoTroca(false);
    iniciar(async () => {
      aoGravar(await rotacionarVerifyTokenDaMeta(), t("Token de verificação gerado."));
    });
  }

  async function copiar(valor: string) {
    if (await copyToClipboard(valor)) toast.success(t("Copiado."));
    else toast.error(t("Não deu para copiar. Selecione o texto e copie à mão."));
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("API Oficial da Meta desta instalação")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("É com estas duas informações que o sistema confere que cada mensagem recebida pelo número oficial veio mesmo da Meta. Elas valem para a instalação inteira — cada empresa conecta o próprio número depois, em Conexões.")}
        </p>
      </header>

      {leituraFalhou ? (
        <p
          role="alert"
          className="rounded-md border border-warning/40 bg-warning-bg p-3 text-xs leading-4 text-text-muted"
        >
          {t("Não deu para ler a configuração salva agora, então o que aparece abaixo pode não ser o que está valendo. Recarregue a página antes de trocar qualquer coisa.")}
        </p>
      ) : null}

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meta-app-id">{t("ID do aplicativo")}</Label>
          <Input
            id="meta-app-id"
            data-testid="meta-app-id"
            inputMode="numeric"
            autoComplete="off"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder={t("Só números, como 1431224221868157")}
          />
          <p className="text-xs text-muted-foreground">
            {t("Fica no topo do painel do aplicativo na Meta (developers.facebook.com). Para trocar de aplicativo — por exemplo, porque o portfólio dono do atual foi restrito —, cole aqui o ID do aplicativo novo e a chave secreta dele logo abaixo, e salve.")}
          </p>
          {faltaChaveDoAppNovo ? (
            <p role="alert" data-testid="meta-falta-chave-do-app-novo" className="text-xs text-destructive">
              {t("Para trocar de aplicativo, cole também a chave secreta do aplicativo novo.")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meta-app-secret">{t("Chave secreta do aplicativo")}</Label>
          <Input
            id="meta-app-secret"
            data-testid="meta-app-secret"
            type="password"
            autoComplete="off"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            placeholder={temSegredoSalvo ? t("••••••••  (já cadastrada)") : t("32 letras e números")}
          />
          <p className="text-xs text-muted-foreground">
            {temSegredoSalvo
              ? t("Já existe uma chave cadastrada. Deixe em branco para mantê-la, ou digite uma nova para substituir.")
              : t("Fica no painel da Meta, em Configurações do app › Básico. Ela é guardada cifrada e nunca volta a aparecer nesta tela.")}
          </p>
        </div>

        <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{t("Configurações de login do aplicativo")}</legend>
          <p className="text-xs text-muted-foreground">
            {t("Ficam no painel do aplicativo, em Login do Facebook para Empresas › Configurações. Cada uma é do aplicativo acima: trocar de aplicativo limpa as que você não preencher.")}
          </p>
          {(
            [
              ["meta-config-whatsapp", t("WhatsApp (cadastro incorporado)"), cfgWhatsapp, setCfgWhatsapp, t("Liga o botão “Conectar com Facebook” do WhatsApp oficial em Conexões.")],
              ["meta-config-messenger", t("Messenger (opcional)"), cfgMessenger, setCfgMessenger, null],
              ["meta-config-ads", t("Meta Ads (opcional)"), cfgAds, setCfgAds, null],
            ] as const
          ).map(([id, rotulo, valor, mudar, ajuda]) => (
            <div key={id} className="flex flex-col gap-1.5">
              <Label htmlFor={id}>{rotulo}</Label>
              <Input
                id={id}
                data-testid={id}
                inputMode="numeric"
                autoComplete="off"
                value={valor}
                onChange={(e) => mudar(e.target.value)}
                placeholder={t("ID da configuração (só números)")}
              />
              {ajuda ? <p className="text-xs text-muted-foreground">{ajuda}</p> : null}
            </div>
          ))}
        </fieldset>

        {temNoAmbiente ? (
          <p
            data-testid="meta-tem-no-ambiente"
            className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
          >
            {t("Esta instalação já tem a chave e o token no arquivo de configuração do servidor. O que você salvar aqui passa a valer no lugar deles — e, a partir daí, é o token desta tela que precisa estar colado no painel da Meta.")}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {atualizadoEm
              ? `${t("Última alteração em")} ${atualizadoEm}.`
              : t("Nunca configurado por aqui.")}
          </span>
          <Button data-testid="meta-salvar" disabled={!podeSalvar || ocupado} onClick={salvar}>
            {ocupado ? t("Salvando…") : t("Salvar")}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium">{t("Token de verificação")}</h2>
          <p className="text-sm text-muted-foreground" data-testid="meta-token-estado">
            {temTokenSalvo && tokenGeradoEm
              ? `${t("Gerado em")} ${tokenGeradoEm}.`
              : temTokenSalvo
                ? t("Já existe um token gerado.")
                : t("Ainda não existe. Ele é criado pelo sistema na primeira vez que você salva a chave secreta — ninguém precisa inventar nada.")}
          </p>
        </div>

        {tokenNovo ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meta-token-gerado">{t("Seu token de verificação")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="meta-token-gerado"
                data-testid="meta-token-gerado"
                readOnly
                value={tokenNovo}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="outline"
                data-testid="meta-copiar-token"
                onClick={() => void copiar(tokenNovo)}
              >
                {t("Copiar")}
              </Button>
            </div>
            <p className="rounded-md border border-warning/40 bg-warning-bg p-3 text-xs leading-4 text-text-muted">
              <strong className="font-semibold text-text">{t("Copie agora.")}</strong>{" "}
              {t("Por segurança, ele não aparece de novo depois que você sair desta página. Se perder, é só gerar outro aqui.")}
            </p>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {t("No painel da Meta, em WhatsApp › Configuração › Webhook, este token vai no campo “Verificar token”. O outro campo, “URL de callback”, é de cada número: ele aparece em Conexões › API Oficial (Meta), depois que o número é conectado. Abra Conexões em outra aba, para não perder o token desta página.")}{" "}
          {/*
            Outra aba de propósito: o token recém-gerado vive só nesta página, e
            a URL de callback só em Conexões. Na mesma aba a pessoa perde o token
            no caminho — e copiar a URL depois sobrescreve a área de transferência.
          */}
          <Link
            href="/app/connections?aba=oficial"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="meta-abrir-conexoes"
            className="font-medium text-foreground underline underline-offset-2"
          >
            {t("Abrir Conexões em outra aba")}
          </Link>
        </p>

        {temSegredoSalvo ? (
          <div className="flex justify-end">
            <Button
              variant="outline"
              data-testid="meta-gerar-token"
              disabled={ocupado}
              // Sem token gravado não há o que derrubar: gera direto. Com token,
              // a troca invalida o que está colado na Meta e pede confirmação.
              onClick={() => (temTokenSalvo ? setConfirmandoTroca(true) : gerarToken())}
            >
              {temTokenSalvo ? t("Gerar novo token") : t("Gerar token")}
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3 p-4" data-testid="meta-ativacao">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium">{t("Ativação na Meta")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("Ao salvar um aplicativo ou uma chave nova, o sistema liga na Meta tudo o que usa dele e confere com ela o que ficou valendo. Não é preciso colar endereço nem token no painel. Pode ativar de novo quando quiser: cada vez substitui a anterior.")}
          </p>
        </div>
        {urlDoApp ? <code className="overflow-x-auto rounded-md bg-muted px-2 py-1.5 text-xs">{urlDoApp}</code> : null}
        {ativacao && !ativacao.ok ? (
          <p role="alert" className="text-sm text-destructive" data-testid="meta-ativacao-recusada">
            {motivoDaAtivacao(ativacao)}
          </p>
        ) : null}
        {ativacao?.ok ? (
          <ul className="flex flex-col gap-2" data-testid="meta-ativacao-passos">
            {ativacao.passos.map((p) => (
              <li key={p.chave} data-testid={`meta-passo-${p.chave}`} data-ok={p.ok} className="flex gap-2 text-sm">
                <span aria-hidden className={p.ok ? "text-success" : "text-destructive"}>
                  {p.ok ? "✓" : "✕"}
                </span>
                <span className="flex flex-col">
                  <span>{NOME_DO_PASSO[p.chave]}</span>
                  {p.motivo ? <span className="text-xs text-muted-foreground">{p.motivo}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex justify-end">
          <Button
            variant="outline"
            data-testid="meta-ativar"
            disabled={ocupado || !temAppId || !urlDoApp || !(temSegredoSalvo || temNoAmbiente)}
            onClick={() => iniciar(ativarNaMeta)}
          >
            {ocupado ? t("Ativando…") : ativacao ? t("Ativar e conferir de novo") : t("Ativar tudo na Meta")}
          </Button>
        </div>
      </Card>

      {app.appId ? <PassosDoPainel appId={app.appId} temConfigDoWhatsapp={Boolean(app.whatsappConfigId)} /> : null}

      <AlertDialog open={confirmandoTroca} onOpenChange={setConfirmandoTroca}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Gerar um novo token de verificação?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("O token atual deixa de valer na hora. As mensagens que já chegam continuam chegando, porque elas são conferidas pela chave secreta. O que muda: a Meta só consegue confirmar o endereço do webhook de novo depois que você colar o token novo no painel dela.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction data-testid="meta-confirmar-novo-token" onClick={gerarToken}>
              {t("Gerar novo token")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * O que a Graph não deixa o token do app fazer: só a pessoa, no painel da Meta.
 * Cada passo leva direto ao lugar certo do aplicativo em vigor.
 */
function PassosDoPainel({ appId, temConfigDoWhatsapp }: { appId: string; temConfigDoWhatsapp: boolean }) {
  const t = useT();
  const links = linksDoPainel(appId);
  const link = (href: string, texto: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-2">
      {texto}
    </a>
  );
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="meta-passos-do-painel">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">{t("O que só dá para fazer no painel da Meta")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("A Meta não deixa um sistema fazer estes passos pelo aplicativo. Cada um leva direto ao lugar certo.")}
        </p>
      </div>
      <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
        <li data-testid="meta-painel-config">
          {temConfigDoWhatsapp
            ? t("Confira que a configuração do WhatsApp gera token que não expira (“Nunca”). Com token de 60 dias a conexão é recusada.")
            : t("Crie a configuração do WhatsApp: Cadastro incorporado, produto WhatsApp Cloud API, usuário do sistema com expiração “Nunca” e as permissões whatsapp_business_management e whatsapp_business_messaging. Cole o ID dela acima.")}{" "}
          {link(links.loginParaEmpresas, t("Abrir configurações de login"))}
        </li>
        <li data-testid="meta-painel-permissoes">
          {t("Peça acesso avançado às permissões, para empresas de fora do seu portfólio conseguirem conectar:")}{" "}
          <span className="font-mono text-xs">{PERMISSOES_PARA_ACESSO_AVANCADO.join(", ")}</span>.{" "}
          {link(links.permissoes, t("Abrir permissões"))}
        </li>
        <li data-testid="meta-painel-verificacao">
          {t("Portfólio verificado, aplicativo publicado (modo Ao vivo) e cadastro como Provedor de Tecnologia. Sem isso, só quem tem função no aplicativo conecta.")}{" "}
          {link(links.basico, t("Abrir configurações básicas"))}
        </li>
      </ol>
    </Card>
  );
}
