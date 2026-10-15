/**
 * Guarda no contato o e-mail que veio do pagamento — é a chave com que o
 * comprador entra de novo na área do cliente, por código, de qualquer aparelho.
 *
 * Só preenche o vazio: o e-mail que o contato já tem fica. E-mail que já é de
 * outro contato da mesma empresa (índice único em `email_normalized`) não é
 * forçado — mudar de dono a chave de entrada não é decisão de um aviso de
 * pagamento.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function guardarEmailDoContato(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  email: string,
): Promise<"guardado" | "ja_tinha" | "de_outro_contato"> {
  const { data, error } = await admin
    .from("contacts")
    .update({ email: email.trim().toLowerCase() })
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .is("email", null)
    .select("id");
  if (error) {
    if (error.code === "23505") return "de_outro_contato";
    throw new Error(error.message);
  }
  return data && data.length > 0 ? "guardado" : "ja_tinha";
}
