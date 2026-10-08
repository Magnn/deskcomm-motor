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

/**
 * "Conectar com Facebook" — o WhatsApp oficial em um clique.
 *
 * A janela é a do Cadastro Incorporado da Meta: é nela que a pessoa escolhe (ou
 * cria) a conta do WhatsApp Business e o número. Ao fechar, ela devolve um
 * código, que o servidor troca pelo acesso; a conta e o número escolhidos chegam
 * num aviso à parte. Nada é copiado nem colado.
 */
export function ConectarComFacebook({ login, conectado }: { login: LoginDoCanalOficial; conectado: boolean }) {
  const t = useT();
  const conectar = useConnectOfficialChannel();
  const [sdk, setSdk] = useState<SdkDoFacebook | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [naJanela, setNaJanela] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const escolha = useRef<{ phone_number_id?: string; waba_id?: string }>({});

  useEffect(() => {
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

  function abrir(): void {
    if (!sdk) return;
    setAviso(null);
    setNaJanela(true);
    escolha.current = {};
    // A função de volta NÃO pode ser `async`: o SDK recusa.
    sdk.login(
      (resposta) => {
        setNaJanela(false);
        const code = resposta.authResponse?.code;
        if (!code) {
          setAviso(t("A janela do Facebook foi fechada antes do fim. Nada foi conectado."));
          return;
        }
        conectar.mutate(
          { code, ...escolha.current },
          {
            onSuccess: (r) =>
              toast.success(`${t("Conectado:")} ${r.data.displayName} ${r.data.phoneNumber ?? ""}`.trim()),
          },
        );
      },
      {
        config_id: login.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      },
    );
  }

  const ocupado = naJanela || conectar.isPending;

  return (
    <div className="flex flex-col items-start gap-2" data-testid="conectar-com-facebook">
      <Button type="button" onClick={abrir} disabled={!sdk || ocupado} data-testid="btn-conectar-com-facebook">
        {conectar.isPending
          ? t("Conectando…")
          : naJanela
            ? t("Conclua na janela do Facebook…")
            : conectado
              ? t("Reconectar com Facebook")
              : t("Conectar com Facebook")}
      </Button>
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
    </div>
  );
}
