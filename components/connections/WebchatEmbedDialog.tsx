"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, Code, Globe, ArrowSquareOut } from "@/lib/ui/icons";
import { generateScriptEmbedCode, generateIframeEmbedCode, generateDirectChatUrl } from "@/lib/channels/webchat/embed-code";
import type { WebchatConfig } from "@/lib/channels/webchat/schema";

interface WebchatEmbedDialogProps {
  webchat: WebchatConfig;
  trigger?: React.ReactNode;
}

export function WebchatEmbedDialog({ webchat, trigger }: WebchatEmbedDialogProps) {
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://desk.atendimento.sbs";
  const scriptCode = generateScriptEmbedCode({ webchat, baseUrl: origin });
  const iframeCode = generateIframeEmbedCode({ webchat, baseUrl: origin });
  const directUrl = generateDirectChatUrl(webchat.id, origin);

  const handleCopy = async (text: string, type: "script" | "iframe" | "url") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "script") {
        setCopiedScript(true);
        setTimeout(() => setCopiedScript(false), 2000);
      } else if (type === "iframe") {
        setCopiedIframe(true);
        setTimeout(() => setCopiedIframe(false), 2000);
      } else {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      }
    } catch {
      // fallback
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Code className="h-4 w-4" />
            Código de Incorporação
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Instalar Webchat no seu Site
          </DialogTitle>
          <DialogDescription>
            Escolha como prefere adicionar o widget de atendimento ao seu site, landing page ou aplicativo.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="script" className="mt-3">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="script">Script Flutuante</TabsTrigger>
            <TabsTrigger value="iframe">Iframe Integrado</TabsTrigger>
            <TabsTrigger value="direct">Link Direto</TabsTrigger>
          </TabsList>

          <TabsContent value="script" className="space-y-4 pt-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Cole antes do fechamento da tag &lt;/body&gt;
                </Label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  onClick={() => handleCopy(scriptCode, "script")}
                >
                  {copiedScript ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedScript ? "Copiado!" : "Copiar Código"}
                </Button>
              </div>
              <Textarea
                readOnly
                value={scriptCode}
                rows={7}
                className="font-mono text-xs bg-muted/40 border-muted"
              />
            </div>
            <div className="rounded-lg bg-blue-500/10 p-3.5 text-xs text-blue-800 dark:text-blue-300">
              <span className="font-semibold">💡 Dica de Integração:</span> O widget flutuante aparecerá no canto {webchat.position === "bottom_right" ? "inferior direito" : "inferior esquerdo"} da tela com a cor de destaque personalizada ({webchat.brandColor}).
            </div>
          </TabsContent>

          <TabsContent value="iframe" className="space-y-4 pt-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Cole onde desejar incorporar o chat na página
                </Label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  onClick={() => handleCopy(iframeCode, "iframe")}
                >
                  {copiedIframe ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedIframe ? "Copiado!" : "Copiar Código"}
                </Button>
              </div>
              <Textarea
                readOnly
                value={iframeCode}
                rows={7}
                className="font-mono text-xs bg-muted/40 border-muted"
              />
            </div>
          </TabsContent>

          <TabsContent value="direct" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                URL direta de atendimento (compartilhável por link ou QR Code)
              </Label>
              <div className="flex gap-2">
                <Textarea
                  readOnly
                  value={directUrl}
                  rows={2}
                  className="font-mono text-xs bg-muted/40 border-muted resize-none"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 px-3 shrink-0"
                  onClick={() => handleCopy(directUrl, "url")}
                >
                  {copiedUrl ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="h-10 px-3 shrink-0"
                  onClick={() => window.open(directUrl, "_blank")}
                >
                  <ArrowSquareOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
