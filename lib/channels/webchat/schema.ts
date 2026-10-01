import { z } from "zod";

/**
 * Esquema de configuração de um widget Webchat para incorporação em sites de clientes.
 * Inspirado na arquitetura do ChatbotX adaptada ao ecossistema DeskcommCRM.
 */
export const webchatConfigSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  name: z.string().min(2, "Nome da conexão deve ter ao menos 2 caracteres"),
  brandColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Cor hex inválida").default("#0ea5e9"),
  title: z.string().min(1, "Título é obrigatório").default("Atendimento Deskcomm"),
  subtitle: z.string().default("Online agora para tirar suas dúvidas"),
  greetingMessage: z.string().default("Olá! Como podemos te ajudar hoje?"),
  placeholderText: z.string().default("Digite sua mensagem..."),
  avatarUrl: z.string().url().optional().or(z.literal("")),
  agentId: z.string().optional(),
  flowId: z.string().optional(),
  authorizedDomains: z.array(z.string().trim().toLowerCase()).default([]),
  allowAnyDomain: z.boolean().default(true),
  position: z.enum(["bottom_right", "bottom_left"]).default("bottom_right"),
  autoOpenDelaySeconds: z.number().int().min(0).max(120).default(0),
  showAgentAvatar: z.boolean().default(true),
  enableVoiceInput: z.boolean().default(false),
  enableAttachments: z.boolean().default(true),
  collectLeadBeforeChat: z.boolean().default(false),
  leadFields: z.object({
    requireName: z.boolean().default(true),
    requireEmail: z.boolean().default(true),
    requirePhone: z.boolean().default(false),
  }).default({
    requireName: true,
    requireEmail: true,
    requirePhone: false,
  }),
  isActive: z.boolean().default(true),
});

export type WebchatConfig = z.infer<typeof webchatConfigSchema>;

/**
 * Validador de domínio autorizado para requisições de origem do webchat.
 */
export function isDomainAuthorized(
  originOrHostname: string,
  config: Pick<WebchatConfig, "allowAnyDomain" | "authorizedDomains">
): boolean {
  if (config.allowAnyDomain) {
    return true;
  }

  if (!originOrHostname) {
    return false;
  }

  let hostname = originOrHostname.toLowerCase().trim();
  try {
    if (hostname.startsWith("http://") || hostname.startsWith("https://")) {
      hostname = new URL(hostname).hostname;
    }
  } catch {
    // continua com hostname original se URL parsing falhar
  }

  // Remove porta se houver (ex: localhost:3000 -> localhost)
  const cleanHost = (hostname.split(":")[0] || "").trim();
  if (!cleanHost) return false;

  return config.authorizedDomains.some((domain) => {
    const cleanDomain = (domain.toLowerCase().trim().split(":")[0] || "").trim();
    if (!cleanDomain) return false;
    if (cleanDomain === cleanHost) return true;
    // Suporte a wildcard: *.exemplo.com
    if (cleanDomain.startsWith("*.")) {
      const rootDomain = cleanDomain.slice(2);
      return cleanHost === rootDomain || cleanHost.endsWith(`.${rootDomain}`);
    }
    return false;
  });
}
