"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { Globe, Check, PaperPlaneTilt, Sparkle, ChatCircle, Warning } from "@/lib/ui/icons";
import { type WebchatConfig } from "@/lib/channels/webchat/schema";

const DEFAULT_WEBCHAT: WebchatConfig = {
  id: "webchat-padrao",
  name: "Webchat Principal",
  brandColor: "#0ea5e9",
  title: "Atendimento",
  subtitle: "Online agora para tirar suas dúvidas",
  greetingMessage: "Olá! Como podemos te ajudar hoje? Digite sua dúvida abaixo:",
  placeholderText: "Digite sua mensagem...",
  position: "bottom_right",
  autoOpenDelaySeconds: 0,
  showAgentAvatar: true,
  enableVoiceInput: false,
  enableAttachments: true,
  collectLeadBeforeChat: false,
  leadFields: {
    requireName: true,
    requireEmail: true,
    requirePhone: false,
  },
  allowAnyDomain: true,
  authorizedDomains: [],
  isActive: true,
};

/**
 * Aba "Webchat" das Conexões — hoje é só a PRÉVIA VISUAL do widget.
 *
 * Ainda não existe servidor por trás: a configuração não é gravada em lugar
 * nenhum e o widget não entrega mensagem ao atendimento. Por isso a tela diz
 * isso em cima, o "Salvar" fica desabilitado com o motivo à vista, e o código de
 * incorporação não é oferecido — instalar no site de um cliente um chat que não
 * chega a ninguém seria pior do que não ter o canal. Quando o backend do canal
 * existir, o aviso sai e o `WebchatEmbedDialog` volta para o cabeçalho.
 */
export function WebchatClient() {
  const t = useT();
  const [config, setConfig] = useState<WebchatConfig>(DEFAULT_WEBCHAT);
  const motivo = t("Em construção: a configuração do webchat ainda não é salva.");

  return (
    <div className="space-y-4">
      <div
        className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning-bg p-3 text-sm text-warning-fg"
        role="status"
        data-testid="webchat-em-construcao"
      >
        <Warning size={16} aria-hidden className="mt-0.5 shrink-0" />
        <p>
          {t(
            "O canal Webchat está em construção. Esta tela mostra só a prévia visual: a configuração ainda não é salva e o widget ainda não entrega mensagens ao atendimento.",
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Globe className="h-5 w-5 text-sky-500" />
                {t("Widget de Webchat para seu Site")}
              </CardTitle>
              <CardDescription>
                {t("Incorpore o atendimento em tempo real diretamente no seu website ou loja virtual.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="font-medium text-sm">{t("Canal Webchat Ativo")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("Quando desativado, o botão do chat não será exibido para visitantes do site.")}
                  </p>
                </div>
                <Switch
                  checked={config.isActive}
                  onCheckedChange={(checked) => setConfig({ ...config, isActive: checked })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="webchat-name" className="text-xs font-semibold uppercase text-muted-foreground">
                    {t("Nome do Canal")}
                  </Label>
                  <Input
                    id="webchat-name"
                    value={config.name}
                    onChange={(e) => setConfig({ ...config, name: e.target.value })}
                    placeholder={t("Ex: Chat Landing Page")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="webchat-color" className="text-xs font-semibold uppercase text-muted-foreground">
                    {t("Cor da Marca (Hex)")}
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      id="webchat-color-picker"
                      value={config.brandColor}
                      onChange={(e) => setConfig({ ...config, brandColor: e.target.value })}
                      className="h-9 w-10 cursor-pointer rounded-md border p-0.5"
                    />
                    <Input
                      id="webchat-color"
                      value={config.brandColor}
                      onChange={(e) => setConfig({ ...config, brandColor: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="webchat-title" className="text-xs font-semibold uppercase text-muted-foreground">
                    {t("Título do Cabeçalho")}
                  </Label>
                  <Input
                    id="webchat-title"
                    value={config.title}
                    onChange={(e) => setConfig({ ...config, title: e.target.value })}
                    placeholder={t("Ex: Atendimento da loja")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="webchat-subtitle" className="text-xs font-semibold uppercase text-muted-foreground">
                    {t("Subtítulo de Status")}
                  </Label>
                  <Input
                    id="webchat-subtitle"
                    value={config.subtitle}
                    onChange={(e) => setConfig({ ...config, subtitle: e.target.value })}
                    placeholder={t("Ex: Online agora")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webchat-greeting" className="text-xs font-semibold uppercase text-muted-foreground">
                  {t("Mensagem Inicial de Boas-Vindas")}
                </Label>
                <Textarea
                  id="webchat-greeting"
                  rows={3}
                  value={config.greetingMessage}
                  onChange={(e) => setConfig({ ...config, greetingMessage: e.target.value })}
                  placeholder={t("Mensagem exibida assim que o visitante abrir a janela do chat...")}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="font-medium text-sm">{t("Permitir em Qualquer Domínio")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("Desmarque caso queira restringir o carregamento apenas para domínios específicos autorizados.")}
                  </p>
                </div>
                <Switch
                  checked={config.allowAnyDomain}
                  onCheckedChange={(checked) => setConfig({ ...config, allowAnyDomain: checked })}
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button disabled title={motivo} className="gap-2">
                  <Check className="h-4 w-4" />
                  {t("Salvar Configurações")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Prévia visual do widget — reflete os campos ao lado, sem enviar nada. */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("Pré-visualização")}
              </span>
            </div>

            <div className="relative mx-auto flex h-[480px] w-full max-w-[340px] flex-col overflow-hidden rounded-2xl border border-border shadow-xl bg-background">
              <div
                className="flex items-center justify-between p-4 text-white shadow-sm"
                style={{ backgroundColor: config.brandColor }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white font-semibold">
                    <Sparkle className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold leading-tight">{config.title || t("Atendimento")}</h4>
                    <p className="text-[11px] text-white/80">{config.subtitle || t("Online")}</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-3 p-3 overflow-y-auto bg-muted/20 text-xs">
                <div className="flex gap-2 items-start">
                  <div
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white text-[10px]"
                    style={{ backgroundColor: config.brandColor }}
                  >
                    IA
                  </div>
                  <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-card p-3 shadow-sm border border-border text-foreground">
                    {config.greetingMessage || t("Olá! Como podemos te ajudar?")}
                  </div>
                </div>

                <div className="flex justify-end">
                  <div
                    className="max-w-[80%] rounded-2xl rounded-tr-sm p-3 text-white shadow-sm"
                    style={{ backgroundColor: config.brandColor }}
                  >
                    {t("Olá! Gostaria de saber mais sobre os planos.")}
                  </div>
                </div>
              </div>

              <div className="border-t border-border p-2.5 bg-card flex items-center gap-2">
                <Input
                  readOnly
                  placeholder={config.placeholderText}
                  className="h-8 text-xs bg-muted/30 border-muted"
                />
                <Button
                  size="icon"
                  disabled
                  title={t("Prévia visual: este botão não envia mensagens.")}
                  className="h-8 w-8 shrink-0 text-white"
                  style={{ backgroundColor: config.brandColor }}
                >
                  <PaperPlaneTilt className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <p className="mt-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
              <ChatCircle className="h-3.5 w-3.5 text-primary" />
              {t("O botão flutuante aparecerá no canto inferior do site do cliente.")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
