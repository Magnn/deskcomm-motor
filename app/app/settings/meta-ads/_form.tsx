"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  disconnectAdInsights,
  updateAdInsightsConnection,
} from "@/app/actions/settings/updateAdInsightsConnection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMetaAdAccounts } from "@/hooks/ads/useMetaAds";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

/**
 * Cada recusa vira uma frase que diz O QUE FAZER — mesma regra do formulário de
 * Conversões. `cifra_indisponivel` é a que mais importa acertar: é problema de
 * INSTALAÇÃO, e um texto genérico mandaria o admin do tenant refazer um cadastro
 * que já está certo, para falhar igual.
 */
const ERRO_EM_PORTUGUES: Record<string, string> = {
  validation_failed: "Confira os campos: algum valor não está no formato esperado.",
  unauthenticated: "Sua sessão expirou. Entre de novo.",
  forbidden_tenant: "Você não está em nenhuma organização ativa.",
  forbidden_role: "Só um administrador da organização pode mudar esta conexão.",
  mfa_required: "Confirme o segundo fator para salvar esta mudança.",
  cifra_indisponivel:
    "Esta instalação está sem a chave mestra de criptografia, e o token não foi gravado. Quem instalou o sistema precisa configurá-la — refazer o cadastro aqui não resolve.",
  erro_ao_gravar: "Não consegui gravar agora. Tente de novo em instantes.",
};

/** Para onde o botão manda o navegador — uma navegação, não uma chamada de API. */
const CONECTAR_COM_FACEBOOK = "/api/v1/plataformas-de-anuncio/meta/connect";

export function FormularioDeMetaAds({
  conectada,
  contaPadrao,
  loginDisponivel,
  idioma,
}: {
  conectada: boolean;
  contaPadrao: string | null;
  /** O app da Meta desta instalação tem o que o login do Facebook exige. */
  loginDisponivel: boolean;
  idioma: Idioma;
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [token, setToken] = useState("");
  const [conta, setConta] = useState(contaPadrao ?? "");

  // A lista vem do token guardado: quem conectou escolhe pelo NOME da conta, em
  // vez de procurar um `act_…` no gerenciador de anúncios para digitar aqui.
  const contas = useMetaAdAccounts(conectada);
  const listaDeContas = contas.data?.data.contas ?? [];

  function escolherConta(id: string) {
    setConta(id);
    startTransition(async () => {
      const resultado = await updateAdInsightsConnection({ platform: "meta_ads", default_account_id: id });
      if (resultado.ok) {
        toast.success(t("Conta escolhida."));
        router.refresh();
        return;
      }
      toast.error(t(ERRO_EM_PORTUGUES[resultado.error] ?? "Não consegui salvar agora."));
    });
  }

  function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    startTransition(async () => {
      const resultado = await updateAdInsightsConnection({
        platform: "meta_ads",
        access_token: token.trim() || undefined,
      });

      if (resultado.ok) {
        // O campo é limpo no sucesso: deixá-lo preenchido dá a impressão de que
        // a tela guarda o token, e ela nunca o mostra de volta.
        setToken("");
        toast.success(t("Conexão salva."));
        router.refresh();
        return;
      }
      toast.error(t(ERRO_EM_PORTUGUES[resultado.error] ?? "Não consegui salvar agora."));
    });
  }

  function desconectar() {
    startTransition(async () => {
      const resultado = await disconnectAdInsights();
      if (resultado.ok) {
        setToken("");
        setConta("");
        toast.success(t("Conta desconectada."));
        router.refresh();
        return;
      }
      toast.error(t(ERRO_EM_PORTUGUES[resultado.error] ?? "Não consegui desconectar agora."));
    });
  }

  const formularioDoToken = (
    <form onSubmit={salvar} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="access_token">{t("Token de acesso")}</Label>
        <Input
          id="access_token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={conectada ? t("Guardado — preencha só para trocar") : "EAA…"}
        />
        <p className="text-xs text-muted-foreground">
          {conectada
            ? t(
                "Já existe um token guardado. Deixe em branco para mantê-lo, ou cole um novo para substituir.",
              )
            : t("Precisa da permissão ads_read.")}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant={loginDisponivel ? "outline" : "default"}
          disabled={isPending || token.trim().length < 20}
        >
          {isPending ? t("Salvando…") : t("Salvar")}
        </Button>
        {token.trim().length < 20 && (
          <span className="text-sm text-muted-foreground">{t("Cole o token para poder salvar.")}</span>
        )}
      </div>
    </form>
  );

  return (
    <Card className="flex flex-col gap-6 p-6">
      {loginDisponivel && (
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant={conectada ? "outline" : "default"}>
            {/* `<a>` e não `router.push`: a rota responde com um redirect para o Facebook. */}
            <a href={CONECTAR_COM_FACEBOOK}>
              {conectada ? t("Reconectar com Facebook") : t("Conectar com Facebook")}
            </a>
          </Button>
          {!conectada && (
            <span className="text-sm text-muted-foreground">
              {t("Você entra no Facebook, autoriza a leitura e volta para cá com a conta já conectada.")}
            </span>
          )}
        </div>
      )}

      {conectada && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="default_account_id">{t("Conta de anúncios")}</Label>
          {contas.error ? (
            <p className="text-sm text-destructive">
              {loginDisponivel
                ? t("A conexão não está mais valendo — ela expirou ou foi revogada. Reconecte com o Facebook.")
                : t("A conexão não está mais valendo — ela expirou ou foi revogada. Cole um token novo abaixo.")}
            </p>
          ) : (
            <Select
              value={conta}
              onValueChange={escolherConta}
              disabled={isPending || listaDeContas.length === 0}
            >
              <SelectTrigger id="default_account_id" className="w-full max-w-md">
                <SelectValue placeholder={contas.isLoading ? t("Carregando…") : t("Escolha a conta")} />
              </SelectTrigger>
              <SelectContent>
                {listaDeContas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">
            {t("A conta que a tela de Meta Ads abre por padrão. A escolha vale assim que você seleciona.")}
          </p>
        </div>
      )}

      {loginDisponivel ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {t("Conectar colando um token (avançado)")}
          </summary>
          <div className="pt-4">{formularioDoToken}</div>
        </details>
      ) : (
        formularioDoToken
      )}

      {conectada && (
        <div className="flex flex-col gap-2 border-t pt-4">
          <div>
            <Button type="button" variant="outline" disabled={isPending} onClick={desconectar}>
              {t("Desconectar")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {/*
              Desconectar APAGA a linha — não existe "pausar" nesta feature, e o
              porquê está no cabeçalho da 0214: como nada roda sozinho, um estado
              "conectado mas desligado" teria a mesma consequência visível de não
              estar conectado.
            */}
            {t(
              "Desconectar apaga o token guardado. A tela de Meta Ads volta a pedir uma conexão, e nenhum dado histórico é perdido — nada é armazenado aqui.",
            )}
          </p>
        </div>
      )}
    </Card>
  );
}
