/**
 * Peças comuns às ações "pelo formulário" de `app/actions/auth/` — as que vão
 * DIRETO no `action` dos formulários de acesso, para o envio funcionar antes de
 * o JavaScript carregar (ver `tests/unit/credencial-nunca-na-url.test.ts`).
 *
 * Fora dos arquivos `"use server"` de propósito: lá só pode haver função async
 * exportada.
 */

/** Mensagem por campo, já no formato que a tela mostra (a 1ª de cada campo). */
export type ErrosDeCampo = Record<string, string>;

/**
 * Converte o `details` que as ações devolvem (`flatten().fieldErrors` do Zod:
 * campo → lista de mensagens) na primeira mensagem de cada campo. As mensagens
 * são as chaves do dicionário — quem traduz é a tela, com `t()`.
 */
export function errosDeCampo(details: Record<string, unknown> | undefined): ErrosDeCampo | undefined {
  if (!details) return undefined;
  const campos: ErrosDeCampo = {};
  for (const [campo, mensagens] of Object.entries(details)) {
    if (Array.isArray(mensagens) && typeof mensagens[0] === "string") campos[campo] = mensagens[0];
  }
  return Object.keys(campos).length > 0 ? campos : undefined;
}

/** Texto de um campo do FormData, sem `null` (campo ausente = ""). */
export function campoDeTexto(dados: FormData, nome: string): string {
  const valor = dados.get(nome);
  return typeof valor === "string" ? valor : "";
}
