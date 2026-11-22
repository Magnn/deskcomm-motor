"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  conectarOutroAppDaMeta,
  desconectarOutroAppDaMeta,
  type ConectarOutroAppResult,
  type DesconectarOutroAppResult,
} from "@/app/actions/settings/outrosAppsDaMeta";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";

export interface OutroApp {
  readonly appId: string;
  readonly desde: string | null;
  readonly numeros: number;
}

/**
 * Apps de outros portfólios que a instalação aceita AO LADO do principal — e os
 * que já foram o principal. Para a instalação, os dois são a mesma coisa: a chave
 * deles confere os avisos dos números que entraram por eles.
 *
 * Nenhum segredo chega aqui: a lista traz o ID (que não é segredo), a data e
 * quantos números usam o app.
 */
export function OutrosAppsDaMeta({ apps, principal }: { apps: readonly OutroApp[]; principal: string | null }) {
  const t = useT();
  const router = useRouter();
  const [appId, setAppId] = useState("");
  const [chave, setChave] = useState("");
  const [ocupado, iniciar] = useTransition();

  function conectar() {
    iniciar(async () => {
      const r = await conectarOutroAppDaMeta({ app_id: appId, app_secret: chave });
      if (!r.ok) {
        toast.error(motivoDoConectar(r));
        return;
      }
      setAppId("");
      setChave("");
      if (r.passos && r.passos.every((p) => p.ok)) toast.success(t("App conectado e ativado na Meta."));
      else if (r.passos) toast.error(t("App conectado, mas a Meta recusou parte da ativação. Confira o webhook no painel do app."));
      else toast.error(t("App conectado, mas falta ativar o webhook: a instalação ainda não tem endereço público ou token de verificação."));
      router.refresh();
    });
  }

  function desconectar(id: string) {
    iniciar(async () => {
      const r = await desconectarOutroAppDaMeta(id);
      if (!r.ok) {
        toast.error(motivoDoDesconectar(r));
        return;
      }
      toast.success(t("App desconectado."));
      router.refresh();
    });
  }

  function motivoDoConectar(r: Extract<ConectarOutroAppResult, { ok: false }>): string {
    switch (r.error) {
      case "invalid_input":
        return t("Confira o ID (só números) e a chave secreta do app.");
      case "e_o_principal":
        return t("Este já é o app principal da instalação.");
      case "app_recusado_pela_meta":
        return `${t("A Meta não reconheceu este ID com esta chave.")}${r.motivo ? ` (${r.motivo})` : ""}`;
      case "cifra_indisponivel":
        return t("A cifra desta instalação não está configurada; nada foi gravado.");
      default:
        return t("Não deu para gravar. Tente de novo.");
    }
  }

  function motivoDoDesconectar(r: Extract<DesconectarOutroAppResult, { ok: false }>): string {
    if (r.error === "app_com_numeros") {
      return `${t("Este app ainda tem números ativos. Desconecte os números antes:")} ${r.numeros ?? ""}`.trim();
    }
    return t("Não deu para desconectar. Tente de novo.");
  }

  const podeConectar = /^\d{5,25}$/.test(appId.trim()) && chave.trim().length >= 16 && !ocupado;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 pb-6">
      <Card className="flex flex-col gap-4 p-4" data-testid="meta-outros-apps">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium">{t("Outros apps conectados")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("Apps de outros portfólios atendidos por esta instalação, sem trocar o principal. Cada número colado com o token de um desses apps passa a ser conferido pela chave dele.")}
          </p>
        </div>

        {apps.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-md border text-sm">
            {apps.map((a) => (
              <li key={a.appId} className="flex items-center justify-between gap-3 p-3" data-testid={`meta-outro-app-${a.appId}`}>
                <div className="flex flex-col">
                  <span className="font-mono">{a.appId}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.numeros === 1 ? t("1 número ativo") : `${a.numeros} ${t("números ativos")}`}
                    {a.desde ? ` · ${t("desde")} ${a.desde}` : ""}
                  </span>
                </div>
                <Button variant="outline" size="sm" disabled={ocupado || a.numeros > 0} onClick={() => desconectar(a.appId)}>
                  {t("Desconectar")}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("Nenhum outro app conectado.")}</p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meta-outro-app-id">{t("ID do aplicativo")}</Label>
          <Input
            id="meta-outro-app-id"
            data-testid="meta-outro-app-id"
            inputMode="numeric"
            autoComplete="off"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meta-outro-app-secret">{t("Chave secreta do aplicativo")}</Label>
          <Input
            id="meta-outro-app-secret"
            data-testid="meta-outro-app-secret"
            type="password"
            autoComplete="off"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            placeholder={t("32 letras e números")}
          />
          <p className="text-xs text-muted-foreground">
            {principal
              ? t("O webhook do app é apontado para esta instalação com o mesmo token de verificação do principal.")
              : t("Cadastre primeiro o app principal acima.")}
          </p>
        </div>
        <div>
          <Button data-testid="meta-outro-app-conectar" disabled={!podeConectar || !principal} onClick={conectar}>
            {ocupado ? t("Conectando…") : t("Conectar app")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
