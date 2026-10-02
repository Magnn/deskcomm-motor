/** O que entra pelas rotas das regras de "comentou, recebe direct". */
import { z } from "zod";

import { ESCOPO_DAS_PUBLICACOES, TIPO_DE_CASAMENTO } from "./regras";

const palavra = z.string().trim().min(1).max(80);
const resposta = z.string().trim().min(1).max(300);

const campos = {
  name: z.string().trim().min(2).max(120),
  connection_id: z.string().uuid(),
  is_active: z.boolean(),
  post_scope: z.enum(ESCOPO_DAS_PUBLICACOES),
  post_ids: z.array(z.string().trim().min(1).max(64)).max(50),
  match_type: z.enum(TIPO_DE_CASAMENTO),
  keywords: z.array(palavra).max(30),
  // O teto do direct do Instagram é 1000 caracteres.
  dm_message: z.string().trim().min(1).max(1000),
  public_replies: z.array(resposta).max(10),
};

/** As duas incoerências que fariam a regra existir sem nunca atender ninguém. */
function coerente(
  v: { post_scope?: string; post_ids?: string[]; match_type?: string; keywords?: string[] },
  ctx: z.RefinementCtx,
) {
  if (v.post_scope === "specific" && (v.post_ids?.length ?? 0) === 0) {
    ctx.addIssue({ code: "custom", path: ["post_ids"], message: "Escolha ao menos uma publicação." });
  }
  if (v.match_type !== undefined && v.match_type !== "any" && (v.keywords?.length ?? 0) === 0) {
    ctx.addIssue({ code: "custom", path: ["keywords"], message: "Informe ao menos uma palavra." });
  }
}

export const criarRegraSchema = z
  .strictObject({
    ...campos,
    is_active: campos.is_active.default(true),
    post_scope: campos.post_scope.default("all"),
    post_ids: campos.post_ids.default([]),
    match_type: campos.match_type.default("contains"),
    keywords: campos.keywords.default([]),
    public_replies: campos.public_replies.default([]),
  })
  .superRefine(coerente);
export type CriarRegraInput = z.infer<typeof criarRegraSchema>;

/** Edição: a regra INTEIRA volta (menos a conta, que não muda), para a coerência ser conferida de uma vez. */
export const atualizarRegraSchema = z
  .strictObject({
    name: campos.name,
    is_active: campos.is_active,
    post_scope: campos.post_scope,
    post_ids: campos.post_ids,
    match_type: campos.match_type,
    keywords: campos.keywords,
    dm_message: campos.dm_message,
    public_replies: campos.public_replies,
  })
  .superRefine(coerente);
