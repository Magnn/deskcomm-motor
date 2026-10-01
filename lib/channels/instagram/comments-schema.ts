import { z } from "zod";

/**
 * Esquema de automação de comentários do Instagram (Comment-to-DM).
 * Permite responder automaticamente a comentários em posts e disparar DMs / fluxos.
 */
export const instagramCommentAutomationSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  name: z.string().min(2, "Nome da regra é obrigatório"),
  isActive: z.boolean().default(true),
  // Seleção de posts: todos os posts da conta ou lista de mediaIds
  postScope: z.enum(["all_posts", "specific_posts"]).default("all_posts"),
  postIds: z.array(z.string()).default([]),
  
  // Regra de correspondência de palavras-chave
  matchType: z.enum(["any_comment", "contains_any", "exact_match", "regex"]).default("contains_any"),
  keywords: z.array(z.string().trim().toLowerCase()).default([]),
  
  // Ação 1: Curtir comentário
  autoLikeComment: z.boolean().default(true),
  
  // Ação 2: Resposta pública no comentário (suporta múltiplas variações rotativas para evitar spam da Meta)
  sendPublicReply: z.boolean().default(true),
  publicReplyVariations: z.array(z.string().min(1)).min(1, "Adicione pelo menos uma resposta pública").default([
    "Te enviei uma mensagem no direct! Dá uma olhadinha lá 🚀",
    "Acabei de te mandar todos os detalhes no direct! Confere lá 😉",
    "Pronto! Veja seu direct que enviei o link para você! ✨",
  ]),
  
  // Ação 3: Mensagem direta (DM) privada
  sendPrivateDm: z.boolean().default(true),
  dmMessage: z.string().min(1, "Mensagem no direct é obrigatória").default("Olá! Vi seu comentário no nosso post. Aqui está o que você pediu:"),
  
  // Ação 4: Fluxo de automação / Agente Deskcomm
  flowId: z.string().optional(),
  agentId: z.string().optional(),
  
  // Ação 5: Atribuir tag no CRM
  applyTags: z.array(z.string()).default([]),
  
  createdAt: z.string().default(() => new Date().toISOString()),
});

export type InstagramCommentAutomation = z.infer<typeof instagramCommentAutomationSchema>;

/**
 * Verifica se um texto de comentário aciona a regra de palavras-chave.
 */
export function matchesCommentRule(
  commentText: string,
  rule: Pick<InstagramCommentAutomation, "matchType" | "keywords">
): boolean {
  if (rule.matchType === "any_comment") {
    return true;
  }

  const normalizedComment = commentText.trim().toLowerCase();
  if (!normalizedComment) return false;

  if (rule.matchType === "contains_any") {
    return rule.keywords.some((kw) => normalizedComment.includes(kw.toLowerCase()));
  }

  if (rule.matchType === "exact_match") {
    return rule.keywords.some((kw) => normalizedComment === kw.toLowerCase());
  }

  if (rule.matchType === "regex") {
    return rule.keywords.some((pattern) => {
      try {
        const regex = new RegExp(pattern, "i");
        return regex.test(normalizedComment);
      } catch {
        return false;
      }
    });
  }

  return false;
}

/**
 * Seleciona uma resposta pública rotativa aleatória dentre as variações cadastradas.
 */
export function pickPublicReply(variations: string[]): string {
  if (!variations || variations.length === 0) return "";
  const index = Math.floor(Math.random() * variations.length);
  return variations[index] || "";
}
