import { cookies, headers } from "next/headers";

import { idiomaDaAreaOuNulo, idiomaDaAreaPeloCabecalho, type IdiomaDaArea } from "./area";

/** O cookie que guarda a escolha de idioma de quem trocou na própria área. */
export const COOKIE_DO_IDIOMA_DA_AREA = "area_idioma";

/**
 * O idioma de quem abre a área do cliente: a escolha guardada no cookie e, sem ela, o `Accept-Language` do
 * navegador. Server-only (`next/headers`); a regra pura está em `area.ts`.
 */
export async function idiomaDaArea(): Promise<IdiomaDaArea> {
  const escolhido = idiomaDaAreaOuNulo((await cookies()).get(COOKIE_DO_IDIOMA_DA_AREA)?.value);
  if (escolhido) return escolhido;
  return idiomaDaAreaPeloCabecalho((await headers()).get("accept-language"));
}

/** O mesmo, sem quebrar fora de uma requisição (teste, rodada agendada): aí é português. */
export async function idiomaDaAreaOuPortugues(): Promise<IdiomaDaArea> {
  try {
    return await idiomaDaArea();
  } catch {
    return "pt-BR";
  }
}
