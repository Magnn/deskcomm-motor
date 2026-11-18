"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import { ChannelAiAccess } from "./ChannelAiAccess";

/**
 * Número oficial por LINK DE CADASTRO do segundo parceiro, pela chave da
 * instalação. O rótulo vem do servidor (`label`) — a tela não nomeia provider.
 *
 * O botão abre o cadastro hospedado (Facebook + número; com coexistência, QR no
 * app). A volta passa por `/auth/link-return/…` e deixa na URL o estado e o
 * número; quem conclui é o SERVIDOR, que confere de quem é o número.
 */
interface Numero {
  channel_session_id: string;
  phone_number: string | null;
  nome: string | null;
  status: string | null;
  webhook_automatico: boolean;
}

interface Estado {
  disponivel: boolean;
  label: string;
  numeros: Numero[];
}

const PARAMS_DA_VOLTA = ["link_estado", "link_numero", "link_erro"] as const;

export function CanalLinkDeCadastroClient() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [coexistencia, setCoexistencia] = useState(true);
  const [abrindo, setAbrindo] = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  const voltaTratada = useRef(false);

  const carregar = async () => {
    try {
      const r = await apiClient.get<{ data: Estado }>("/api/v1/channels/link-de-cadastro");
      setEstado(r.data);
    } catch {
      setEstado(null);
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  // A volta: conclui UMA vez e limpa a URL (recarregar não conclui de novo).
  useEffect(() => {
    const estadoDaVolta = params.get("link_estado");
    if (!estadoDaVolta || voltaTratada.current) return;
    voltaTratada.current = true;
    const corpo = {
      acao: "concluir",
      estado: estadoDaVolta,
      phone_number_id: params.get("link_numero") ?? undefined,
      erro: params.get("link_erro") ?? undefined,
    };
    const limpa = new URLSearchParams(params.toString());
    for (const p of PARAMS_DA_VOLTA) limpa.delete(p);
    router.replace(`?${limpa.toString()}`, { scroll: false });
    setConcluindo(true);
    void (async () => {
      try {
        await apiClient.post("/api/v1/channels/link-de-cadastro", corpo);
        toast.success(t("WhatsApp conectado. As mensagens já entram por aqui."));
        await carregar();
      } catch (e) {
        toast.error(e instanceof Error ? t(e.message) : t("Não foi possível conectar."));
      } finally {
        setConcluindo(false);
      }
    })();
  }, [params, router, t]);

  const abrir = async () => {
    setAbrindo(true);
    try {
      const r = await apiClient.post<{ data: { url: string } }>("/api/v1/channels/link-de-cadastro", {
        acao: "iniciar",
        coexistencia,
      });
      window.location.assign(r.data.url);
    } catch (e) {
      toast.error(e instanceof Error ? t(e.message) : t("Não foi possível abrir a conexão."));
      setAbrindo(false);
    }
  };

  const numeros = estado?.numeros ?? [];

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            {t("Conectar por")} {estado?.label ?? t("provedor parceiro")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t(
              "Um número oficial (WhatsApp Business) conectado por um link de cadastro, sem conta no provedor. As mensagens entram e saem pelo CRM.",
            )}
          </p>
        </div>
        {numeros.length > 0 ? (
          <Badge variant="secondary">
            {numeros.length > 1 ? `${numeros.length} ${t("números conectados")}` : t("Conectado")}
          </Badge>
        ) : (
          <Badge variant="outline">{t("Não conectado")}</Badge>
        )}
      </div>

      {numeros.map((n) => (
        <div
          key={n.channel_session_id}
          data-testid="numero-link-de-cadastro"
          className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm"
        >
          <div>
            <p className="font-medium">{n.nome || t("Número conectado")}</p>
            <p className="text-xs text-muted-foreground">
              {n.phone_number ?? t("sem número informado")} · {n.status ?? "—"}
            </p>
          </div>
          <ChannelAiAccess channelId={n.channel_session_id} />
        </div>
      ))}
      {concluindo && (
        <p className="text-sm text-muted-foreground" role="status">
          {t("Concluindo a conexão…")}
        </p>
      )}

      {estado?.disponivel && (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{t("Como o número está hoje")}</legend>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="link-coexistencia"
                className="mt-1"
                checked={coexistencia}
                onChange={() => setCoexistencia(true)}
              />
              <span>
                {t("O número já usa o app WhatsApp Business")}
                <span className="block text-xs text-muted-foreground">
                  {t("Continua funcionando no celular. A Meta mostra um QR para escanear com o app.")}
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="link-coexistencia"
                className="mt-1"
                checked={!coexistencia}
                onChange={() => setCoexistencia(false)}
              />
              <span>
                {t("Número novo, ou que já está na API oficial")}
                <span className="block text-xs text-muted-foreground">{t("Só pelo CRM, sem o app no celular.")}</span>
              </span>
            </label>
          </fieldset>
          <div>
            <Button onClick={abrir} disabled={abrindo || concluindo}>
              {abrindo ? t("Abrindo…") : numeros.length > 0 ? t("Conectar outro número") : t("Conectar meu WhatsApp")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
