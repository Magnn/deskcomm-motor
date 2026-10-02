/**
 * O que entra pelas rotas de lançamento — e o que um disparo pode carregar.
 *
 * Os itens do disparo são um SUBCONJUNTO dos itens da caixa de Conteúdo do fluxo
 * (`conteudoItemSchema`): texto, imagem, vídeo, áudio, documento e pausa. Contato,
 * figurinha, cobrança e modelo ficam de fora — não fazem sentido para um grupo, ou
 * o WhatsApp por QR code não os entrega em grupo. Mídia é sempre um caminho no
 * bucket (nunca URL): quem sobe é a rota de mídia do lançamento.
 */
import { z } from "zod";

import { LOTACAO_PADRAO, TETO_DO_WHATSAPP } from "./regras";

const midia = {
  storage_path: z.string().min(1).max(500),
  mime: z.string().min(1).max(120),
};

export const itemDoDisparoSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), body: z.string().trim().min(1).max(4000) }),
  z.strictObject({ type: z.literal("image"), ...midia, caption: z.string().max(1024).optional() }),
  z.strictObject({ type: z.literal("video"), ...midia, caption: z.string().max(1024).optional() }),
  z.strictObject({ type: z.literal("audio"), ...midia }),
  z.strictObject({
    type: z.literal("document"),
    ...midia,
    filename: z.string().min(1).max(240).optional(),
    caption: z.string().max(1024).optional(),
  }),
  z.strictObject({ type: z.literal("delay"), seconds: z.number().int().min(1).max(60) }),
]);
export type ItemDoDisparo = z.infer<typeof itemDoDisparoSchema>;

export const MAXIMO_DE_ITENS_DO_DISPARO = 12;

/** Lista de itens: ao menos um que DIZ algo — um disparo só de pausas não manda nada. */
export const itensDoDisparoSchema = z
  .array(itemDoDisparoSchema)
  .min(1)
  .max(MAXIMO_DE_ITENS_DO_DISPARO)
  .refine((itens) => itens.some((i) => i.type !== "delay"), "O disparo precisa de ao menos uma mensagem.");

export const criarLancamentoSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  channel_session_id: z.string().uuid(),
  group_name_template: z.string().trim().min(2).max(90),
  group_description: z.string().trim().max(2000).optional(),
  group_capacity: z.number().int().min(2).max(TETO_DO_WHATSAPP).default(LOTACAO_PADRAO),
  admins_only: z.boolean().default(true),
  /** Um segundo número do dono: o WhatsApp não cria grupo de uma pessoa só. */
  seed_participant: z.string().trim().min(8).max(30),
});
export type CriarLancamentoInput = z.infer<typeof criarLancamentoSchema>;

export const atualizarLancamentoSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(120).optional(),
    status: z.enum(["active", "paused", "archived"]).optional(),
    group_capacity: z.number().int().min(2).max(TETO_DO_WHATSAPP).optional(),
    group_description: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nada para atualizar.");

export const criarDisparoSchema = z.strictObject({
  items: itensDoDisparoSchema,
  /** ISO. Ausente = agora. */
  scheduled_at: z.string().datetime({ offset: true }).optional(),
});
