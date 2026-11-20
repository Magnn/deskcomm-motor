/**
 * O código do veto de conteúdo que derrubou a tentativa ANTERIOR deste job, lido do `last_error`
 * que o próprio turno escreve ao re-tentar ("turno terminou sem resposta depois do veto X").
 * `null` quando a tentativa anterior não caiu por veto (ou não houve tentativa anterior).
 */
export function vetoDeTentativaAnterior(lastError: string | null | undefined): string | null {
  const m = /turno terminou sem resposta depois do veto ([a-z_]+)/.exec(lastError ?? "");
  return m ? m[1]! : null;
}
