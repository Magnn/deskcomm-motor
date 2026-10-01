import type { WebchatConfig } from "./schema";

export interface EmbedCodeOptions {
  webchat: WebchatConfig;
  /**
   * A URL desta instalação. OBRIGATÓRIA, sem padrão: o código gerado é colado no
   * site de um cliente, e um domínio fixo aqui faria todo cliente apontar o
   * widget para a instalação de outra pessoa.
   */
  baseUrl: string;
  theme?: "light" | "dark" | "auto";
}

/**
 * Gera o snippet <script> para colar no HTML antes do </body>.
 */
export function generateScriptEmbedCode({
  webchat,
  baseUrl,
  theme = "auto",
}: EmbedCodeOptions): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  
  return `<!-- Webchat Widget -->
<script
  src="${cleanBase}/widget/webchat.js"
  data-webchat-id="${webchat.id}"
  data-color="${webchat.brandColor}"
  data-position="${webchat.position}"
  data-theme="${theme}"
  async
></script>`;
}

/**
 * Gera snippet de iframe responsivo para embutir diretamente em uma página.
 */
export function generateIframeEmbedCode({
  webchat,
  baseUrl,
}: EmbedCodeOptions): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const chatUrl = `${cleanBase}/webchat/${webchat.id}`;

  return `<!-- Webchat Iframe -->
<iframe
  src="${chatUrl}"
  width="100%"
  height="600"
  style="border: none; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);"
  allow="microphone; camera"
  title="${webchat.title}"
></iframe>`;
}

/**
 * Gera link direto compartilhável para atendimento via navegador.
 */
export function generateDirectChatUrl(
  webchatId: string,
  baseUrl: string,
): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `${cleanBase}/webchat/${webchatId}`;
}
