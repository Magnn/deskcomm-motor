"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { useConnectOfficialChannel, type LoginDoCanalOficial } from "@/hooks/channels/useOfficialChannel";

/** O pedaço do SDK do Facebook que esta tela usa. */
interface SdkDoFacebook {
  init(opcoes: { appId: string; version: string; xfbml: boolean; autoLogAppEvents: boolean }): void;
  login(
    aoVoltar: (resposta: { authResponse?: { code?: string } | null }) => void,
    opcoes: Record<string, unknown>,
  ): void;
}

declare global {
  interface Window {
    FB?: SdkDoFacebook;
    fbAsyncInit?: () => void;
  }
}

const ENDERECO_DO_SDK = "https://connect.facebook.net/en_US/sdk.js";

/**
 * Carrega o SDK uma vez por página. Ele fica pronto ANTES do clique de propósito:
 * a janela do Facebook só abre se `FB.login` for chamado dentro do próprio
 * clique, e esperar um carregamento ali faz o navegador barrá-la como pop-up.
 */
function carregarSdk(login: LoginDoCanalOficial): Promise<SdkDoFacebook> {
  return new Promise((resolver, recusar) => {
    const iniciar = (): void => {
      if (!window.FB) return recusar(new Error("sdk_ausente"));
      window.FB.init({ appId: login.appId, version: login.versao, xfbml: false, autoLogAppEvents: false });
      resolver(window.FB);
    };
    if (window.FB) return iniciar();
    window.fbAsyncInit = iniciar;
    const script = document.createElement("script");
    script.src = ENDERECO_DO_SDK;
    script.async = true;
    script.crossOrigin = "anonymous";
    // Bloqueador de anúncio costuma barrar este endereço: sem isto o botão
    // ficaria desabilitado para sempre, sem dizer por quê.
    script.onerror = () => recusar(new Error("sdk_bloqueado"));
    document.head.appendChild(script);
  });
}

/** O aviso veio mesmo da janela do Facebook? */
function vemDoFacebook(origem: string): boolean {
  try {
    const { protocol, hostname } = new URL(origem);
    return protocol === "https:" && (hostname === "facebook.com" || hostname.endsWith(".facebook.com"));
  } catch {
    return false;
  }
}

/** Uma conexão concluída, como o servidor a devolve. */
export interface ConexaoConcluida {
  displayName: string | null;
  phoneNumber: string | null;
}

/**
 * As opções da janela, no formato da v4 do Cadastro Incorporado. A versão NÃO
 * vai aqui: quem a decide é a configuração de login criada na Meta com o
 * produto escolhido, e o `extras` da v4 é vazio de propósito.
 *
 * Até 15/10/2026 este objeto ia sem `version` e com `sessionInfoVersion` — o
 * formato da v2, que a Meta descontinuou nesse dia. Foi quando o dono relatou
 * que a janela abria sem deixar escolher nem criar outro portfólio (BM).
 *
 * A coexistência (número também no aplicativo do celular) continua sendo pedida
 * pelo `featureType`, que a v4 mantém.
 */
export function opcoesDaJanela(configId: string, noCelular: boolean): Record<string, unknown> {
  return {
    config_id: configId,
    response_type: "code",
    override_default_response_type: true,
    extras: noCelular ? { featureType: "whatsapp_business_app_onboarding" } : {},
  };
}

/**
 * A janela do Cadastro Incorporado, sem tela própria: quem a usa é o botão
 * único "Conectar WhatsApp" (`EscolherConexao`) e o cartão do onboarding.
 *
 * O SDK carrega quando o hook monta, e não no clique, porque a janela do
 * Facebook só abre se `FB.login` for chamado DENTRO do clique.
 */
export function useJanelaDoFacebook(
  login: LoginDoCanalOficial | null | undefined,
  aoConectar?: (conexao: ConexaoConcluida) => void,
) {
  const t = useT();
  const conectar = useConnectOfficialChannel();
  const [sdk, setSdk] = useState<SdkDoFacebook | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [naJanela, setNaJanela] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const escolha = useRef<{ phone_number_id?: string; waba_id?: string }>({});

  useEffect(() => {
    if (!login) return;
    let vivo = true;
    carregarSdk(login).then(
      (fb) => vivo && setSdk(fb),
      () => vivo && setBloqueado(true),
    );
    return () => {
      vivo = false;
    };
  }, [login]);

  // A conta e o número que a pessoa escolheu chegam por aqui, não pela volta do login.
  useEffect(() => {
    const ouvir = (evento: MessageEvent): void => {
      if (!vemDoFacebook(evento.origin) || typeof evento.data !== "string") return;
      let dados: { type?: string; event?: string; data?: { phone_number_id?: string; waba_id?: string } };
      try {
        dados = JSON.parse(evento.data);
      } catch {
        return;
      }
      if (dados.type !== "WA_EMBEDDED_SIGNUP" || !dados.event?.startsWith("FINISH")) return;
      escolha.current = {
        phone_number_id: dados.data?.phone_number_id || undefined,
        waba_id: dados.data?.waba_id || undefined,
      };
    };
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, []);

  function abrir(noCelular: boolean): void {
    if (!sdk || !login) return;
    setAviso(null);
    setNaJanela(true);
    escolha.current = {};
    // A função de volta NÃO pode ser `async`: o SDK recusa.
    sdk.login((resposta) => {
      setNaJanela(false);
      const code = resposta.authResponse?.code;
      if (!code) {
        setAviso(t("A janela do Facebook foi fechada antes do fim. Nada foi conectado."));
        return;
      }
      conectar.mutate(
        { code, ...escolha.current },
        {
          onSuccess: (r) => {
            toast.success(`${t("Conectado:")} ${r.data.displayName} ${r.data.phoneNumber ?? ""}`.trim());
            aoConectar?.({ displayName: r.data.displayName, phoneNumber: r.data.phoneNumber });
          },
        },
      );
    }, opcoesDaJanela(login.configId, noCelular));
  }

  return {
    pronto: Boolean(sdk),
    bloqueado,
    naJanela,
    conectando: conectar.isPending,
    aviso,
    abrir,
  };
}

/** O que a pessoa lê antes de abrir a janela: ali dá para trocar de BM. */
export function TextoDoPortfolio() {
  const t = useT();
  return (
    <p className="text-xs text-muted-foreground" data-testid="conectar-qualquer-portfolio">
      {t("Na janela da Meta você escolhe o portfólio empresarial (BM) — qualquer um em que seja administrador — ou cria um novo ali mesmo, junto da conta do WhatsApp e do número. Reconectar com outro portfólio troca o número desta empresa.")}
    </p>
  );
}

/** A caixa da coexistência — a mesma nos dois lugares onde a janela abre. */
export function ManterNoCelular({
  marcado,
  desabilitado,
  aoMudar,
}: {
  marcado: boolean;
  desabilitado: boolean;
  aoMudar: (v: boolean) => void;
}) {
  const t = useT();
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={marcado}
        disabled={desabilitado}
        onChange={(e) => aoMudar(e.target.checked)}
        data-testid="manter-no-celular"
      />
      <span>
        {t("Manter o número também no aplicativo WhatsApp Business do celular")}
        <span className="block text-xs text-muted-foreground">
          {t("Para quem já atende por esse número no aplicativo e não quer deixá-lo. O que for respondido pelo celular aparece aqui e pausa o agente naquela conversa.")}
        </span>
      </span>
    </label>
  );
}

/** Os avisos da janela: SDK barrado ou janela fechada antes do fim. */
export function AvisosDaJanela({ bloqueado, aviso }: { bloqueado: boolean; aviso: string | null }) {
  const t = useT();
  return (
    <>
      {bloqueado ? (
        <p role="alert" className="text-sm text-destructive" data-testid="sdk-bloqueado">
          {t("O navegador bloqueou a janela do Facebook — costuma ser um bloqueador de anúncios. Desative-o nesta página e recarregue.")}
        </p>
      ) : null}
      {aviso ? (
        <p role="status" className="text-sm text-muted-foreground">
          {aviso}
        </p>
      ) : null}
    </>
  );
}

/**
 * "Conectar com Facebook" — o WhatsApp oficial em um clique. Usado no
 * onboarding; em Conexões, a mesma janela abre pelo botão único
 * "Conectar WhatsApp".
 *
 * A janela é a do Cadastro Incorporado da Meta: é nela que a pessoa escolhe (ou
 * cria) o portfólio, a conta do WhatsApp Business e o número. Ao fechar, ela
 * devolve um código, que o servidor troca pelo acesso; a conta e o número
 * escolhidos chegam num aviso à parte. Nada é copiado nem colado.
 */
export function ConectarComFacebook({ login, conectado }: { login: LoginDoCanalOficial; conectado: boolean }) {
  const t = useT();
  const janela = useJanelaDoFacebook(login);
  // COEXISTÊNCIA: o número fica no aplicativo do celular E na API. É outra
  // experiência dentro da mesma janela, e quem a escolhe é a pessoa, antes de abrir.
  const [noCelular, setNoCelular] = useState(false);
  const ocupado = janela.naJanela || janela.conectando;

  return (
    <div className="flex flex-col items-start gap-2" data-testid="conectar-com-facebook">
      <Button
        type="button"
        onClick={() => janela.abrir(noCelular)}
        disabled={!janela.pronto || ocupado}
        data-testid="btn-conectar-com-facebook"
      >
        {janela.conectando
          ? t("Conectando…")
          : janela.naJanela
            ? t("Conclua na janela do Facebook…")
            : conectado
              ? t("Reconectar com Facebook")
              : t("Conectar com Facebook")}
      </Button>
      <TextoDoPortfolio />
      <ManterNoCelular marcado={noCelular} desabilitado={ocupado} aoMudar={setNoCelular} />
      <AvisosDaJanela bloqueado={janela.bloqueado} aviso={janela.aviso} />
    </div>
  );
}
