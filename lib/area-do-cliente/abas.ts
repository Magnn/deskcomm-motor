/**
 * As abas da área do cliente (a barra do rodapé, em `app/c/[org]/_abas.tsx`).
 * Mora fora do arquivo do navegador porque a página do servidor também lê a
 * aba do endereço (`?aba=`) para abrir já na certa.
 */
export const ABAS_DA_AREA = ["hoje", "trabalho", "conversa", "explorar"] as const;
export type AbaDaArea = (typeof ABAS_DA_AREA)[number];

/** A aba do endereço, ou Hoje quando vem vazia ou desconhecida. */
export function abaValida(valor: string | undefined | null): AbaDaArea {
  return (ABAS_DA_AREA as readonly string[]).includes(valor ?? "") ? (valor as AbaDaArea) : "hoje";
}
