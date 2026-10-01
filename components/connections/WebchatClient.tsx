"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, Check, PaperPlaneTilt, Sparkle, ChatCircle } from "@/lib/ui/icons";
import { WebchatEmbedDialog } from "./WebchatEmbedDialog";
import { type WebchatConfig, webchatConfigSchema } from "@/lib/channels/webchat/schema";

const DEFAULT_WEBCHAT: WebchatConfig = {
  id: "webchat-padrao",
  name: "Webchat Principal",
  brandColor: "#0ea5e9",
  title: "Atendimento Deskcomm",
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

export function WebchatClient() {
  const [config, setConfig] = useState<WebchatConfig>(DEFAULT_WEBCHAT);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    try {
      const parsed = webchatConfigSchema.parse(config);
      setConfig(parsed);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch {
      // error handled by schema
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-7 space-y-6">
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Globe className="h-5 w-5 text-sky-500" />
                  Widget de Webchat para seu Site
                </CardTitle>
                <CardDescription>
                  Incorpore o atendimento em tempo real do Deskcomm e IA diretamente no seu website ou loja virtual.
                </CardDescription>
              </div>
              <WebchatEmbedDialog webchat={config} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="font-medium text-sm">Canal Webchat Ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Quando desativado, o botão do chat não será exibido para visitantes do site.
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
                  Nome do Canal
                </Label>
                <Input
                  id="webchat-name"
                  value={config.name}
                  onChange={(e) => setConfig({ ...config, name: e.target.value })}
                  placeholder="Ex: Chat Landing Page"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="webchat-color" className="text-xs font-semibold uppercase text-muted-foreground">
                  Cor da Marca (Hex)
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="webchat-color-picker"
                    value={config.brandColor}
                    onChange={(e) => setConfig({ ...config, brandColor: e.target.value })}
                    className="h-9 w-10 cursor-pointer rounded border p-0.5"
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
                  Título do Cabeçalho
                </Label>
                <Input
                  id="webchat-title"
                  value={config.title}
                  onChange={(e) => setConfig({ ...config, title: e.target.value })}
                  placeholder="Ex: Atendimento Deskcomm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="webchat-subtitle" className="text-xs font-semibold uppercase text-muted-foreground">
                  Subtítulo de Status
                </Label>
                <Input
                  id="webchat-subtitle"
                  value={config.subtitle}
                  onChange={(e) => setConfig({ ...config, subtitle: e.target.value })}
                  placeholder="Ex: Online agora"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webchat-greeting" className="text-xs font-semibold uppercase text-muted-foreground">
                Mensagem Inicial de Boas-Vindas
              </Label>
              <Textarea
                id="webchat-greeting"
                rows={3}
                value={config.greetingMessage}
                onChange={(e) => setConfig({ ...config, greetingMessage: e.target.value })}
                placeholder="Mensagem exibida assim que o visitante abrir a janela do chat..."
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="font-medium text-sm">Permitir em Qualquer Domínio</Label>
                <p className="text-xs text-muted-foreground">
                  Desmarque caso queira restringir o carregamento apenas para domínios específicos autorizados.
                </p>
              </div>
              <Switch
                checked={config.allowAnyDomain}
                onCheckedChange={(checked) => setConfig({ ...config, allowAnyDomain: checked })}
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} className="gap-2">
                <Check className="h-4 w-4" />
                {savedSuccess ? "Configurações Salvas!" : "Salvar Configurações"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pré-visualização em Tempo Real do Widget */}
      <div className="lg:col-span-5 space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pré-visualização ao Vivo
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Ao Vivo
            </span>
          </div>

          {/* Janela de Demonstração */}
          <div className="relative mx-auto flex h-[480px] w-full max-w-[340px] flex-col overflow-hidden rounded-2xl border border-border shadow-xl bg-background">
            {/* Header com cor personalizada */}
            <div
              className="flex items-center justify-between p-4 text-white shadow-sm"
              style={{ backgroundColor: config.brandColor }}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white font-semibold">
                  <Sparkle className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold leading-tight">{config.title || "Atendimento"}</h4>
                  <p className="text-[11px] text-white/80">{config.subtitle || "Online"}</p>
                </div>
              </div>
            </div>

            {/* Balões de Chat */}
            <div className="flex-1 space-y-3 p-3 overflow-y-auto bg-muted/20 text-xs">
              <div className="flex gap-2 items-start">
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white text-[10px]"
                  style={{ backgroundColor: config.brandColor }}
                >
                  IA
                </div>
                <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-card p-3 shadow-sm border border-border text-foreground">
                  {config.greetingMessage || "Olá! Como podemos te ajudar?"}
                </div>
              </div>

              <div className="flex justify-end">
                <div
                  className="max-w-[80%] rounded-2xl rounded-tr-sm p-3 text-white shadow-sm"
                  style={{ backgroundColor: config.brandColor }}
                >
                  Olá! Gostaria de saber mais sobre a integração com CRM e WhatsApp.
                </div>
              </div>
            </div>

            {/* Input Footer */}
            <div className="border-t border-border p-2.5 bg-card flex items-center gap-2">
              <Input
                readOnly
                placeholder={config.placeholderText}
                className="h-8 text-xs bg-muted/30 border-muted"
              />
              <Button
                size="icon"
                className="h-8 w-8 shrink-0 text-white"
                style={{ backgroundColor: config.brandColor }}
              >
                <PaperPlaneTilt className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <p className="mt-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <ChatCircle className="h-3.5 w-3.5 text-primary" />
            O botão flutuante aparecerá no canto inferior do site do cliente.
          </p>
        </div>
      </div>
    </div>
  );
}
